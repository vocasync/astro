/**
 * The player engine: playback, word highlighting and the view-transition lifecycle,
 * with no markup opinions and no Astro dependency.
 *
 * Public and covered by semver from 2.0.0. `install()` is what the shipped component
 * calls; everything below it is for building something else.
 *
 * Storage and the click delegate are deliberately not exported — they are wiring
 * rather than contract, and freezing them would make the engine harder to improve.
 */

// Discovery and lifecycle. `install()` boots every player on the page and keeps them
// working across Astro view transitions.
export { bootAll, install, teardownAll } from "./boot.js";
// Word highlighting against rehype-generated spans.
export {
  createHighlighter,
  type Highlighter,
  type HighlighterOptions,
} from "./highlighter.js";
// The stream URL, with its publishable key applied.
export { resolveAudioSrc } from "./media-url.js";
// One player, driven from your own markup.
export { createPlayer, formatTime, type PlayerInstance } from "./player.js";

// Labels, for a custom UI that should read the same as the shipped one.
export {
  defaultStrings,
  describeTime,
  type PlayerStrings,
  resolveStrings,
  type SerializableStrings,
} from "./strings.js";

// The pure timing maths, for building something quite different.
export {
  computeSpanTimings,
  EPS,
  idxForTime,
  type SpanItem,
  type SpanTiming,
  spanAtTime,
  trailRange,
  type WordTiming,
} from "./timings.js";
