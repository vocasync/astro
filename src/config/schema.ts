import { z } from "zod";

/**
 * Supported TTS voices (matches the platform's 9 OpenAI voices)
 */
export const VoiceSchema = z.enum([
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
]);
export type Voice = z.infer<typeof VoiceSchema>;

/**
 * Supported audio qualities
 */
export const QualitySchema = z.enum(["sd", "hd"]);
export type Quality = z.infer<typeof QualitySchema>;

/**
 * Supported audio output formats (matches the platform's OUTPUT_FORMATS).
 * mp3 is the default for the broadest <audio> compatibility.
 */
export const FormatSchema = z.enum(["mp3", "aac", "opus", "flac", "wav"]);
export type Format = z.infer<typeof FormatSchema>;

/**
 * Supported languages for synthesis + alignment
 * Uses short ISO 639-1 codes as expected by the VocaSync API
 * Only languages where both OpenAI TTS synthesis and MFA forced alignment are available
 */
export const LanguageSchema = z.enum([
  "zh",
  "cs",
  "en",
  "fr",
  "de",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "es",
  "sv",
  "tr",
  "uk",
]);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * Math speech styles
 */
export const MathStyleSchema = z.enum(["clearspeak", "mathspeak"]);
export type MathStyle = z.infer<typeof MathStyleSchema>;

/**
 * Collection configuration
 */
export const CollectionConfigSchema = z.object({
  /** Name of the Astro content collection */
  name: z.string().min(1),
  /** Path to the content directory */
  path: z.string().min(1),
  /** Field used for unique slug identification */
  slugField: z.string().default("slug"),
});
export type CollectionConfig = z.infer<typeof CollectionConfigSchema>;

/**
 * Synthesis options
 */
export const SynthesisConfigSchema = z.object({
  /** TTS voice to use */
  voice: VoiceSchema.default("onyx"),
  /** Audio quality */
  quality: QualitySchema.default("sd"),
  /** Output format */
  format: FormatSchema.default("mp3"),
});
export type SynthesisConfig = z.infer<typeof SynthesisConfigSchema>;

/**
 * Math/LaTeX configuration
 */
export const MathConfigSchema = z.object({
  /** Enable LaTeX to speech conversion */
  enabled: z.boolean().default(false),
  /** Speech style for math expressions */
  style: MathStyleSchema.default("clearspeak"),
});
export type MathConfig = z.infer<typeof MathConfigSchema>;

/**
 * Output configuration
 */
export const OutputConfigSchema = z.object({
  /** Path to store the audio-map.json artifact */
  audioMapPath: z.string().default("./src/data/audio-map.json"),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

/**
 * Processing options
 */
export const ProcessingConfigSchema = z.object({
  /** Number of concurrent synthesis jobs */
  concurrency: z.number().int().min(1).max(10).default(3),
  /** Force reprocessing even if content hasn't changed */
  force: z.boolean().default(false),
});
export type ProcessingConfig = z.infer<typeof ProcessingConfigSchema>;

/**
 * Main VocaSync configuration schema
 */
export const VocaSyncConfigSchema = z.object({
  /** Content collection settings */
  collection: CollectionConfigSchema,
  /** Language for synthesis (e.g., "en", "fr", "de") */
  language: LanguageSchema.default("en"),
  /** Synthesis options */
  synthesis: SynthesisConfigSchema.prefault({}),
  /** Math/LaTeX support */
  math: MathConfigSchema.prefault({}),
  /** Output paths */
  output: OutputConfigSchema.prefault({}),
  /** Frontmatter field to check for audio opt-in/out (true/false) */
  frontmatterField: z.string().optional(),
  /** Processing options */
  processing: ProcessingConfigSchema.prefault({}),
});

export type VocaSyncConfig = z.infer<typeof VocaSyncConfigSchema>;

/**
 * User-facing config type (with optional defaults)
 */
export type VocaSyncUserConfig = {
  collection: {
    name: string;
    path: string;
    slugField?: string;
  };
  language?: Language;
  synthesis?: {
    voice?: Voice;
    quality?: Quality;
    format?: Format;
  };
  math?: {
    enabled?: boolean;
    style?: MathStyle;
  };
  output?: {
    audioMapPath?: string;
  };
  frontmatterField?: string;
  processing?: {
    concurrency?: number;
    force?: boolean;
  };
};

/**
 * Validate and normalize user configuration
 */
export function validateConfig(userConfig: VocaSyncUserConfig): VocaSyncConfig {
  return VocaSyncConfigSchema.parse(userConfig);
}

/**
 * Default configuration values
 */
export const defaultConfig: Omit<VocaSyncConfig, "collection"> = {
  language: "en",
  synthesis: {
    voice: "onyx",
    quality: "sd",
    format: "mp3",
  },
  math: {
    enabled: false,
    style: "clearspeak",
  },
  output: {
    audioMapPath: "./src/data/audio-map.json",
  },
  processing: {
    concurrency: 3,
    force: false,
  },
};
