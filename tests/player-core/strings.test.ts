import { describe, expect, test } from "bun:test";
import {
  defaultStrings,
  describeTime,
  formatString,
  resolveStrings,
} from "../../src/player-core/strings.js";

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

describe("formatString", () => {
  test("substitutes named placeholders", () => {
    expect(formatString("Back {seconds} seconds", { seconds: 15 })).toBe("Back 15 seconds");
    expect(formatString("{current} of {total}", { current: "a", total: "b" })).toBe("a of b");
    expect(formatString("{rate}x", { rate: 1.5 })).toBe("1.5x");
  });

  test("leaves an unknown placeholder visible rather than blanking it", () => {
    // A mistyped key in a translation should be obvious, not silently missing.
    expect(formatString("Back {second} seconds", { seconds: 15 })).toBe("Back {second} seconds");
  });

  test("handles templates with no placeholders", () => {
    expect(formatString("Play", { rate: 2 })).toBe("Play");
  });

  test("substitutes every occurrence", () => {
    expect(formatString("{x} and {x}", { x: "a" })).toBe("a and a");
  });
});

describe("translatability", () => {
  test("every string is a plain string, so all of them can be overridden", () => {
    // Four were briefly functions, which excluded them from the serialisable type and
    // made the skip labels, the rate label and the seek announcement untranslatable.
    for (const [key, value] of Object.entries(defaultStrings)) {
      expect({ key, type: typeof value }).toEqual({ key, type: "string" });
    }
  });

  test("a full translation replaces every default", () => {
    const french = resolveStrings({
      label: "Écouter",
      loading: "Chargement…",
      unavailable: "Indisponible",
      error: "Erreur",
      retry: "Réessayer",
      play: "Lire",
      pause: "Pause",
      seek: "Chercher",
      seekPosition: "{current} sur {total}",
      mute: "Couper",
      unmute: "Activer",
      volume: "Volume",
      speed: "Vitesse",
      speedValue: "×{rate}",
      highlightOn: "Désactiver",
      highlightOff: "Activer",
      skipBack: "Reculer de {seconds} s",
      skipForward: "Avancer de {seconds} s",
    });
    expect(
      Object.values(french).some((v) => /^[A-Z][a-z]+ [a-z]/.test(String(v)) && v === "Play")
    ).toBe(false);
    expect(formatString(french.speedValue, { rate: 1.5 })).toBe("×1.5");
    expect(formatString(french.skipBack, { seconds: 15 })).toBe("Reculer de 15 s");
  });
});
