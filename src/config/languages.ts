/**
 * Language support, which is not one list but two.
 *
 * Speech synthesis covers 57 languages. Forced alignment -- the word-level timing
 * that drives highlighting and click-to-seek -- covers far fewer. A post that needs
 * highlighting is therefore limited to the intersection; a post synthesised without
 * alignment is limited only by the voice.
 *
 * Both lists mirror the enums published in the VocaSync OpenAPI document. Korean was
 * withdrawn from alignment in September 2026 and remains available for synthesis.
 */

/** Every language the synthesis voices can speak, ISO 639-1. */
export const SYNTHESIS_LANGUAGES = [
  "af", // Afrikaans
  "ar", // Arabic
  "hy", // Armenian
  "az", // Azerbaijani
  "be", // Belarusian
  "bs", // Bosnian
  "bg", // Bulgarian
  "ca", // Catalan
  "zh", // Chinese
  "hr", // Croatian
  "cs", // Czech
  "da", // Danish
  "nl", // Dutch
  "en", // English
  "et", // Estonian
  "fi", // Finnish
  "fr", // French
  "gl", // Galician
  "de", // German
  "el", // Greek
  "he", // Hebrew
  "hi", // Hindi
  "hu", // Hungarian
  "is", // Icelandic
  "id", // Indonesian
  "it", // Italian
  "ja", // Japanese
  "kn", // Kannada
  "kk", // Kazakh
  "ko", // Korean
  "lv", // Latvian
  "lt", // Lithuanian
  "mk", // Macedonian
  "ms", // Malay
  "mr", // Marathi
  "mi", // Maori
  "ne", // Nepali
  "no", // Norwegian
  "fa", // Persian
  "pl", // Polish
  "pt", // Portuguese
  "ro", // Romanian
  "ru", // Russian
  "sr", // Serbian
  "sk", // Slovak
  "sl", // Slovenian
  "es", // Spanish
  "sw", // Swahili
  "sv", // Swedish
  "tl", // Tagalog
  "ta", // Tamil
  "th", // Thai
  "tr", // Turkish
  "uk", // Ukrainian
  "ur", // Urdu
  "vi", // Vietnamese
  "cy", // Welsh
] as const;

/**
 * Synthesis languages that can also be force-aligned, mapped to the locale the
 * alignment API expects. A language absent from here can still be synthesised --
 * it simply cannot carry word timings.
 */
export const ALIGNMENT_LOCALES: Readonly<Record<string, string>> = {
  en: "en-US", // English
  fr: "fr", // French
  de: "de", // German
  es: "es", // Spanish
  pt: "pt-PT", // Portuguese
  sv: "sv", // Swedish
  cs: "cs", // Czech
  pl: "pl", // Polish
  tr: "tr", // Turkish
  ru: "ru", // Russian
  uk: "uk", // Ukrainian
  ja: "ja", // Japanese
  zh: "zh-CN", // Chinese
};

/** Human-readable names, for error messages and docs. */
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  af: "Afrikaans",
  ar: "Arabic",
  hy: "Armenian",
  az: "Azerbaijani",
  be: "Belarusian",
  bs: "Bosnian",
  bg: "Bulgarian",
  ca: "Catalan",
  zh: "Chinese",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  nl: "Dutch",
  en: "English",
  et: "Estonian",
  fi: "Finnish",
  fr: "French",
  gl: "Galician",
  de: "German",
  el: "Greek",
  he: "Hebrew",
  hi: "Hindi",
  hu: "Hungarian",
  is: "Icelandic",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  kn: "Kannada",
  kk: "Kazakh",
  ko: "Korean",
  lv: "Latvian",
  lt: "Lithuanian",
  mk: "Macedonian",
  ms: "Malay",
  mr: "Marathi",
  mi: "Maori",
  ne: "Nepali",
  no: "Norwegian",
  fa: "Persian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sr: "Serbian",
  sk: "Slovak",
  sl: "Slovenian",
  es: "Spanish",
  sw: "Swahili",
  sv: "Swedish",
  tl: "Tagalog",
  ta: "Tamil",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
  cy: "Welsh",
};

/** True when a language can carry word-level timings. */
export function canAlign(language: string): boolean {
  return Object.hasOwn(ALIGNMENT_LOCALES, language);
}

/**
 * The locale the alignment API expects, or null when the language cannot align.
 *
 * Returning null rather than defaulting matters: the previous implementation fell
 * back to `en-US` for anything unrecognised, so a language outside the aligned set
 * would have been aligned against an English acoustic model -- producing timings
 * that are confidently wrong rather than an error.
 */
export function toAlignmentLocale(language: string): string | null {
  return ALIGNMENT_LOCALES[language] ?? null;
}
