import { describe, expect, test } from "bun:test";
import { computeHash } from "../src/core/hash-manager.js";
import {
  contentHashFor,
  type HashInputs,
  legacyContentHashFor,
  matchStoredHash,
} from "../src/sync/content-hash.js";

/**
 * v2.1.0 added `align` to the content hash. Every entry written by v2.0.x carries the
 * hash of `[text, voice, language, format]`, so without a bridge every one of them reads
 * as changed and the whole site is re-synthesised and re-aligned — paid for twice.
 */

const inputs: HashInputs = {
  normalisedSpeechtext: "hello world",
  voice: "onyx",
  language: "en",
  format: "mp3",
  align: true,
};

describe("contentHashFor", () => {
  test("hashes text, voice, language, format and align — the v2.1 shape", () => {
    expect(contentHashFor(inputs)).toBe(
      computeHash(JSON.stringify(["hello world", "onyx", "en", "mp3", true]))
    );
  });
});

describe("legacyContentHashFor", () => {
  test("hashes text, voice, language and format — the v2.0 shape", () => {
    expect(legacyContentHashFor(inputs)).toBe(
      computeHash(JSON.stringify(["hello world", "onyx", "en", "mp3"]))
    );
  });
});

describe("matchStoredHash", () => {
  test("a stored v2.1 hash for the same inputs is current", () => {
    expect(matchStoredHash(contentHashFor(inputs), inputs)).toBe("current");
  });

  test("a stored v2.0 hash for the same inputs is legacy when alignment is on", () => {
    expect(matchStoredHash(legacyContentHashFor(inputs), inputs)).toBe("legacy");
  });

  test("a v2.0 hash never vouches for a narration-only post — v2.0 always aligned", () => {
    const narrationOnly = { ...inputs, align: false };
    expect(matchStoredHash(legacyContentHashFor(narrationOnly), narrationOnly)).toBe("mismatch");
  });

  test("changed content is a mismatch under either shape", () => {
    const edited = { ...inputs, normalisedSpeechtext: "hello there" };
    expect(matchStoredHash(contentHashFor(inputs), edited)).toBe("mismatch");
    expect(matchStoredHash(legacyContentHashFor(inputs), edited)).toBe("mismatch");
  });

  test("a changed voice is a mismatch under the legacy shape too", () => {
    expect(matchStoredHash(legacyContentHashFor(inputs), { ...inputs, voice: "alloy" })).toBe(
      "mismatch"
    );
  });

  test("no stored hash is a mismatch", () => {
    expect(matchStoredHash(undefined, inputs)).toBe("mismatch");
  });
});
