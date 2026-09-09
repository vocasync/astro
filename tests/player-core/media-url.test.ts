import { describe, expect, test } from "bun:test";
import { resolveAudioSrc } from "../../src/player-core/media-url.js";

const BASE = "https://example.test/blog/post/";

describe("resolveAudioSrc", () => {
  test("appends the publishable key to an absolute URL", () => {
    expect(resolveAudioSrc("https://cdn.test/a.mp3", "pk_123")).toBe(
      "https://cdn.test/a.mp3?pk=pk_123"
    );
  });

  test("resolves a site-relative URL against the page instead of throwing", () => {
    // The shipped player called new URL(url) with no base here, which throws; the
    // throw was swallowed and the player claimed the article had no audio.
    expect(resolveAudioSrc("/audio/a.mp3", "pk_123", BASE)).toBe(
      "https://example.test/audio/a.mp3?pk=pk_123"
    );
  });

  test("resolves a document-relative URL against the page", () => {
    expect(resolveAudioSrc("a.mp3", "pk_123", BASE)).toBe(
      "https://example.test/blog/post/a.mp3?pk=pk_123"
    );
  });

  test("preserves existing query parameters", () => {
    expect(resolveAudioSrc("https://cdn.test/a.mp3?v=2", "pk_123")).toBe(
      "https://cdn.test/a.mp3?v=2&pk=pk_123"
    );
  });

  test("replaces an existing pk rather than duplicating it", () => {
    expect(resolveAudioSrc("https://cdn.test/a.mp3?pk=old", "new")).toBe(
      "https://cdn.test/a.mp3?pk=new"
    );
  });

  test("returns the URL unchanged when there is no key", () => {
    expect(resolveAudioSrc("/audio/a.mp3")).toBe("/audio/a.mp3");
    expect(resolveAudioSrc("/audio/a.mp3", "")).toBe("/audio/a.mp3");
    expect(resolveAudioSrc("/audio/a.mp3", undefined, BASE)).toBe("/audio/a.mp3");
  });

  test("returns null when there is nothing playable", () => {
    expect(resolveAudioSrc(undefined)).toBeNull();
    expect(resolveAudioSrc("")).toBeNull();
    expect(resolveAudioSrc("   ")).toBeNull();
    expect(resolveAudioSrc(42)).toBeNull();
  });

  test("never throws on a relative URL with no base available", () => {
    expect(() => resolveAudioSrc("/audio/a.mp3", "pk_123", undefined)).not.toThrow();
    expect(resolveAudioSrc("/audio/a.mp3", "pk_123", undefined)).toBe("/audio/a.mp3");
  });
});
