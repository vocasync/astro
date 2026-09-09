import { describe, expect, test } from "bun:test";
import {
  clearPosition,
  getStorage,
  readPosition,
  readPrefs,
  resumePoint,
  type StorageLike,
  writePosition,
  writePrefs,
} from "../../src/player-core/storage.js";

function memoryStore(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** A browser configured to block site data: every access throws. */
const hostileStore: StorageLike = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

describe("getStorage", () => {
  test("returns null when there is no storage", () => {
    expect(getStorage(null)).toBeNull();
    expect(getStorage({})).toBeNull();
  });

  test("returns null when storage exists but is blocked", () => {
    // Presence is not permission -- Safari's private mode exposes localStorage and
    // then throws on write. A player that crashed here would be a poor trade for
    // remembering a volume setting.
    expect(getStorage({ localStorage: hostileStore })).toBeNull();
  });

  test("returns the store when it is usable, leaving no probe behind", () => {
    const store = memoryStore();
    expect(getStorage({ localStorage: store })).toBe(store);
    expect(store.getItem("vocasync:probe")).toBeNull();
  });
});

describe("preferences", () => {
  test("round-trip", () => {
    const store = memoryStore();
    writePrefs(store, { rate: 1.5, volume: 0.4, muted: true, highlighting: false });
    expect(readPrefs(store)).toEqual({
      rate: 1.5,
      volume: 0.4,
      muted: true,
      highlighting: false,
    });
  });

  test("merges rather than replacing", () => {
    const store = memoryStore();
    writePrefs(store, { rate: 2 });
    writePrefs(store, { volume: 0.2 });
    expect(readPrefs(store)).toEqual({ rate: 2, volume: 0.2 });
  });

  test("rejects values outside a sane range", () => {
    // This is user-writable storage; a bad rate goes straight to playbackRate.
    const store = memoryStore({
      "vocasync:prefs": JSON.stringify({ rate: 1000, volume: 42, muted: "yes" }),
    });
    expect(readPrefs(store)).toEqual({});
  });

  test("survives corrupt or missing JSON", () => {
    expect(readPrefs(memoryStore({ "vocasync:prefs": "{not json" }))).toEqual({});
    expect(readPrefs(memoryStore({ "vocasync:prefs": "null" }))).toEqual({});
    expect(readPrefs(memoryStore())).toEqual({});
  });

  test("never throws when storage is unavailable", () => {
    expect(() => writePrefs(null, { rate: 2 })).not.toThrow();
    expect(readPrefs(null)).toEqual({});
    expect(() => writePrefs(hostileStore, { rate: 2 })).not.toThrow();
  });
});

describe("positions", () => {
  test("round-trip per slug", () => {
    const store = memoryStore();
    writePosition(store, "post-a", 42);
    writePosition(store, "post-b", 7);
    expect(readPosition(store, "post-a")).toBe(42);
    expect(readPosition(store, "post-b")).toBe(7);
    expect(readPosition(store, "post-c")).toBeNull();
  });

  test("clears", () => {
    const store = memoryStore();
    writePosition(store, "a", 42);
    clearPosition(store, "a");
    expect(readPosition(store, "a")).toBeNull();
  });

  test("ignores nonsense", () => {
    const store = memoryStore();
    writePosition(store, "a", Number.NaN);
    expect(readPosition(store, "a")).toBeNull();
    expect(readPosition(memoryStore({ "vocasync:pos:a": '"nope"' }), "a")).toBeNull();
  });

  test("never throws when storage is unavailable", () => {
    expect(() => writePosition(null, "a", 1)).not.toThrow();
    expect(readPosition(null, "a")).toBeNull();
    expect(() => clearPosition(hostileStore, "a")).not.toThrow();
  });
});

describe("resumePoint", () => {
  test("resumes a genuine mid-article position", () => {
    expect(resumePoint(120, 300)).toBe(120);
  });

  test("declines near the start, so a fresh listen is not skipped into", () => {
    expect(resumePoint(3, 300)).toBeNull();
  });

  test("declines near the end, so a finished article does not reopen at its last second", () => {
    expect(resumePoint(295, 300)).toBeNull();
    expect(resumePoint(291, 300)).toBeNull();
    expect(resumePoint(289, 300)).toBe(289);
  });

  test("declines without a usable duration", () => {
    expect(resumePoint(120, Number.NaN)).toBeNull();
    expect(resumePoint(120, 0)).toBeNull();
    expect(resumePoint(null, 300)).toBeNull();
  });
});
