import type { Element, Parent, Root } from "hast";
import { visitParents } from "unist-util-visit-parents";
import { loadAudioMapSync, resolveSlug } from "./shared.js";

export interface RehypeMathSpeechOptions {
  /**
   * Path to the audio map JSON file (absolute or relative to project root).
   * @default ".vocasync/audio-map.json"
   */
  audioMapPath?: string;
  /**
   * Content collection folder name used to extract slugs.
   * @default "articles"
   */
  collectionName?: string;
}

/**
 * Rehype plugin that attaches each math expression's spoken form as a
 * `data-speech` attribute, so rehypeAudioWords can wrap the whole expression
 * as one highlight unit whose `data-n` is the spoken token count.
 *
 * The spoken forms are read from the audio map (where `vocasync sync` stored
 * them, keyed by latex) — math-to-speech runs only in the CLI, never here.
 * This guarantees the math tokens match what was synthesized AND avoids
 * running the math engines inside Astro's Vite build.
 *
 * Reads the LaTeX from the `code.math-inline` / `code.math-display` elements
 * that `remark-math` produces and wraps each in
 * `<span class="vocasync-math" data-speech="…">`. MUST run BEFORE
 * rehype-mathjax / rehype-katex (which replace the inner element) and before
 * rehypeAudioWords.
 */
export default function rehypeMathSpeech(options: RehypeMathSpeechOptions = {}) {
  const { audioMapPath = ".vocasync/audio-map.json", collectionName = "articles" } = options;

  return function transformer(tree: Root, file: { path?: string; history?: string[] }) {
    const audioMap = loadAudioMapSync(audioMapPath);
    if (!audioMap) return;
    const slug = resolveSlug(file, collectionName);
    if (!slug) return;
    const mathSpeech = audioMap.entries[slug]?.mathSpeech;
    if (!mathSpeech) return;

    const targets: Array<{ node: Element; parent: Parent; display: boolean }> = [];
    visitParents(tree, "element", (node, ancestors) => {
      const el = node as Element;
      const classes = classNames(el);
      const isInline = classes.includes("math-inline");
      const isDisplay = classes.includes("math-display");
      if (!isInline && !isDisplay) return;
      const parent = ancestors[ancestors.length - 1] as Parent | undefined;
      if (!parent) return;
      targets.push({ node: el, parent, display: isDisplay });
    });

    for (const t of targets) {
      const latex = textContent(t.node).trim();
      if (!latex) continue;
      const spoken = mathSpeech[`${t.display ? "d" : "i"}:${latex}`];
      if (!spoken) continue;
      const index = t.parent.children.indexOf(t.node);
      if (index === -1) continue;
      // Wrap the math element; the wrapper survives the renderer replacing the
      // inner code element with mjx-container / .katex.
      const wrapper: Element = {
        type: "element",
        tagName: "span",
        properties: { className: ["vocasync-math"], dataSpeech: spoken },
        children: [t.node],
      };
      t.parent.children[index] = wrapper;
    }
  };
}

function classNames(el: Element): string[] {
  // @types/hast declares className as string[], but plugins earlier in the chain
  // can leave a raw string, so both shapes are handled at runtime.
  const cls: unknown = el.properties?.className;
  if (Array.isArray(cls)) return cls.filter((c): c is string => typeof c === "string");
  if (typeof cls === "string") return cls.split(/\s+/);
  return [];
}

function textContent(node: Element): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else if (child.type === "element") out += textContent(child as Element);
  }
  return out;
}
