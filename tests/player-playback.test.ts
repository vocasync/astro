import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

/**
 * Playback conveniences and the accessibility work that needs a live DOM.
 *
 * These run against real Astro build output, like the rest of the smoke suite.
 */

const HTML = readFileSync(join(import.meta.dir, "fixtures/smoke/player.html"), "utf8");

function boot(seedStorage: Record<string, string> = {}) {
  const window = new Window({ url: "https://example.test/blog/post/" });
  const document = window.document as unknown as Document;
  for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);

  document.documentElement.innerHTML = HTML.replace(/^[\s\S]*?<html[^>]*>/i, "").replace(
    /<\/html>[\s\S]*$/i,
    ""
  );
  const bundle = document.querySelector("script[data-vocasync-bundle]");
  if (!bundle?.textContent) throw new Error("fixture has no player bundle");
  window.eval(bundle.textContent);

  const player = document.querySelector(".vocasync-player") as HTMLElement;
  const controls = player.querySelector('[data-state="ready"]') as HTMLElement;
  return {
    window,
    document,
    player,
    controls,
    audio: document.querySelector("audio") as HTMLAudioElement,
    q: (sel: string) => controls.querySelector(sel) as HTMLElement | null,
    click: (el: Element) =>
      el.dispatchEvent(new window.Event("click", { bubbles: true }) as unknown as Event),
    key: (code: string, key = code) =>
      player.dispatchEvent(
        new window.KeyboardEvent("keydown", { code, key, bubbles: true }) as unknown as Event
      ),
    fire: (t: EventTarget, type: string) =>
      t.dispatchEvent(new window.Event(type) as unknown as Event),
    storageDump: () => {
      const out: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k) out[k] = window.localStorage.getItem(k) ?? "";
      }
      return out;
    },
  };
}

describe("skipping", () => {
  let h: ReturnType<typeof boot>;
  beforeEach(() => {
    h = boot();
  });

  test("arrow keys jump by the configured interval", () => {
    h.audio.currentTime = 60;
    h.key("ArrowRight");
    expect(h.audio.currentTime).toBe(75);
    h.key("ArrowLeft");
    expect(h.audio.currentTime).toBe(60);
  });

  test("never seeks before the start", () => {
    h.audio.currentTime = 3;
    h.key("ArrowLeft");
    expect(h.audio.currentTime).toBe(0);
  });
});

describe("remembered preferences", () => {
  test("speed, volume, mute and highlighting survive a reload", () => {
    const first = boot();
    const menu = first.player.querySelector(".vocasync-player__speed-menu") as HTMLElement;
    first.click(menu.querySelector('[data-speed="1.5"]') as Element);

    const volume = first.q('[data-action="volume"]') as HTMLInputElement;
    volume.value = "30";
    volume.dispatchEvent(new first.window.Event("input", { bubbles: true }) as unknown as Event);
    first.click(first.q('[data-action="toggle-highlighting"]') as Element);

    const saved = first.storageDump();
    expect(saved["vocasync:prefs"]).toBeTruthy();

    // A second page load, carrying the same storage.
    const second = boot(saved);
    expect(second.audio.playbackRate).toBeCloseTo(1.5, 3);
    expect(second.audio.volume).toBeCloseTo(0.3, 3);
    expect(second.q('[data-action="toggle-highlighting"]')?.getAttribute("data-highlighting")).toBe(
      "off"
    );
  });

  test("the restored state is reflected in the controls, not just the media element", () => {
    // Restoring used to set playbackRate and volume while leaving the speed label on
    // "1x", the menu selection on the wrong item and the volume slider at 100 -- so
    // the controls confidently reported a state the player was not in.
    const h = boot({
      "vocasync:prefs": JSON.stringify({ rate: 1.5, volume: 0.3, muted: false }),
    });
    const menu = h.player.querySelector(".vocasync-player__speed-menu") as HTMLElement;

    expect(h.player.querySelector("[data-speed-label]")?.textContent).toBe("1.5x");
    expect(menu.querySelector('[data-speed="1.5"]')?.hasAttribute("data-active")).toBe(true);
    expect(menu.querySelector('[data-speed="1"]')?.hasAttribute("data-active")).toBe(false);
    expect(menu.querySelector('[data-speed="1.5"]')?.getAttribute("aria-checked")).toBe("true");
    expect((h.q('[data-action="volume"]') as HTMLInputElement).value).toBe("30");
  });

  test("a corrupt preferences blob is ignored rather than fatal", () => {
    const h = boot({ "vocasync:prefs": "{{{not json" });
    expect(h.player.hasAttribute("data-vocasync-ready")).toBe(true);
    expect(h.audio.playbackRate).toBe(1);
  });

  test("position is not resumed unless asked for", () => {
    // Resuming is a pleasant surprise on a long article and a confusing one on a
    // short post someone expects to start from the beginning, so it is opt-in.
    const h = boot({ "vocasync:pos:post": "42" });
    expect(h.player.hasAttribute("data-vocasync-ready")).toBe(true);
    h.fire(h.audio, "loadedmetadata");
    expect(h.audio.currentTime).toBe(0);
  });

  test("an out-of-range stored rate is rejected", () => {
    // localStorage is user-writable and the value goes straight to playbackRate.
    const h = boot({ "vocasync:prefs": JSON.stringify({ rate: 9999 }) });
    // Assert the player actually booted, or "rate is 1" would pass on a dead page.
    expect(h.player.hasAttribute("data-vocasync-ready")).toBe(true);
    expect(h.audio.playbackRate).toBe(1);
  });
});

