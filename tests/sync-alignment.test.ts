import { describe, expect, test } from "bun:test";
import type { AudioArtifact } from "../src/types/index.js";

/**
 * Whether an artifact needs re-doing.
 *
 * This is the money question: `isUpToDate` deciding wrongly means either a stale
 * artifact served forever, or the same audio paid for on every single sync.
 *
 * The function is module-private, so this mirrors it. The mirror is kept honest by
 * `orchestrator-parity.test.ts`, which asserts the real source still matches.
 */
function isUpToDate(
  entry: AudioArtifact | undefined,
  contentHash: string,
  align: boolean
): boolean {
  if (!entry || entry.contentHash !== contentHash || !entry.synthesisProjectUuid) return false;
  const wasAligned = entry.aligned ?? Boolean(entry.alignmentProjectUuid);
  if (wasAligned !== align) return false;
  return align ? Boolean(entry.alignmentProjectUuid) && Array.isArray(entry.words) : true;
}

const base = {
  contentHash: "h1",
  voice: "onyx",
  language: "en",
  format: "mp3",
  synthesisProjectUuid: "syn-1",
  synthesisPublishableKey: "pk_syn",
  audioUrl: "https://x/stream",
  duration: 10,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} satisfies Partial<AudioArtifact> as AudioArtifact;

const alignedEntry: AudioArtifact = {
  ...base,
  aligned: true,
  alignmentProjectUuid: "aln-1",
  alignmentPublishableKey: "pk_aln",
  words: [{ word: "a", start: 0, end: 1 }],
};

const narrationOnlyEntry: AudioArtifact = { ...base, aligned: false };

describe("isUpToDate", () => {
  test("an aligned entry is current when alignment was asked for", () => {
    expect(isUpToDate(alignedEntry, "h1", true)).toBe(true);
  });

  test("a narration-only entry is current when alignment was NOT asked for", () => {
    // The whole point. Judging by the presence of alignment fields alone would mark
    // this incomplete and re-synthesise it on every run, forever, silently.
    expect(isUpToDate(narrationOnlyEntry, "h1", false)).toBe(true);
  });

  test("turning alignment on makes an existing narration-only entry stale", () => {
    expect(isUpToDate(narrationOnlyEntry, "h1", true)).toBe(false);
  });

  test("turning alignment off makes an existing aligned entry stale", () => {
    expect(isUpToDate(alignedEntry, "h1", false)).toBe(false);
  });

  test("a half-finished alignment is not mistaken for a deliberate skip", () => {
    // Synthesis landed, alignment did not. `aligned: true` records the intent, so the
    // absence of timings is a failure to retry rather than a choice to respect.
    const halfDone: AudioArtifact = { ...base, aligned: true };
    expect(isUpToDate(halfDone, "h1", true)).toBe(false);
  });

  test("content changes still invalidate, either way", () => {
    expect(isUpToDate(alignedEntry, "h2", true)).toBe(false);
    expect(isUpToDate(narrationOnlyEntry, "h2", false)).toBe(false);
  });

  test("entries written before v2.1.0 carry no flag and are read as aligned", () => {
    // Backwards compatibility: they were always aligned, so their alignment fields
    // stand in for the flag. Without this every pre-existing entry re-synthesises.
    const legacy = { ...alignedEntry };
    legacy.aligned = undefined;
    expect(isUpToDate(legacy, "h1", true)).toBe(true);
    expect(isUpToDate(legacy, "h1", false)).toBe(false);
  });

  test("an entry with no synthesis is never current", () => {
    const broken = { ...narrationOnlyEntry, synthesisProjectUuid: "" };
    expect(isUpToDate(broken, "h1", false)).toBe(false);
    expect(isUpToDate(undefined, "h1", false)).toBe(false);
  });
});
