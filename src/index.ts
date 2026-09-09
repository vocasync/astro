/**
 * @vocasync/astro - VocaSync integration for Astro
 *
 * Text-to-speech synthesis and word-level alignment for Astro static sites.
 *
 * @example
 * ```typescript
 * // astro.config.ts
 * import { defineConfig } from "astro/config";
 * import vocasync from "@vocasync/astro";
 *
 * export default defineConfig({
 *   integrations: [
 *     vocasync({
 *       collection: {
 *         name: "blog",
 *         path: "./src/content/blog",
 *       },
 *       language: "en-US",
 *     }),
 *   ],
 * });
 * ```
 */

export type {
  Format,
  Language,
  MathStyle,
  Quality,
  VocaSyncConfig,
  VocaSyncUserConfig,
  Voice,
} from "./config/index.js";
// Configuration
export {
  defaultConfig,
  FormatSchema,
  LanguageSchema,
  QualitySchema,
  VocaSyncConfigSchema,
  VoiceSchema,
  validateConfig,
} from "./config/index.js";
export { getAudioEntry, loadAudioMap, saveAudioMap } from "./core/audio-map.js";
// Core utilities (for advanced usage)
export { loadContent } from "./core/content-loader.js";
export { computeHash } from "./core/hash-manager.js";
export { buildSpeechDocument } from "./core/speech-builder.js";
// Astro Integration
export { default, default as vocasync } from "./integration.js";
// Types
export type {
  AlignedWord,
  AudioArtifact,
  AudioMap,
  ContentItem,
  SpeechDocument,
  SyncResult,
  SyncStatus,
  SyncSummary,
} from "./types/index.js";
