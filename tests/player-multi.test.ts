import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

/**
 * The bugs that only appear with more than one player, plus the view-transition
 * lifecycle a hoisted module script has to manage for itself.
 *
 * The multi-player fixture is deliberately pathological: two players built from the
 * same slug, so they carry the same DOM `id`, each owning its own article root. That
 * is an index page with a player per post -- the shape the shipped player got wrong.
 */

const SINGLE = readFileSync(join(import.meta.dir, "fixtures/smoke/player.html"), "utf8");
const MULTI = readFileSync(join(import.meta.dir, "fixtures/smoke/multi-player.html"), "utf8");

function boot(html: string) {
  const window = new Window({ url: "https://example.test/blog/post/" });
  const document = window.document as unknown as Document;
  document.documentElement.innerHTML = html
    .replace(/^[\s\S]*?<html[^>]*>/i, "")
    .replace(/<\/html>[\s\S]*$/i, "");

  const bundle = document.querySelector("script[data-vocasync-bundle]");
  if (!bundle?.textContent) throw new Error("fixture has no player bundle");
  window.eval(bundle.textContent);

  const players = Array.from(document.querySelectorAll(".vocasync-player")) as HTMLElement[];
  return {
    window,
    document,
    players,
    audios: Array.from(document.querySelectorAll("audio")) as HTMLAudioElement[],
    click(el: Element) {
      el.dispatchEvent(new window.Event("click", { bubbles: true }) as unknown as Event);
    },
    fire(target: EventTarget, type: string) {
      target.dispatchEvent(new window.Event(type) as unknown as Event);
    },
  };
}

describe("two players on one page", () => {
  let h: ReturnType<typeof boot>;
  beforeEach(() => {
    h = boot(MULTI);
  });

  test("both boot, despite sharing a DOM id", () => {
    // Two players built from the same slug emit the same `id`. The engine resolves
    // everything from the root element, so duplicate ids no longer make both
    // instances drive whichever audio element happened to come first.
    expect(h.players.length).toBe(2);
    expect(h.players[0].id).toBe(h.players[1].id);
    for (const p of h.players) expect(p.hasAttribute("data-vocasync-ready")).toBe(true);
  });

  test("each player controls its own audio element", () => {
    const [a, b] = h.players.map(
      (p) => p.querySelector('[data-state="ready"] [data-action="play-pause"]') as HTMLElement
    );
    h.click(a);
    expect(h.audios[0].paused).toBe(false);
    expect(h.audios[1].paused).toBe(true);

    h.click(a);
    expect(h.audios[0].paused).toBe(true);
    h.click(b);
    expect(h.audios[1].paused).toBe(false);
  });

  test("clicking a word seeks only the player that owns that article", () => {
    // The shipped player registered a document-level listener per instance, so one
    // word click seeked every player and started every track.
    const bodyB = h.document.querySelector("#body-b") as HTMLElement;
    const word = bodyB.querySelectorAll(".vocasync-word[data-i]")[30] as HTMLElement;
    h.click(word);

    expect(h.audios[1].currentTime).toBeGreaterThan(0);
    expect(h.audios[0].currentTime).toBe(0);
    expect(h.audios[0].paused).toBe(true);
  });

  test("starting one player pauses the other", () => {
    const [a, b] = h.players.map(
      (p) => p.querySelector('[data-state="ready"] [data-action="play-pause"]') as HTMLElement
    );
    h.click(a);
    expect(h.audios[0].paused).toBe(false);

    h.click(b);
    expect(h.audios[1].paused).toBe(false);
    expect(h.audios[0].paused).toBe(true);
  });

  test("highlighting stays inside each player's own article", () => {
    const bodyA = h.document.querySelector("#body-a") as HTMLElement;
    const bodyB = h.document.querySelector("#body-b") as HTMLElement;
    h.audios[0].currentTime = 0.2;
    h.fire(h.audios[0], "seeked");

    expect(bodyA.querySelectorAll(".vocasync-word.is-active").length).toBe(1);
    expect(bodyB.querySelectorAll(".vocasync-word.is-active").length).toBe(0);
  });
});

