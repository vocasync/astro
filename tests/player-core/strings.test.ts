import { describe, expect, test } from "bun:test";
import { defaultStrings, describeTime, resolveStrings } from "../../src/player-core/strings.js";

describe("resolveStrings", () => {
  test("falls back to English for anything not overridden", () => {
    const s = resolveStrings({ play: "Lire" });
    expect(s.play).toBe("Lire");
    expect(s.pause).toBe(defaultStrings.pause);
  });

  test("ignores a missing overrides object", () => {
    expect(resolveStrings()).toEqual(defaultStrings);
    expect(resolveStrings(undefined).play).toBe("Play");
  });

  test("covers every visible string and every announced label", () => {
    // A key added to the interface but not to the defaults would leave that piece of
    // UI untranslatable while looking fine in English.
    for (const key of Object.keys(defaultStrings)) {
      expect(defaultStrings[key as keyof typeof defaultStrings]).toBeTruthy();
    }
  });
});

describe("describeTime", () => {
  test("speaks a duration rather than reading a number", () => {
    // The seek slider announced "43" to a screen reader.
    expect(describeTime(43)).toBe("43 seconds");
    expect(describeTime(60)).toBe("1 minute");
    expect(describeTime(90)).toBe("1 minute 30 seconds");
    expect(describeTime(150)).toBe("2 minutes 30 seconds");
    expect(describeTime(3600)).toBe("60 minutes");
  });

  test("singularises", () => {
    expect(describeTime(1)).toBe("1 second");
    expect(describeTime(61)).toBe("1 minute 1 second");
  });

  test("handles zero and nonsense without throwing", () => {
    expect(describeTime(0)).toBe("0 seconds");
    expect(describeTime(-5)).toBe("0 seconds");
    expect(describeTime(Number.NaN)).toBe("0 seconds");
    expect(describeTime(Number.POSITIVE_INFINITY)).toBe("0 seconds");
  });
});
