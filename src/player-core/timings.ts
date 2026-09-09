/**
 * Pure word-highlighting math. No DOM, no audio element, no side effects.
 *
 * The rehype plugin wraps each visible word in a span carrying `data-i` (its start
 * index in the alignment word stream) and `data-n` (how many alignment tokens it
 * consumes). One visible unit can span several tokens -- "$50" is spoken as two
 * tokens, an equation as many -- so its span runs from the earliest start to the
 * latest end of the tokens it covers.
 *
 * `ref` is passed through opaquely: the DOM element in the browser, an id in tests.
 */

/** Tolerance for float comparisons against alignment timings. */
export const EPS = 0.0001;

/** A word timing from the alignment stream. */
export interface WordTiming {
  start: number;
  end: number;
}

/** A visible unit and the slice of the alignment stream it covers. */
export interface SpanItem<Ref> {
  dataI: number;
  dataN: number;
  ref: Ref;
}

/** A visible unit resolved to a time span. */
export interface SpanTiming<Ref> {
  start: number;
  end: number;
  ref: Ref;
}

/**
 * Resolve each visible unit to `min(start)..max(end)` over the alignment tokens it
 * covers. Units whose tokens are all missing are dropped rather than guessed at, so a
 * stale audio map degrades to "some words never highlight" instead of highlighting
 * the wrong ones. The result is sorted by start time, which `idxForTime` relies on.
 */
export function computeSpanTimings<Ref>(
  items: readonly SpanItem<Ref>[],
  words: readonly WordTiming[]
): SpanTiming<Ref>[] {
  const out: SpanTiming<Ref>[] = [];

  for (const item of items) {
    const { dataI, dataN, ref } = item;
    if (!Number.isFinite(dataI) || !Number.isFinite(dataN) || dataN < 1) continue;

    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = Number.NEGATIVE_INFINITY;
    for (let k = dataI; k < dataI + dataN; k++) {
      const t = words[k];
      if (!t) continue;
      if (t.start < minStart) minStart = t.start;
      if (t.end > maxEnd) maxEnd = t.end;
    }

    if (Number.isFinite(minStart) && Number.isFinite(maxEnd)) {
      // Widen a zero-length or inverted span. `idxForTime` advances past any span
      // whose end is <= t, so a span with end == start can never be selected and the
      // word would silently never highlight. Only degenerate alignment data is
      // affected; every real span already has end > start.
      if (!(maxEnd > minStart)) maxEnd = minStart + EPS;
      out.push({ start: minStart, end: maxEnd, ref });
    }
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Index of the first span whose end is after `t`. Returns `spanTimings.length` when
 * `t` is past every span, and -1 when there are none. The result is a *candidate*:
 * the caller still has to check that `t` falls inside that span, because the audio
 * has real silence between words where nothing should be highlighted.
 */
export function idxForTime<Ref>(spanTimings: readonly SpanTiming<Ref>[], t: number): number {
  const n = spanTimings.length;
  if (!n) return -1;

  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spanTimings[mid].end <= t) lo = mid + 1;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The span active at `t`, or null when `t` falls in silence between words.
 */
export function spanAtTime<Ref>(
  spanTimings: readonly SpanTiming<Ref>[],
  t: number
): SpanTiming<Ref> | null {
  if (!Number.isFinite(t)) return null;
  const lo = idxForTime(spanTimings, t + EPS);
  const entry = spanTimings[lo];
  if (!entry) return null;
  return t >= entry.start - EPS && t < entry.end + EPS ? entry : null;
}

/**
 * The half-open range `[start, end)` of spans forming the trail behind index `lo`.
 */
export function trailRange(lo: number, trailLength: number): { start: number; end: number } {
  const end = Math.max(0, lo);
  return { start: Math.max(0, end - Math.max(0, trailLength)), end };
}