describe("view transition lifecycle", () => {
  let h: ReturnType<typeof boot>;
  beforeEach(() => {
    h = boot(SINGLE);
  });

  test("booting is idempotent", () => {
    // Both the initial boot and `astro:page-load` can fire for the same document.
    // Without the ready marker every player would get a second set of listeners.
    const player = h.players[0];
    const audio = h.audios[0];
    h.fire(h.document, "astro:page-load");

    const btn = player.querySelector(
      '[data-state="ready"] [data-action="play-pause"]'
    ) as HTMLElement;
    h.click(btn);
    // A doubly-bound handler would toggle twice and land back on paused.
    expect(audio.paused).toBe(false);
  });

  test("tears down before a swap", () => {
    // A hoisted module script is not re-executed on navigation, so anything it left
    // running -- the animation loop, the IntersectionObserver, the click delegate --
    // would leak onto every subsequent page.
    const player = h.players[0];
    const audio = h.audios[0];
    const btn = player.querySelector(
      '[data-state="ready"] [data-action="play-pause"]'
    ) as HTMLElement;
    h.click(btn);
    expect(audio.paused).toBe(false);

    h.fire(h.document, "astro:before-swap");

    expect(audio.paused).toBe(true);
    expect(player.hasAttribute("data-vocasync-ready")).toBe(false);
    // Detached listeners must not respond any more.
    h.click(btn);
    expect(audio.paused).toBe(true);
  });

  test("re-boots the page that replaced it", () => {
    h.fire(h.document, "astro:before-swap");
    expect(h.players[0].hasAttribute("data-vocasync-ready")).toBe(false);

    h.fire(h.document, "astro:page-load");
    expect(h.players[0].hasAttribute("data-vocasync-ready")).toBe(true);

    const btn = h.players[0].querySelector(
      '[data-state="ready"] [data-action="play-pause"]'
    ) as HTMLElement;
    h.click(btn);
    expect(h.audios[0].paused).toBe(false);
  });
});

describe("failure handling", () => {
  let h: ReturnType<typeof boot>;
  beforeEach(() => {
    h = boot(SINGLE);
  });

  test("a failed load surfaces the placeholder instead of dead controls", () => {
    // An expired publishable key answers 401. The shipped player never listened for
    // `error`, so it sat in the ready state with a play button that did nothing.
    const player = h.players[0];
    expect((player.querySelector('[data-state="ready"]') as HTMLElement).hidden).toBe(false);

    h.fire(h.audios[0], "error");

    expect((player.querySelector('[data-state="ready"]') as HTMLElement).hidden).toBe(true);
    expect((player.querySelector('[data-state="no-audio"]') as HTMLElement).hidden).toBe(false);
  });

  test("the mute icon follows silence, not just the muted flag", () => {
    // The shipped player passed `volume === 0` from the slider and `muted` from the
    // button, so the two could disagree: drag to zero, mute, unmute, and the icon
    // claimed sound was playing.
    const controls = h.players[0].querySelector('[data-state="ready"]') as HTMLElement;
    const slider = controls.querySelector('[data-action="volume"]') as HTMLInputElement;
    const muteBtn = controls.querySelector('[data-action="mute"]') as HTMLElement;
    const isSilentIconShown = () =>
      !muteBtn.querySelector(".vocasync-icon--volume-mute")?.classList.contains("vocasync-hidden");

    slider.value = "0";
    slider.dispatchEvent(new h.window.Event("input", { bubbles: true }) as unknown as Event);
    expect(isSilentIconShown()).toBe(true);

    h.click(muteBtn);
    h.click(muteBtn);
    expect(h.audios[0].muted).toBe(false);
    expect(h.audios[0].volume).toBe(0);
    expect(isSilentIconShown()).toBe(true);
  });
});
