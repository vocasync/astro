import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `isUpToDate` decides whether a post is re-synthesised, so getting it wrong costs
 * money on every sync. It is module-private, so `sync-alignment.test.ts` mirrors it;
 * this asserts the mirror still reflects the original.
 *
 * A copied implementation that silently drifts is worse than no test at all, because
 * it keeps reporting green about code that no longer exists.
 */
const source = readFileSync(join(import.meta.dir, "../src/sync/orchestrator.ts"), "utf8");

describe("orchestrator parity", () => {
  test("isUpToDate still weighs alignment intent", () => {
    const fn = source.slice(
      source.indexOf("function isUpToDate("),
      source.indexOf("/** Orchestrate the full sync")
    );
    expect(fn).toContain("entry.aligned ?? Boolean(entry.alignmentProjectUuid)");
    expect(fn).toContain("wasAligned !== align");
    expect(fn).toContain(
      "align ? Boolean(entry.alignmentProjectUuid) && Array.isArray(entry.words)"
    );
  });

  test("align participates in the content hash", () => {
    // Otherwise flipping it would leave the hash unchanged and the entry considered
    // current, so the switch would appear to do nothing until the next content edit.
    expect(source).toContain(
      "JSON.stringify([speechDoc.normalisedSpeechtext, voice, language, format, align])"
    );
  });

  test("the artifact records what was asked of it", () => {
    expect(source).toContain("aligned: align,");
  });

  test("an unalignable language is rejected before synthesis is paid for", () => {
    const resolve = source.slice(
      source.indexOf("function resolveParams("),
      source.indexOf("function isUpToDate(")
    );
    expect(resolve).toContain("align && !canAlign(language)");
    expect(resolve).toContain("align: false");
  });
});