describe("buffering feedback", () => {
  let h: ReturnType<typeof boot>;
  beforeEach(() => {
    h = boot();
  });

  test("a stalled load is distinguishable from a broken one", () => {
    // Previously a stall left the controls looking interactive with no feedback, and
    // an error looked identical to it.
    expect(h.player.hasAttribute("data-player-buffering")).toBe(false);
    h.fire(h.audio, "waiting");
    expect(h.player.hasAttribute("data-player-buffering")).toBe(true);
    expect(h.player.getAttribute("data-player-state")).toBe("ready");

    h.fire(h.audio, "playing");
    expect(h.player.hasAttribute("data-player-buffering")).toBe(false);
  });

  test("stalled and buffering are not the error state", () => {
    h.fire(h.audio, "stalled");
    expect(h.player.getAttribute("data-player-state")).not.toBe("error");
    h.fire(h.audio, "error");
    expect(h.player.getAttribute("data-player-state")).toBe("error");
  });
});

describe("progress painting", () => {
  let h: ReturnType<typeof boot>;
  beforeEach(() => {
    h = boot();
  });

  /** Stand in for a loaded media element, which happy-dom has no network for. */
  function fakeMedia(duration: number, bufferedEnd: number) {
    Object.defineProperty(h.audio, "duration", { value: duration, configurable: true });
    Object.defineProperty(h.audio, "buffered", {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => bufferedEnd },
    });
  }

  test("paints the played and buffered ranges as percentages", () => {
    // Both are read by player.css to draw the bar. The played variable was missing
    // entirely at one point and nothing noticed, because nothing asserted on it.
    fakeMedia(200, 80);
    h.audio.currentTime = 50;
    h.fire(h.audio, "timeupdate");
    h.fire(h.audio, "progress");

    const seek = h.q('[data-action="seek"]') as HTMLElement;
    expect(seek.style.getPropertyValue("--vocasync-played")).toBe("25%");
    expect(seek.style.getPropertyValue("--vocasync-buffered")).toBe("40%");
  });

  test("does not paint a buffered range past the end", () => {
    fakeMedia(100, 500);
    h.fire(h.audio, "progress");
    const seek = h.q('[data-action="seek"]') as HTMLElement;
    expect(seek.style.getPropertyValue("--vocasync-buffered")).toBe("100%");
  });

  test("survives a media element with no duration yet", () => {
    h.audio.currentTime = 10;
    expect(() => h.fire(h.audio, "timeupdate")).not.toThrow();
    expect(() => h.fire(h.audio, "progress")).not.toThrow();
  });
});

describe("accessible announcements", () => {
  let h: ReturnType<typeof boot>;
  beforeEach(() => {
    h = boot();
  });

  test("the seek slider announces a duration, not a raw number", () => {
    h.audio.currentTime = 95;
    h.fire(h.audio, "timeupdate");
    // It used to read out "95".
    expect(h.q('[data-action="seek"]')?.getAttribute("aria-valuetext")).toContain("1 minute");
    expect(h.q('[data-action="seek"]')?.getAttribute("aria-valuetext")).toContain("35 seconds");
  });

  test("the volume slider announces a percentage", () => {
    const volume = h.q('[data-action="volume"]') as HTMLInputElement;
    volume.value = "65";
    volume.dispatchEvent(new h.window.Event("input", { bubbles: true }) as unknown as Event);
    expect(volume.getAttribute("aria-valuetext")).toBe("65%");
  });

  test("the mute button's label follows its state", () => {
    const mute = h.q('[data-action="mute"]') as HTMLElement;
    expect(mute.getAttribute("aria-label")).toBe("Mute");
    h.click(mute);
    expect(mute.getAttribute("aria-label")).toBe("Unmute");
  });

  test("the speed menu reports expansion and the checked item", () => {
    const trigger = h.q('[data-action="speed"]') as HTMLElement;
    const menu = h.player.querySelector(".vocasync-player__speed-menu") as HTMLElement;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    h.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(menu.hidden).toBe(false);

    h.click(menu.querySelector('[data-speed="2"]') as Element);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(menu.querySelector('[data-speed="2"]')?.getAttribute("aria-checked")).toBe("true");
    expect(menu.querySelector('[data-speed="1"]')?.getAttribute("aria-checked")).toBe("false");
  });

  test("the speed menu can be navigated and dismissed from the keyboard", () => {
    const trigger = h.q('[data-action="speed"]') as HTMLElement;
    const menu = h.player.querySelector(".vocasync-player__speed-menu") as HTMLElement;
    h.click(trigger);

    const items = Array.from(menu.querySelectorAll("[data-speed]")) as HTMLElement[];
    // Opening focuses the active rate (1x), not the first item.
    expect(h.document.activeElement).toBe(items[2]);

    const press = (key: string) =>
      (h.document.activeElement as HTMLElement).dispatchEvent(
        new h.window.KeyboardEvent("keydown", { key, bubbles: true }) as unknown as Event
      );

    press("ArrowDown");
    expect(h.document.activeElement).toBe(items[3]);
    press("ArrowUp");
    press("ArrowUp");
    expect(h.document.activeElement).toBe(items[1]);
    press("Home");
    expect(h.document.activeElement).toBe(items[0]);
    press("End");
    expect(h.document.activeElement).toBe(items[items.length - 1]);

    press("Escape");
    expect(menu.hidden).toBe(true);
    expect(h.document.activeElement).toBe(trigger);
  });
});
