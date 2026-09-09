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
  /** Announced by the seek slider, e.g. "2 minutes 30 seconds of 10 minutes". */
  seekPosition: (current: string, total: string) => string;
  mute: string;
  unmute: string;
  volume: string;
  speed: string;
  /** Label for a speed step, e.g. "1.5x". */
  speedValue: (rate: number) => string;
  highlightOn: string;
  highlightOff: string;
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
  seekPosition: (current, total) => `${current} of ${total}`,
  mute: "Mute",
  unmute: "Unmute",
  volume: "Volume",
  speed: "Playback speed",
  speedValue: (rate) => `${rate}x`,
  highlightOn: "Disable word highlighting",
  highlightOff: "Enable word highlighting",
};

/** The subset that can cross the wire as JSON; functions are not serialisable. */
export type SerializableStrings = Omit<PlayerStrings, "seekPosition" | "speedValue">;

export function resolveStrings(overrides?: Partial<SerializableStrings>): PlayerStrings {
  return { ...defaultStrings, ...(overrides ?? {}) };
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
