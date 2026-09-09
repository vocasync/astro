/**
 * Internal entry point for the player engine.
 *
 * Not exported from package.json yet: the headless API becomes public in 2.0.0, once
 * its shape has settled. Treat everything here as private until then.
 */
export { bootAll, install, teardownAll } from "./boot.js";
export { createHighlighter, type Highlighter } from "./highlighter.js";
export { resolveAudioSrc } from "./media-url.js";
export { createPlayer, formatTime, type PlayerInstance } from "./player.js";
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
