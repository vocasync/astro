/**
 * VocaSync voices.
 *
 * The catalogue is the platform's public voice list. The nine names used before v2.2
 * remain valid as aliases (until 31 March 2027) so existing configs and posts keep
 * working untouched.
 *
 * Two mappings matter and point in OPPOSITE directions:
 *
 * - `sendVoice` resolves a legacy name to the voice the platform now serves it with.
 * - `hashVoiceKey` resolves a voice back to the legacy name it replaced, so the
 *   content hash of a post synthesised under the old name does not move. Without it
 *   every existing site would read as changed and be re-synthesised and re-billed.
 */

export const VOICE_IDS = [
  "linen",
  "basalt",
  "juniper",
  "drift",
  "quartz",
  "volt",
  "willow",
  "oak",
  "maple",
  "slate",
  "velvet",
  "hearth",
  "zest",
  "granite",
  "heath",
  "wren",
  "lark",
  "cairn",
  "fern",
  "breeze",
  "pearl",
  "beacon",
  "dawn",
  "summit",
  "timber",
  "hush",
  "blaze",
  "flint",
  "lune",
  "forge",
  "sol",
  "vento",
  "brisa",
  "taiga",
  "kumo",
  "bada",
  "jade",
  "neva",
  "zarya",
  "volga",
  "harbour",
  "meridian",
  "spark",
  "ember",
  "atlas",
] as const;

/** Pre-2.2 voice name -> the VocaSync voice it now resolves to. */
export const LEGACY_ALIASES = {
  alloy: "slate",
  ash: "atlas",
  coral: "juniper",
  echo: "beacon",
  fable: "hearth",
  onyx: "basalt",
  nova: "spark",
  sage: "willow",
  shimmer: "linen",
} as const;

export const LEGACY_VOICE_NAMES = Object.keys(LEGACY_ALIASES) as Array<keyof typeof LEGACY_ALIASES>;

/** The voice name the platform should be asked for. Legacy names resolve to their target. */
export function sendVoice(voice: string): string {
  return Object.hasOwn(LEGACY_ALIASES, voice)
    ? LEGACY_ALIASES[voice as keyof typeof LEGACY_ALIASES]
    : voice;
}

const TARGET_TO_LEGACY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LEGACY_ALIASES).map(([legacy, target]) => [target, legacy])
);

/**
 * The voice string that participates in the content hash.
 *
 * An alias target hashes as the legacy name it replaced, so `onyx` and `basalt` are the
 * same artifact and the same hash. Any other voice hashes as itself.
 */
export function hashVoiceKey(voice: string): string {
  return TARGET_TO_LEGACY[voice] ?? voice;
}
