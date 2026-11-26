import { describe, expect, test } from "bun:test";
import { defaultConfig, VoiceSchema } from "../src/config/index.js";
import {
  ALIGNMENT_LOCALES,
  SYNTHESIS_LANGUAGES,
  SYNTHESIS_SUPPORTED,
} from "../src/config/languages.js";
import { hashVoiceKey, LEGACY_ALIASES, sendVoice, VOICE_IDS } from "../src/config/voices.js";
import { contentHashFor, legacyContentHashFor } from "../src/sync/content-hash.js";

const base = { normalisedSpeechtext: "hello world", language: "en", format: "mp3", align: true };

describe("voice aliases", () => {
  test("each legacy name resolves to its VocaSync voice for sending", () => {
    expect(LEGACY_ALIASES).toEqual({
      alloy: "slate",
      ash: "atlas",
      coral: "juniper",
      echo: "beacon",
      fable: "hearth",
      onyx: "basalt",
      nova: "spark",
      sage: "willow",
      shimmer: "linen",
    });
    for (const [legacy, target] of Object.entries(LEGACY_ALIASES)) {
      expect(sendVoice(legacy)).toBe(target);
      expect(VOICE_IDS).toContain(target as never);
    }
    expect(sendVoice("basalt")).toBe("basalt");
    expect(sendVoice("oak")).toBe("oak");
  });

  test("hashVoiceKey maps an alias target back to the legacy name", () => {
    expect(hashVoiceKey("basalt")).toBe("onyx");
    expect(hashVoiceKey("slate")).toBe("alloy");
    expect(hashVoiceKey("onyx")).toBe("onyx");
    expect(hashVoiceKey("oak")).toBe("oak");
  });

  test("hashVoiceKey ignores Object.prototype members", () => {
    expect(hashVoiceKey("toString")).toBe("toString");
    expect(hashVoiceKey("constructor")).toBe("constructor");
    expect(hashVoiceKey("__proto__")).toBe("__proto__");
  });

  test("a legacy name and its target hash identically, in both hash shapes", () => {
    for (const [legacy, target] of Object.entries(LEGACY_ALIASES)) {
      const a = { ...base, voice: hashVoiceKey(legacy) };
      const b = { ...base, voice: hashVoiceKey(target) };
      expect(contentHashFor(a)).toBe(contentHashFor(b));
      expect(legacyContentHashFor(a)).toBe(legacyContentHashFor(b));
    }
  });

  test("the default is basalt, the target of the old default onyx", () => {
    expect(defaultConfig.synthesis.voice).toBe("basalt");
    expect(VoiceSchema.safeParse("basalt").success).toBe(true);
  });
});

describe("synthesis language set", () => {
  test("ships equal to the v2.1.2 set, and every alignment locale is supported", () => {
    expect([...SYNTHESIS_SUPPORTED].sort()).toEqual([...SYNTHESIS_LANGUAGES].sort());
    for (const code of Object.keys(ALIGNMENT_LOCALES)) {
      expect(SYNTHESIS_SUPPORTED).toContain(code);
    }
    expect(Object.keys(ALIGNMENT_LOCALES)).toHaveLength(13);
  });
});
