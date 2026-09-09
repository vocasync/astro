/**
 * Types for the AudioPlayer component.
 *
 * The component itself is an .astro file and cannot be re-exported from JavaScript;
 * import it directly:
 *
 *   import AudioPlayer from "@vocasync/astro/components/AudioPlayer.astro";
 */
export type {
  AudioEntry,
  AudioPlayerProps,
  AutoScrollMode,
  ControlName,
  DockOptions,
  HighlightOptions,
  PlayerSize,
  PlayerVariant,
} from "./types.js";
export { DEFAULT_CONTROLS } from "./types.js";
