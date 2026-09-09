import { describe, expect, test } from "bun:test";
import { FormatSchema, LanguageSchema, VoiceSchema, validateConfig } from "../src/config/index.js";
import {
  ALIGNMENT_LOCALES,
  canAlign,
  SYNTHESIS_LANGUAGES,
  toAlignmentLocale,
} from "../src/config/languages.js";

describe("config schemas", () => {
  test("accepts all 9 platform voices", () => {
    const voices = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"];
    for (const v of voices) expect(VoiceSchema.safeParse(v).success).toBe(true);
    expect(voices).toHaveLength(9);
  });

  test("rejects unknown voices", () => {
    expect(VoiceSchema.safeParse("verse").success).toBe(false);
  });

  test("accepts all 5 output formats incl wav", () => {
    for (const f of ["mp3", "aac", "opus", "flac", "wav"]) {
      expect(FormatSchema.safeParse(f).success).toBe(true);
    }
    expect(FormatSchema.safeParse("ogg").success).toBe(false);
  });

  test("accepts every language the voices can speak", () => {
    // Synthesis is the wider of the two lists; alignment is checked separately.
    expect(SYNTHESIS_LANGUAGES).toHaveLength(57);
    for (const l of SYNTHESIS_LANGUAGES) {
      expect(LanguageSchema.safeParse(l).success).toBe(true);
    }
    // Languages that can be narrated but not highlighted.
    for (const l of ["hi", "th", "vi", "ko"]) {
      expect(LanguageSchema.safeParse(l).success).toBe(true);
    }
    expect(LanguageSchema.safeParse("xx").success).toBe(false);
  });

  test("alignment covers a strict subset of synthesis", () => {
    const aligned = Object.keys(ALIGNMENT_LOCALES);
    expect(aligned.length).toBeLessThan(SYNTHESIS_LANGUAGES.length);
    for (const l of aligned) {
      expect(SYNTHESIS_LANGUAGES).toContain(l);
    }
  });

  test("Korean synthesises but no longer aligns", () => {
    // Withdrawn from alignment in September 2026. The plugin still advertised it,
    // so a Korean post would have paid for synthesis and then failed to align.
    expect(LanguageSchema.safeParse("ko").success).toBe(true);
    expect(canAlign("ko")).toBe(false);
    expect(toAlignmentLocale("ko")).toBeNull();
  });

  test("an unalignable language returns no locale, rather than defaulting to English", () => {
    // The previous implementation fell back to `en-US` for anything unrecognised,
    // which would align Thai audio against an English acoustic model and yield
    // timings that are confidently wrong instead of an error.
    expect(toAlignmentLocale("th")).toBeNull();
    expect(toAlignmentLocale("en")).toBe("en-US");
    expect(toAlignmentLocale("zh")).toBe("zh-CN");
  });

  test("rejects a language that cannot align while alignment is on", () => {
    expect(() =>
      validateConfig({ collection: { name: "b", path: "./p" }, language: "th" })
    ).toThrow(/cannot carry the word timings|not force-aligned/);
  });

  test("accepts the same language once alignment is turned off", () => {
    const config = validateConfig({
      collection: { name: "b", path: "./p" },
      language: "th",
      align: false,
    });
    expect(config.language).toBe("th");
    expect(config.align).toBe(false);
  });

  test("the rejection names the language and says how to proceed", () => {
    // An error that only says "invalid" leaves the reader to guess.
    try {
      validateConfig({ collection: { name: "b", path: "./p" }, language: "hi" });
      throw new Error("should have thrown");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("Hindi");
      expect(message).toContain("align: false");
      expect(message).toContain("English");
    }
  });

  test("validateConfig fills defaults", () => {
    const config = validateConfig({ collection: { name: "blog", path: "./src/content/blog" } });
    expect(config.synthesis.voice).toBe("onyx");
    expect(config.synthesis.format).toBe("mp3");
    expect(config.language).toBe("en");
  });
});
