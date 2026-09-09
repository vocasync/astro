import type { SerializableStrings } from "../player-core/strings.js";
import type { AlignedWord } from "../types/index.js";

/**
 * The AudioPlayer's props, defined once.
 *
 * This file previously described a component that did not exist: it declared
 * `publishableKey` and `alignmentUrl` while the component took `synthesisPublishableKey`
 * and had no `alignmentUrl` at all, and it advertised a named `AudioPlayer` export that
 * could not be imported. The .astro now imports this type rather than restating it, so
 * the two cannot drift again.
 */

/** A control the player can render, in the order you list it. */
export type ControlName =
  | "play"
  /** Elapsed/total time above the seek bar; grows to fill the row. */
  | "progress"
  /** Elapsed/total time on its own. */
  | "time"
  | "highlight"
  | "speed"
  /** Mute button plus volume slider. */
  | "volume"
  /** Jump backwards by `skipSeconds`. */
  | "skip-back"
  /** Jump forwards by `skipSeconds`. */
  | "skip-forward";

export const DEFAULT_CONTROLS: ControlName[] = ["play", "progress", "highlight", "speed", "volume"];

/** Shape of the player. `bar` is the default horizontal strip. */
export type PlayerVariant = "bar" | "minimal" | "card";

export type PlayerSize = "sm" | "md" | "lg";

/** What follows the spoken word as it plays. */
export type AutoScrollMode = "off" | "paragraph";

export interface AudioEntry {
  audioUrl: string;
  words?: AlignedWord[];
  duration?: number;
  /** Publishable key for the synthesis stream (v3 audio-map). */
  synthesisPublishableKey?: string;
}

export interface HighlightOptions {
  /** @default true */
  enabled?: boolean;
  /** Words kept marked behind the active one. @default 4 */
  trailLength?: number;
  /**
   * Clicking a word seeks to it.
   *
   * Independent of `enabled`: it used to live inside the highlighting branch, so
   * turning highlighting off silently disabled click-to-seek too.
   *
   * @default true
   */
  clickToSeek?: boolean;
}

export interface DockOptions {
  /** Show a floating player once the main one scrolls out of view. @default true */
  enabled?: boolean;
}

export interface AudioPlayerProps {
  /** Post slug, used to look up audio and to key saved playback position. */
  slug: string;
  /** Audio entry from audio-map.json. */
  audioEntry?: AudioEntry;

  /** Shape and scale. */
  variant?: PlayerVariant;
  size?: PlayerSize;
  /** Which controls to render, and in what order. */
  controls?: ControlName[];
  /** Playback rates offered by the speed menu. */
  speeds?: number[];
  /** How far the skip controls and arrow keys jump. @default 15 */
  skipSeconds?: number;

  /** Overrides for any visible text or accessible label. */
  strings?: Partial<SerializableStrings>;

  /** Selector for the element containing the article's word spans. */
  articleSelector?: string;
  highlight?: HighlightOptions;
  dock?: DockOptions;

  /**
   * Follow the spoken word by scrolling its paragraph into view.
   *
   * Defaults to off. It was previously forced on with no way to disable it, which
   * takes over the reader's scroll position while they are reading something else.
   *
   * @default "off"
   */
  autoScroll?: AutoScrollMode;

  /** Pause other players on the page when this one starts. @default true */
  exclusive?: boolean;

  /**
   * Remember speed, volume, mute and highlighting across pages and visits.
   * @default true
   */
  rememberPreferences?: boolean;

  /**
   * Resume where the reader left off, keyed by `slug`.
   *
   * Off by default: it is a pleasant surprise on a long article and a confusing one
   * on a short post that someone expects to start from the beginning.
   *
   * @default false
   */
  rememberPosition?: boolean;

  /**
   * Publish title and artwork to the OS media controls (lock screen, media keys).
   * @default true
   */
  mediaSession?: boolean;

  /** Title for the OS media controls. Falls back to the accessible label. */
  title?: string;
  /** Artwork URL for the OS media controls. */
  artwork?: string;

  /** Show a message when the article has no audio. @default true */
  showPlaceholder?: boolean;

  /** Extra classes on the player root. */
  class?: string;
  /** Overrides the generated element id. */
  id?: string;
}
