import type { AstroIntegration } from "astro";
import { loadVocaSyncConfig, type VocaSyncConfig, validateConfig } from "./config/index.js";
import { createEmptyAudioMap, loadAudioMap } from "./core/audio-map.js";
import type { AudioMap } from "./types/index.js";

// Cache for the loaded audio map
let audioMapCache: AudioMap | null = null;

export interface VocaSyncThemeOptions {
  /**
   * A selector your site already uses to signal dark mode, e.g. `".dark"` or
   * `'[data-theme="night"]'`. The player's dark tokens are emitted under it as well.
   *
   * Usually unnecessary: `.dark`, `[data-theme="dark"]` and `[data-mode="dark"]` are
   * recognised out of the box, which covers Tailwind, next-themes, daisyUI and
   * Starlight. Reach for this only when your site signals dark mode some other way.
   */
  darkSelector?: string;
}

export interface VocaSyncOptions {
  /**
   * Inject the player stylesheet on every page. Set false to import the parts
   * yourself -- `@vocasync/astro/styles/vocasync.css`, or just `content.css` when you
   * drive the engine headlessly and ship your own chrome.
   *
   * @default true
   */
  styles?: boolean;
  theme?: VocaSyncThemeOptions;
}

/** Dark-mode tokens, emitted again under a host's own dark selector. */
const DARK_TOKENS = `
  --vocasync-accent: #60a5fa;
  --vocasync-surface: #1e293b;
  --vocasync-text: #f1f5f9;
  --vocasync-highlight: #34d399;
  --vocasync-accent-hover: #3b82f6;
  --vocasync-accent-content: #1e293b;
  --vocasync-surface-raised: #334155;
  --vocasync-text-muted: #94a3b8;
  --vocasync-text-faint: #64748b;
  --vocasync-border: #475569;
  --vocasync-track: #475569;
`;

/**
 * VocaSync Astro Integration.
 *
 * Provides:
 * - Virtual module `virtual:vocasync/audio-map` for accessing audio data
 * - The player stylesheet, injected on every page unless `styles: false`
 * - Optional build-time sync command
 *
 * It does NOT register the rehype plugins. Add `rehypeMathSpeech` and
 * `rehypeAudioWords` to `markdown.rehypePlugins` yourself; their order relative to
 * your maths renderer matters, so it is left explicit.
 *
 * @example
 * ```typescript
 * // astro.config.mjs
 * import vocasync from "@vocasync/astro";
 *
 * export default defineConfig({
 *   integrations: [vocasync()],
 * });
 *
 * // vocasync.config.mjs
 * export default {
 *   collection: { name: "blog", path: "./src/content/blog" },
 * };
 * ```
 */
export default function vocasyncIntegration(options: VocaSyncOptions = {}): AstroIntegration {
  const { styles = true, theme = {} } = options;
  return {
    name: "@vocasync/astro",
    hooks: {
      "astro:config:setup": async ({ updateConfig, injectScript, logger }) => {
        // Load config from vocasync.config.mjs
        let config: VocaSyncConfig;
        try {
          const userConfig = await loadVocaSyncConfig();
          config = validateConfig(userConfig);
        } catch (error) {
          logger.error(`Failed to load VocaSync config: ${error}`);
          throw error;
        }

        logger.info("VocaSync integration loaded");

        // Injected rather than left to the consumer: forgetting the import used to
        // yield an unstyled player AND invisible word highlighting, with no error.
        if (styles) {
          injectScript("page-ssr", 'import "@vocasync/astro/styles/vocasync.css";');
          if (theme.darkSelector) {
            injectScript("page-ssr", 'import "virtual:vocasync/theme.css";');
          }
        }

        // Pre-load audio map for rehype plugin
        try {
          audioMapCache = await loadAudioMap(config.output.audioMapPath);
          logger.info(`Loaded audio map with ${Object.keys(audioMapCache.entries).length} entries`);
        } catch {
          logger.warn(
            `Audio map not found at ${config.output.audioMapPath}. Run 'npx vocasync sync' first.`
          );
          audioMapCache = createEmptyAudioMap();
        }

        // Add virtual module for audio-map access
        updateConfig({
          vite: {
            plugins: [
              {
                name: "vite-plugin-vocasync",
                resolveId(id: string) {
                  if (id === "virtual:vocasync/audio-map") {
                    return "\0virtual:vocasync/audio-map";
                  }
                  if (id === "virtual:vocasync/config") {
                    return "\0virtual:vocasync/config";
                  }
                  // Keep the .css suffix: Vite decides how to handle a module by its
                  // extension, and without it this would be treated as JavaScript.
                  if (id === "virtual:vocasync/theme.css") {
                    return "\0virtual:vocasync/theme.css";
                  }
                  return null;
                },
                async load(id: string) {
                  if (id === "\0virtual:vocasync/audio-map") {
                    // Return cached audio map
                    return `export default ${JSON.stringify(audioMapCache)};`;
                  }
                  if (id === "\0virtual:vocasync/config") {
                    // Export the validated config
                    return `export default ${JSON.stringify(config)};`;
                  }
                  if (id === "\0virtual:vocasync/theme.css") {
                    if (!theme.darkSelector) return "";
                    return `@layer vocasync.tokens {\n  ${theme.darkSelector} {${DARK_TOKENS}  }\n}\n`;
                  }
                  return null;
                },
              },
            ],
          },
        });
      },

      "astro:build:done": ({ logger }) => {
        logger.info("VocaSync build complete");
      },
    },
  };
}

// Also export as named export
export { vocasyncIntegration as vocasync };
