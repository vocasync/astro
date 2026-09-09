import { createHighlighter, type Highlighter } from "./highlighter.js";
import { resolveAudioSrc } from "./media-url.js";
import * as registry from "./registry.js";
import { registerSeekRoot } from "./seek-delegate.js";
import type { WordTiming } from "./timings.js";

/**
 * The player controller: everything the shipped component's inline script did, minus
 * the markup.
 *
 * Every element lookup is scoped to the region that owns it. The original resolved
 * `[data-action="play-pause"]` against the player root, which matches the main button
 * and the mini player's button, and relied on document order to pick the right one.
 * Nothing here reads a DOM `id`, so duplicate ids -- two players for one slug -- no
 * longer make two instances drive the same audio element.
 */

interface PlayerPayload {
  audioUrl?: string;
  words?: WordTiming[];
  duration?: number;
  publishableKey?: string;
}

export interface PlayerInstance {
  readonly root: HTMLElement;
  pause(): void;
  destroy(): void;
}

const SPEED_STEP_SELECTOR = "[data-speed]";

/** M:SS, matching the shipped player including its zero fallback. */
export function formatTime(seconds: unknown): string {
  if (typeof seconds !== "number" || !seconds || !Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function readPayload(root: HTMLElement): PlayerPayload | null {
  const script = root.querySelector("script.vocasync-data");
  if (!script) return null;
  try {
    const parsed = JSON.parse(script.textContent ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as PlayerPayload) : null;
  } catch {
    return null;
  }
}

export function createPlayer(root: HTMLElement): PlayerInstance | null {
  const doc = root.ownerDocument;
  const maybeView = doc.defaultView;
  const maybeAudio = root.querySelector("audio") as HTMLAudioElement | null;
  const maybeControls = root.querySelector('[data-state="ready"]') as HTMLElement | null;
  if (!maybeView || !maybeAudio || !maybeControls) return null;

  // Rebound as non-null so the narrowing holds inside the closures below.
  const view = maybeView;
  const audio: HTMLAudioElement = maybeAudio;
  const controlsEl: HTMLElement = maybeControls;

  const loadingEl = root.querySelector('[data-state="loading"]') as HTMLElement | null;
  const placeholderEl = root.querySelector('[data-state="no-audio"]') as HTMLElement | null;
  const miniEl = root.querySelector("[data-mini-player]") as HTMLElement | null;

  // Scoped so the mini player's duplicate hooks never shadow the main controls.
  const playBtn = controlsEl.querySelector('[data-action="play-pause"]') as HTMLElement | null;
  const progressInput = controlsEl.querySelector('[data-action="seek"]') as HTMLInputElement | null;
  const volumeInput = controlsEl.querySelector('[data-action="volume"]') as HTMLInputElement | null;
  const muteBtn = controlsEl.querySelector('[data-action="mute"]') as HTMLElement | null;
  const speedBtn = controlsEl.querySelector('[data-action="speed"]') as HTMLElement | null;
  const speedMenu = controlsEl.querySelector(".vocasync-player__speed-menu") as HTMLElement | null;
  const speedLabel = controlsEl.querySelector("[data-speed-label]") as HTMLElement | null;
  const highlightBtn = controlsEl.querySelector(
    '[data-action="toggle-highlighting"]'
  ) as HTMLElement | null;
  const currentTimeEl = controlsEl.querySelector('[data-time="current"]') as HTMLElement | null;
  const durationTimeEl = controlsEl.querySelector('[data-time="duration"]') as HTMLElement | null;

  const miniPlayBtn = miniEl?.querySelector('[data-action="play-pause"]') as HTMLElement | null;
  const miniCloseBtn = miniEl?.querySelector('[data-action="close-mini"]') as HTMLElement | null;
  const miniProgressBar = miniEl?.querySelector("[data-progress]") as HTMLElement | null;
  const miniTimeEl = miniEl?.querySelector('[data-time="current"]') as HTMLElement | null;

  const articleSelector = root.dataset.articleSelector || "[data-article-body]";
  const trailLength = Number.parseInt(root.dataset.trailLength ?? "", 10);
  const miniEnabled = root.dataset.enableMini === "true" && !!miniEl;
  const clickToSeekEnabled = root.dataset.enableClickToSeek === "true";

  let highlightingEnabled = root.dataset.enableHighlighting === "true";
  let isPlaying = false;
  let miniVisible = false;
  let miniDismissed = false;
  let animationFrame: number | null = null;
  let highlighter: Highlighter | null = null;
  let destroyed = false;

  const cleanups: Array<() => void> = [];

  function on<T extends EventTarget>(target: T | null, type: string, fn: EventListener) {
    if (!target) return;
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  }

  /* ---------------------------------------------------------------- rendering */

  function setState(state: "loading" | "no-audio" | "ready") {
    if (loadingEl) loadingEl.hidden = state !== "loading";
    if (placeholderEl) placeholderEl.hidden = state !== "no-audio";
    controlsEl.hidden = state !== "ready";
  }

  function swapIcons(scope: Element | null, showFirst: string, hideFirst: string, on_: boolean) {
    if (!scope) return;
    scope.querySelector(showFirst)?.classList.toggle("vocasync-hidden", on_);
    scope.querySelector(hideFirst)?.classList.toggle("vocasync-hidden", !on_);
  }

  function renderPlayState(playing: boolean) {
    swapIcons(playBtn, ".vocasync-icon--play", ".vocasync-icon--pause", playing);
    playBtn?.setAttribute("aria-label", playing ? "Pause" : "Play");
    swapIcons(miniPlayBtn, ".vocasync-icon--play", ".vocasync-icon--pause", playing);
  }

  /**
   * The shipped player passed `audio.volume === 0` when the slider moved and
   * `audio.muted` when the button was clicked, so the two could disagree: drag to
   * zero, mute, unmute, and the icon claimed sound was playing. Silence is silence.
   */
  function renderVolume() {
    const silent = audio.muted || audio.volume === 0;
    swapIcons(muteBtn, ".vocasync-icon--volume-high", ".vocasync-icon--volume-mute", silent);
  }

  function renderHighlightButton() {
    if (!highlightBtn) return;
    swapIcons(
      highlightBtn,
      ".vocasync-icon--highlight-on",
      ".vocasync-icon--highlight-off",
      !highlightingEnabled
    );
    highlightBtn.setAttribute("data-highlighting", highlightingEnabled ? "on" : "off");
    highlightBtn.setAttribute(
      "aria-label",
      highlightingEnabled ? "Disable word highlighting" : "Enable word highlighting"
    );
  }

  function renderProgress() {
    const t = audio.currentTime;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(t);
    if (progressInput) progressInput.value = String(t);
    if (miniTimeEl) miniTimeEl.textContent = formatTime(t);
    if (miniProgressBar) {
      const percent = audio.duration ? (t / audio.duration) * 100 : 0;
      miniProgressBar.style.width = `${Number.isFinite(percent) ? percent : 0}%`;
    }
  }

  /* -------------------------------------------------------------- highlighting */

  function updateHighlighting() {
    if (!highlightingEnabled) return;
    highlighter?.update(audio.currentTime);
  }

  function tick() {
    if (destroyed) return;
    // Driving the progress readout from the animation loop as well as `timeupdate`
    // makes the bar smooth; `timeupdate` alone fires about four times a second.
    renderProgress();
    updateHighlighting();
    if (!audio.paused && !audio.ended) {
      animationFrame = view.requestAnimationFrame(tick);
    }
  }

  function startLoop() {
    stopLoop();
    animationFrame = view.requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (animationFrame !== null) view.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function toggleHighlighting() {
    highlightingEnabled = !highlightingEnabled;
    renderHighlightButton();
    if (!highlightingEnabled) {
      highlighter?.clear();
      return;
    }
    updateHighlighting();
    if (!audio.paused && !audio.ended) startLoop();
  }

  /* ------------------------------------------------------------------ playback */

  function play() {
    // An unhandled rejection here is how an autoplay-policy block disappears
    // silently; surface it instead.
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch((error: unknown) => {
        if ((error as { name?: string })?.name === "NotAllowedError") return;
        console.warn("[vocasync] Playback failed", error);
      });
    }
  }

  function togglePlay() {
    if (audio.paused) play();
    else audio.pause();
  }

  /* ---------------------------------------------------------------- mini player */

  function setMiniVisible(visible: boolean) {
    if (!miniEl || visible === miniVisible) return;
    miniEl.hidden = !visible;
    miniVisible = visible;
  }

  function setupMiniPlayer() {
    if (!miniEnabled || !miniEl || typeof view.IntersectionObserver !== "function") return;
    const observer = new view.IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setMiniVisible(!entry.isIntersecting && isPlaying && !miniDismissed);
      },
      { threshold: 0 }
    );
    observer.observe(root);
    cleanups.push(() => observer.disconnect());

    on(miniPlayBtn, "click", togglePlay);
    on(miniCloseBtn, "click", () => {
      miniDismissed = true;
      setMiniVisible(false);
    });
  }

  /* ---------------------------------------------------------------------- init */

  const payload = readPayload(root);
  const src = resolveAudioSrc(payload?.audioUrl, payload?.publishableKey, doc.baseURI);
  if (!payload || !src) {
    setState("no-audio");
    return null;
  }

  setState("loading");
  audio.src = src;

  const instance: PlayerInstance & registry.RegisteredPlayer = {
    root,
    pause() {
      if (!audio.paused) audio.pause();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      for (const fn of cleanups.splice(0)) fn();
      highlighter?.destroy();
      highlighter = null;
      audio.pause();
      audio.removeAttribute("src");
      root.removeAttribute("data-vocasync-ready");
      registry.unregister(instance);
    },
  };

  /* ------------------------------------------------------------------ listeners */

  on(playBtn, "click", togglePlay);
  on(highlightBtn, "click", toggleHighlighting);

  on(audio, "play", () => {
    isPlaying = true;
    miniDismissed = false;
    registry.pauseOthers(instance);
    renderPlayState(true);
    startLoop();
  });

  on(audio, "pause", () => {
    isPlaying = false;
    renderPlayState(false);
    stopLoop();
    setMiniVisible(false);
  });

  on(audio, "ended", () => {
    isPlaying = false;
    renderPlayState(false);
    stopLoop();
  });

  on(audio, "seeking", updateHighlighting);
  on(audio, "seeked", () => {
    updateHighlighting();
    renderProgress();
    if (!audio.paused && !audio.ended) startLoop();
  });

  // The shipped player never listened for `error`, so an expired publishable key or a
  // 404 left the controls visible and permanently dead with no message anywhere.
  on(audio, "error", () => {
    stopLoop();
    highlighter?.clear();
    setState("no-audio");
  });

  on(audio, "loadedmetadata", () => {
    if (durationTimeEl) durationTimeEl.textContent = formatTime(audio.duration);
    if (progressInput && Number.isFinite(audio.duration)) {
      progressInput.max = String(audio.duration);
    }
    setState("ready");
  });

  on(audio, "canplay", () => setState("ready"));
  on(audio, "timeupdate", renderProgress);

  on(progressInput, "input", () => {
    if (!progressInput) return;
    const next = Number.parseFloat(progressInput.value);
    if (Number.isFinite(next)) audio.currentTime = next;
  });

  on(volumeInput, "input", () => {
    if (!volumeInput) return;
    const next = Number.parseFloat(volumeInput.value);
    if (Number.isFinite(next)) audio.volume = Math.min(1, Math.max(0, next / 100));
    renderVolume();
  });

  on(muteBtn, "click", () => {
    audio.muted = !audio.muted;
    renderVolume();
  });

  on(speedBtn, "click", () => {
    if (speedMenu) speedMenu.hidden = !speedMenu.hidden;
  });

  on(speedMenu, "click", (event) => {
    const btn = (event.target as Element | null)?.closest?.(
      SPEED_STEP_SELECTOR
    ) as HTMLElement | null;
    if (!btn || !speedMenu) return;
    const speed = Number.parseFloat(btn.dataset.speed ?? "");
    if (!Number.isFinite(speed)) return;
    audio.playbackRate = speed;
    for (const step of Array.from(speedMenu.querySelectorAll(SPEED_STEP_SELECTOR))) {
      step.removeAttribute("data-active");
    }
    btn.setAttribute("data-active", "");
    if (speedLabel) speedLabel.textContent = `${speed}x`;
    speedMenu.hidden = true;
  });

  on(doc, "click", (event) => {
    if (!speedMenu || speedMenu.hidden) return;
    const target = event.target as Node | null;
    if (speedBtn?.contains(target as Node) || speedMenu.contains(target as Node)) return;
    speedMenu.hidden = true;
  });

  on(root, "keydown", (event) => {
    const e = event as KeyboardEvent;
    if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
    switch (e.code) {
      case "Space":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - 5);
        break;
      case "ArrowRight":
        e.preventDefault();
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
        break;
      case "KeyM":
        e.preventDefault();
        audio.muted = !audio.muted;
        renderVolume();
        break;
      case "KeyH":
        e.preventDefault();
        toggleHighlighting();
        break;
    }
  });

  /* --------------------------------------------------------- highlighting setup */

  function initHighlighting() {
    if (destroyed) return;
    const words = Array.isArray(payload?.words) ? payload.words : [];
    if (!words.length) return;

    const articleRoot = doc.querySelector(articleSelector);
    if (!articleRoot) return;

    highlighter = createHighlighter({
      articleRoot,
      words,
      trailLength: Number.isFinite(trailLength) ? trailLength : 4,
      autoScroll: true,
      prefersReducedMotion: () =>
        view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    });

    if (clickToSeekEnabled) {
      const unregister = registerSeekRoot(articleRoot, (dataI) => {
        const start = highlighter?.startOfToken(dataI);
        if (start === null || start === undefined) return;
        audio.currentTime = start;
        if (audio.paused) play();
      });
      cleanups.push(unregister);
    }
  }

  // The article body renders after the player in the document, so its spans may not
  // exist yet when the module script runs.
  if (doc.readyState === "loading") {
    on(doc, "DOMContentLoaded", initHighlighting);
  } else {
    initHighlighting();
  }

  setupMiniPlayer();
  renderHighlightButton();
  renderVolume();
  setState("ready");
  registry.register(instance);
  root.setAttribute("data-vocasync-ready", "");

  return instance;
}
