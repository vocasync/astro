export { loadVocaSyncConfig } from "./loader.js";

export type {
  CollectionConfig,
  Format,
  Language,
  MathConfig,
  MathStyle,
  OutputConfig,
  ProcessingConfig,
  Quality,
  SynthesisConfig,
  VocaSyncConfig,
  VocaSyncUserConfig,
  Voice,
} from "./schema.js";
export {
  CollectionConfigSchema,
  defaultConfig,
  FormatSchema,
  LanguageSchema,
  MathConfigSchema,
  MathStyleSchema,
  OutputConfigSchema,
  ProcessingConfigSchema,
  QualitySchema,
  SynthesisConfigSchema,
  VocaSyncConfigSchema,
  VoiceSchema,
  validateConfig,
} from "./schema.js";
