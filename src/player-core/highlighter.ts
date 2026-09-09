import {
  computeSpanTimings,
  EPS,
  idxForTime,
  type SpanTiming,
  trailRange,
  type WordTiming,
} from "./timings.js";

/**
 * Binds alignment timings to the `.vocasync-word[data-i][data-n]` spans the rehype
 * plugin emitted, and keeps the active word and its trail in sync with a time.
 *
 * Owns no audio element and no animation loop -- the caller drives it by calling
 * `update(time)`. Class names are options rather than literals so the same engine can
 * serve markup that does not use the default prefix.
 */

const PARAGRAPH_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th";

export interface HighlighterOptions {
  /** Element containing the word spans. */
  articleRoot: Element;
  /** Alignment timings, indexed by `data-i`. */
  words: readonly WordTiming[];
  /** How many spans behind the active one stay marked. */
  trailLength?: number;
  wordSelector?: string;
  activeClass?: string;
  trailClass?: string;
  /** Scroll the active word's paragraph into view when it changes. */
  autoScroll?: boolean;
  /** Injected so the engine stays testable and window-free. */
  prefersReducedMotion?: () => boolean;
  /** Called when the active word changes, including to none during silence. */
  onWordChange?: (el: HTMLElement | null) => void;
}

export interface Highlighter {
  /** Number of resolved spans; 0 means there is nothing to highlight. */
  readonly size: number;
  update(time: number): void;
  /** Remove every mark this highlighter applied. */
  clear(): void;
  /** Start time of the alignment token at `dataI`, or null. */
  startOfToken(dataI: number): number | null;
  setAutoScroll(enabled: boolean): void;
  destroy(): void;
}

export function createHighlighter(options: HighlighterOptions): Highlighter {
  const {
    articleRoot,
    words,
    trailLength = 4,
    wordSelector = ".vocasync-word[data-i]",
    activeClass = "is-active",
    trailClass = "is-trail",
    prefersReducedMotion = () => false,
  } = options;

  let autoScroll = options.autoScroll ?? false;

  const spans = Array.from(articleRoot.querySelectorAll(wordSelector)) as HTMLElement[];
  const spanTimings: SpanTiming<HTMLElement>[] = computeSpanTimings(
    spans.map((el) => ({
      dataI: Number.parseInt(el.dataset.i ?? "", 10),
      dataN: Number.parseInt(el.dataset.n ?? "", 10),
      ref: el,
    })),
    words
  );

  let activeEl: HTMLElement | null = null;
  let trailStart = 0;
  let trailEnd = 0;
  let lastScrolledParagraph: Element | null = null;

  function setActive(el: HTMLElement | null) {
    if (activeEl === el) return;
    if (activeEl) activeEl.classList.remove(activeClass);
    if (el) el.classList.add(activeClass);
    activeEl = el;
    options.onWordChange?.(el);
  }

  function clearTrail() {
    for (let i = trailStart; i < trailEnd; i++) {
      spanTimings[i]?.ref.classList.remove(trailClass);
    }
    trailStart = 0;
    trailEnd = 0;
  }

  function scrollActiveIntoView(el: HTMLElement) {
    const paragraph = el.closest(PARAGRAPH_SELECTOR);
    if (!paragraph || paragraph === lastScrolledParagraph) return;
    paragraph.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    });
    lastScrolledParagraph = paragraph;
  }

  return {
    get size() {
      return spanTimings.length;
    },

    update(time) {
      if (!spanTimings.length) return;
      if (!Number.isFinite(time)) return;

      // One index drives both the active word and the trail, exactly as the
      // original did: computing them separately lets them disagree by one at a
      // span boundary, which shows up as a word that is both active and trailing.
      const lo = idxForTime(spanTimings, time + EPS);
      const candidate = spanTimings[lo];
      const active =
        candidate && time >= candidate.start - EPS && time < candidate.end + EPS
          ? candidate.ref
          : null;

      setActive(active);
      if (autoScroll && activeEl) scrollActiveIntoView(activeEl);

      // Differential trail: only touch spans that entered or left the range.
      const next = trailRange(lo, trailLength);
      for (let i = trailStart; i < trailEnd; i++) {
        if (i < next.start || i >= next.end) spanTimings[i]?.ref.classList.remove(trailClass);
      }
      for (let i = next.start; i < next.end; i++) {
        if (i < trailStart || i >= trailEnd) spanTimings[i]?.ref.classList.add(trailClass);
      }
      trailStart = next.start;
      trailEnd = next.end;
    },

    clear() {
      setActive(null);
      clearTrail();
      lastScrolledParagraph = null;
    },

    startOfToken(dataI) {
      const timing = words[dataI];
      return timing && typeof timing.start === "number" ? timing.start : null;
    },

    setAutoScroll(enabled) {
      autoScroll = enabled;
      if (!enabled) lastScrolledParagraph = null;
    },

    destroy() {
      this.clear();
    },
  };
}
