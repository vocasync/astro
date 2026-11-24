import { computeHash } from "../core/hash-manager.js";

/** What an audio-map entry's `contentHash` vouches for. */
export interface HashInputs {
  normalisedSpeechtext: string;
  voice: string;
  language: string;
  format: string;
  align: boolean;
}

/**
 * The content hash written since v2.1.0. `align` participates because flipping it
 * changes what the artifact is (narration only vs narration + word timings).
 */
export function contentHashFor(i: HashInputs): string {
  return computeHash(
    JSON.stringify([i.normalisedSpeechtext, i.voice, i.language, i.format, i.align])
  );
}

/**
 * The content hash v2.0.x wrote, before `align` joined it. v2.0 always aligned, so a
 * match under this shape only vouches for an aligned artifact.
 */
export function legacyContentHashFor(i: HashInputs): string {
  return computeHash(JSON.stringify([i.normalisedSpeechtext, i.voice, i.language, i.format]));
}

/**
 * How a stored hash relates to what this sync would produce.
 *
 * - `current`: written by v2.1+ for exactly these inputs.
 * - `legacy`: written by v2.0.x for exactly these inputs, with alignment on. The
 *   artifact is the same one this sync would make; only the hash shape is old.
 *   Without this bridge every v2.0-era entry reads as changed and the whole site is
 *   re-synthesised and re-aligned — paid for a second time.
 * - `mismatch`: content or parameters changed (or nothing is stored).
 */
export function matchStoredHash(
  stored: string | undefined,
  inputs: HashInputs
): "current" | "legacy" | "mismatch" {
  if (!stored) return "mismatch";
  if (stored === contentHashFor(inputs)) return "current";
  if (inputs.align && stored === legacyContentHashFor(inputs)) return "legacy";
  return "mismatch";
}
