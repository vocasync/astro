/**
 * Every piece of text the player can show or announce.
 *
 * All of it was hardcoded English -- including the aria-labels -- in a product whose
 * premise is 57 languages. The keys are the contract; how they get filled is up to the
 * platform (a `strings` prop here, gettext in the WordPress plugin).
 */
export interface PlayerStrings {
  /** Accessible name for the player region. */
  label: string;
  loading: string;
  /** Shown when the article has no audio. */
  unavailable: string;
  /** Shown when the audio exists but failed to load. */
  error: string;
  retry: string;
  play: string;
  pause: string;
  seek: string;
  /**
   * Announced by the seek slider. `{current}` and `{total}` are replaced with spoken
   * durations, e.g. "2 minutes 30 seconds of 10 minutes".
   */
  seekPosition: string;
  mute: string;
  unmute: string;
  volume: string;
  speed: string;
  /** Label for a speed step. `{rate}` is replaced with the playback rate. */
  speedValue: string;
  highlightOn: string;
  highlightOff: string;
  /** Accessible name for skip-back. `{seconds}` is replaced with the interval. */
  skipBack: string;
  skipForward: string;
}

export const defaultStrings: PlayerStrings = {
  label: "Listen to this article",
  loading: "Loading audio…",
  unavailable: "Audio not available for this article",
  error: "Audio could not be loaded",
  retry: "Try again",
  play: "Play",
  pause: "Pause",
  seek: "Seek",
  seekPosition: "{current} of {total}",
  mute: "Mute",
  unmute: "Unmute",
  volume: "Volume",
  speed: "Playback speed",
  speedValue: "{rate}x",
  highlightOn: "Disable word highlighting",
  highlightOff: "Enable word highlighting",
  skipBack: "Back {seconds} seconds",
  skipForward: "Forward {seconds} seconds",
};

/**
 * Every string is a plain string, so all of them are translatable and all of them
 * survive JSON. They were briefly functions, which quietly made the four
 * placeholder-bearing ones -- the skip labels, the rate label and the seek
 * announcement -- impossible to override at all.
 */
export type SerializableStrings = PlayerStrings;

export function resolveStrings(overrides?: Partial<PlayerStrings>): PlayerStrings {
  return { ...defaultStrings, ...(overrides ?? {}) };
}

/**
 * Substitute `{name}` placeholders. Unknown placeholders are left alone rather than
 * blanked, so a mistyped key in a translation is visible instead of silently missing.
 */
export function formatString(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

/** Spoken duration for aria-valuetext: "2 minutes 30 seconds", not "150". */
export function describeTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0 seconds";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s || !m) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ");
}
