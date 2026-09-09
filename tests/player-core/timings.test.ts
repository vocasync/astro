import { describe, expect, test } from "bun:test";
import {
  computeSpanTimings,
  idxForTime,
  spanAtTime,
  trailRange,
  type WordTiming,
} from "../../src/player-core/timings.js";

/**
 * Seeded from the WordPress fork's tests/js/highlight-core.test.js, which had already
 * isolated this maths; the Astro player inlined an untested copy of the same
 * algorithm. Extending it here with the silence and trail cases the original lacked.
 */

const words: WordTiming[] = [
  { start: 0.0, end: 0.4 }, // 0
  { start: 0.4, end: 0.9 }, // 1
  { start: 0.9, end: 1.5 }, // 2
  { start: 1.5, end: 2.0 }, // 3
];

describe("computeSpanTimings", () => {
  test("maps one alignment token per visible word", () => {
    const out = computeSpanTimings(
      [
        { dataI: 0, dataN: 1, ref: "a" },
        { dataI: 1, dataN: 1, ref: "b" },
      ],
      words
    );
    expect(out).toEqual([
      { start: 0.0, end: 0.4, ref: "a" },
      { start: 0.4, end: 0.9, ref: "b" },
    ]);
  });

  test("spans a multi-token unit from earliest start to latest end", () => {
    // "$50" is one visible word but two spoken tokens.
    const out = computeSpanTimings([{ dataI: 1, dataN: 2, ref: "price" }], words);
    expect(out).toEqual([{ start: 0.4, end: 1.5, ref: "price" }]);
  });

  test("drops units whose tokens are missing, rather than guessing", () => {
    const out = computeSpanTimings(
      [
        { dataI: 3, dataN: 1, ref: "late" },
        { dataI: 99, dataN: 1, ref: "missing" },
        { dataI: 0, dataN: 1, ref: "early" },
      ],
      words
    );
    expect(out.map((s) => s.ref)).toEqual(["early", "late"]);
  });

  test("ignores malformed data-i / data-n", () => {
    expect(
      computeSpanTimings(
        [
          { dataI: 0, dataN: 0, ref: "zero" },
          { dataI: Number.NaN, dataN: 1, ref: "nan" },
          { dataI: 0, dataN: Number.NaN, ref: "nan-n" },
        ],
        words
      )
    ).toEqual([]);
  });

  test("widens a zero-length span so it stays reachable", () => {
    const degenerate: WordTiming[] = [{ start: 1, end: 1 }];
    const [span] = computeSpanTimings([{ dataI: 0, dataN: 1, ref: "x" }], degenerate);
    expect(span.end).toBeGreaterThan(span.start);
  });

  test("returns spans sorted by start even when input is not", () => {
    const out = computeSpanTimings(
      [
        { dataI: 2, dataN: 1, ref: "c" },
        { dataI: 0, dataN: 1, ref: "a" },
        { dataI: 1, dataN: 1, ref: "b" },
      ],
      words
    );
    expect(out.map((s) => s.ref)).toEqual(["a", "b", "c"]);
  });

  test("handles an empty word stream", () => {
    expect(computeSpanTimings([{ dataI: 0, dataN: 1, ref: "a" }], [])).toEqual([]);
  });
});

describe("idxForTime", () => {
  const spans = computeSpanTimings(
    words.map((_, i) => ({ dataI: i, dataN: 1, ref: String(i) })),
    words
  );

  test("returns -1 when there are no spans", () => {
    expect(idxForTime([], 1)).toBe(-1);
  });

  test("finds the first span whose end is after t", () => {
    expect(idxForTime(spans, 0.0)).toBe(0);
    expect(idxForTime(spans, 0.5)).toBe(1);
    expect(idxForTime(spans, 1.0)).toBe(2);
    expect(idxForTime(spans, 1.9)).toBe(3);
  });

  test("treats a boundary as belonging to the following span", () => {
    expect(idxForTime(spans, 0.4)).toBe(1);
  });

  test("returns the length once t is past every span", () => {
    expect(idxForTime(spans, 99)).toBe(spans.length);
  });

  test("agrees with a linear scan across the whole range", () => {
    for (let t = -0.5; t <= 2.5; t += 0.01) {
      const expected = spans.findIndex((s) => s.end > t);
      expect(idxForTime(spans, t)).toBe(expected === -1 ? spans.length : expected);
    }
  });
});

describe("spanAtTime", () => {
  test("returns null inside a gap between words", () => {
    // A stream with real silence from 0.4 to 1.0.
    const gapped: WordTiming[] = [
      { start: 0.0, end: 0.4 },
      { start: 1.0, end: 1.4 },
    ];
    const spans = computeSpanTimings(
      gapped.map((_, i) => ({ dataI: i, dataN: 1, ref: String(i) })),
      gapped
    );
    expect(spanAtTime(spans, 0.7)).toBeNull();
    expect(spanAtTime(spans, 0.2)?.ref).toBe("0");
    expect(spanAtTime(spans, 1.2)?.ref).toBe("1");
  });

  test("returns null before the first and after the last span", () => {
    const spans = computeSpanTimings([{ dataI: 1, dataN: 1, ref: "b" }], words);
    expect(spanAtTime(spans, 0.0)).toBeNull();
    expect(spanAtTime(spans, 99)).toBeNull();
  });

  test("returns null for a non-finite time", () => {
    const spans = computeSpanTimings([{ dataI: 0, dataN: 1, ref: "a" }], words);
    expect(spanAtTime(spans, Number.NaN)).toBeNull();
  });
});

describe("trailRange", () => {
  test("covers the N spans before the active one", () => {
    expect(trailRange(10, 4)).toEqual({ start: 6, end: 10 });
  });

  test("clamps at the start of the stream", () => {
    expect(trailRange(2, 4)).toEqual({ start: 0, end: 2 });
  });

  test("is empty for a zero-length trail", () => {
    expect(trailRange(10, 0)).toEqual({ start: 10, end: 10 });
  });

  test("tolerates a negative index or length", () => {
    expect(trailRange(-1, 4)).toEqual({ start: 0, end: 0 });
    expect(trailRange(5, -2)).toEqual({ start: 5, end: 5 });
  });
});
