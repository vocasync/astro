import type { Element, Root, Text } from "hast";
import type { Plugin } from "unified";
import { visitParents } from "unist-util-visit-parents";
import { spokenTokenCount } from "../core/spoken-form.js";
import { loadAudioMapSync, resolveSlug } from "./shared.js";

/**
 * Options for the rehype audio words plugin.
 */
export interface RehypeAudioWordsOptions {
  /**
   * Path to the audio map JSON file (absolute or relative to project root).
   * @default ".vocasync/audio-map.json"
   */
  audioMapPath?: string;
  /**
   * An extra class added to every word span, alongside `vocasync-word`.
   *
   * Additive on purpose. The previous `classPrefix` option renamed the span class but
   * nothing else: `.vocasync-word` stayed hardcoded in the stylesheet, the player and
   * the WordPress fork, and `.vocasync-click-seek` and `.vocasync-math` were never
   * covered at all -- so setting it silently broke highlighting. If you need to
   * restyle the spans, target this class or override the tokens; if you need entirely
   * different markup, drive the engine yourself via `@vocasync/astro/player-core`.
   */
  extraWordClass?: string;
  /**
   * Content collection folder name used to extract slugs.
   * @default "articles"
   */
  collectionName?: string;
}

// Matches a visible "word": letters/digits/currency/percent, with intra-word
// apostrophes. Currency (\p{Sc}) and % are kept attached to their number so
// "$50" and "50%" stay single tokens whose spokenTokenCount matches the
// transcript ("fifty dollar", "fifty percent"). Comma-grouped numbers
// (e.g. "1,000,000") are a known limitation — author numbers without commas.
const WORD_PATTERN = /[\p{L}\p{N}\p{Sc}%]+(?:['’][\p{L}\p{N}\p{Sc}%]+)*/gu;

const SKIP_TAGS = new Set([
  "pre",
  "code",
  "script",
  "style",
  "textarea",
  "svg",
  "math",
  "mjx-container",
  "img",
  "figcaption",
]);
const SKIP_CLASSES = new Set(["katex", "katex-mathml", "katex-html"]);

/**
 * Rehype plugin that wraps each visible word in
 * `<span class="vocasync-word" data-i="N" data-n="K">…</span>`:
 *
 *   data-i = the word's starting index in the alignment word stream
 *            (the normalisedSpeechtext POSTed to VocaSync).
 *   data-n = how many alignment tokens this visible word expands to
 *            (via spokenTokenCount): "$50" -> 2, "1995" -> 6, words -> 1.
 *
 * No alignment data is fetched here — tokenization is deterministic and runs
 * the same `spokenTokenCount` used to build the transcript, so indices line
 * up token-for-token. Math containers carrying `data-speech` (attached by
 * rehypeMathSpeech) are wrapped as a single unit with their token count.
 */
const rehypeAudioWords: Plugin<[RehypeAudioWordsOptions?], Root> = (options = {}) => {
  const {
    audioMapPath = ".vocasync/audio-map.json",
    extraWordClass,
    collectionName = "articles",
  } = options;
  const wordClasses = extraWordClass ? ["vocasync-word", extraWordClass] : ["vocasync-word"];

  return (tree, file) => {
    const audioMap = loadAudioMapSync(audioMapPath);
    if (!audioMap) return;

    const slug = resolveSlug(file, collectionName);
    if (!slug || !audioMap.entries[slug]) return; // only wrap posts that have audio

    let nextIndex = 0;
    const replacements: Array<{
      parent: Element | Root;
      index: number;
      nodes: (Text | Element)[];
    }> = [];

    visitParents(
      tree,
      (node) => node.type === "text" || (node.type === "element" && hasDataSpeech(node as Element)),
      (node, ancestors) => {
        const parent = ancestors[ancestors.length - 1] as Element | Root | undefined;
        if (!parent) return;

        // Math container with attached spoken form -> wrap as one unit.
        if (node.type === "element") {
          const speech = (node as Element).properties?.dataSpeech;
          if (typeof speech !== "string" || !speech) return;
          const count = spokenTokenCount(speech);
          if (count === 0) return;
          const index = parent.children.indexOf(node as Element);
          if (index === -1) return;
          replacements.push({
            parent,
            index,
            nodes: [wrapSpan([node as Element], nextIndex, count, wordClasses)],
          });
          nextIndex += count;
          return;
        }

        // Text node -> wrap each word, skipping non-textual ancestors.
        if (isSkipped(ancestors)) return;
        const text = (node as Text).value;
        if (!text) return;
        const matches = Array.from(text.matchAll(WORD_PATTERN));
        if (matches.length === 0) return;

        const index = parent.children.indexOf(node as Text);
        if (index === -1) return;

        const out: (Text | Element)[] = [];
        let cursor = 0;
        for (const m of matches) {
          const start = m.index ?? 0;
          const end = start + m[0].length;
          if (start > cursor) out.push({ type: "text", value: text.slice(cursor, start) });
          const count = spokenTokenCount(m[0]);
          if (count > 0) {
            out.push(wrapText(m[0], nextIndex, count, wordClasses));
            nextIndex += count;
          } else {
            out.push({ type: "text", value: m[0] });
          }
          cursor = end;
        }
        if (cursor < text.length) out.push({ type: "text", value: text.slice(cursor) });

        replacements.push({ parent, index, nodes: out });
      }
    );

    // Apply in reverse so earlier indices stay valid.
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      r.parent.children.splice(r.index, 1, ...r.nodes);
    }
  };
};

function wrapText(word: string, dataI: number, dataN: number, wordClasses: string[]): Element {
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: [...wordClasses],
      "data-i": String(dataI),
      "data-n": String(dataN),
    },
    children: [{ type: "text", value: word }],
  };
}

function wrapSpan(
  children: (Text | Element)[],
  dataI: number,
  dataN: number,
  wordClasses: string[]
): Element {
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: [...wordClasses],
      "data-i": String(dataI),
      "data-n": String(dataN),
    },
    children,
  };
}

function hasDataSpeech(node: Element): boolean {
  const props = node.properties ?? {};
  return typeof props.dataSpeech === "string" && props.dataSpeech.length > 0;
}

function isSkipped(ancestors: (Root | Element)[]): boolean {
  for (const ancestor of ancestors) {
    if (!("tagName" in ancestor)) continue;
    if (SKIP_TAGS.has(ancestor.tagName)) return true;
    const className = ancestor.properties?.className;
    if (className) {
      const classes = Array.isArray(className) ? className : [className];
      for (const cls of classes) {
        if (typeof cls === "string" && SKIP_CLASSES.has(cls)) return true;
      }
    }
  }
  return false;
}

export default rehypeAudioWords;
export { rehypeAudioWords };
