import type { AstroIntegration } from "astro";
import { loadVocaSyncConfig, type VocaSyncConfig, validateConfig } from "./config/index.js";
import { createEmptyAudioMap, loadAudioMap } from "./core/audio-map.js";
import type { AudioMap } from "./types/index.js";

// Cache for the loaded audio map
let audioMapCache: AudioMap | null = null;

/**
 * VocaSync Astro Integration.
 *
 * Provides:
 * - Virtual module `virtual:vocasync/audio-map` for accessing audio data
 * - Automatic rehype plugin for word-level highlighting
 * - Optional build-time sync command
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
export default function vocasyncIntegration(): AstroIntegration {
  return {
    name: "@vocasync/astro",
    hooks: {
      "astro:config:setup": async ({ updateConfig, logger }) => {
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
