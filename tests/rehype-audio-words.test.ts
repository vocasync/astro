import { beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Element, Root } from "hast";
import rehypeAudioWords from "../src/rehype/audio-words.js";

const audioMapPath = join(tmpdir(), `vocasync-test-audio-map-${Date.now()}.json`);

beforeAll(() => {
  writeFileSync(
    audioMapPath,
    JSON.stringify({ version: 3, updatedAt: "now", entries: { hello: { words: [] } } })
  );
});

/** Collect wrapped word spans in document order with their data-i/data-n. */
function collectSpans(
  node: Root | Element,
  out: Array<{ i: number; n: number; text: string }> = []
) {
  const children = "children" in node ? node.children : [];
  for (const child of children) {
    if (child.type === "element") {
      const el = child as Element;
      const cls = el.properties?.className;
      const isWord = Array.isArray(cls) && (cls as string[]).includes("vocasync-word");
      if (isWord) {
        out.push({
          i: Number(el.properties?.["data-i"]),
          n: Number(el.properties?.["data-n"]),
          text: textOf(el),
        });
      } else {
        collectSpans(el, out);
      }
    }
  }
  return out;
}

function textOf(node: Element): string {
  let s = "";
  for (const c of node.children) {
    if (c.type === "text") s += c.value;
    else if (c.type === "element") s += textOf(c as Element);
  }
  return s;
}

function run(tree: Root) {
  const transformer = rehypeAudioWords({ audioMapPath, collectionName: "blog" });
  // @ts-expect-error unified plugin transformer signature (tree, file)
  transformer(tree, { path: "/x/src/content/blog/hello.md" });
}

describe("rehypeAudioWords", () => {
  test("wraps words with data-i/data-n and expands multi-token words", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: "I paid $50 today" }],
        },
      ],
    };
    run(tree);
    const spans = collectSpans(tree);
    expect(spans).toEqual([
      { i: 0, n: 1, text: "I" },
      { i: 1, n: 1, text: "paid" },
      { i: 2, n: 2, text: "$50" },
      { i: 4, n: 1, text: "today" },
    ]);
  });

  test("wraps a math container (data-speech) as one unit with its token count", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: "See" }],
        },
        {
          type: "element",
          tagName: "mjx-container",
          properties: { dataSpeech: "x squared" },
          children: [{ type: "text", value: "glyphs" }],
        },
      ],
    };
    run(tree);
    const spans = collectSpans(tree);
    expect(spans).toEqual([
      { i: 0, n: 1, text: "See" },
      { i: 1, n: 2, text: "glyphs" }, // the mjx-container wrapped as one unit
    ]);
  });

  test("does nothing when the slug has no audio-map entry", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: "hi" }],
        },
      ],
    };
    const transformer = rehypeAudioWords({ audioMapPath, collectionName: "blog" });
    // @ts-expect-error transformer signature
    transformer(tree, { path: "/x/src/content/blog/missing.md" });
    expect(collectSpans(tree)).toEqual([]);
  });
});

describe("extraWordClass", () => {
  function classesOf(tree: Root): string[][] {
    const out: string[][] = [];
    const walk = (node: Root | Element) => {
      for (const child of "children" in node ? node.children : []) {
        if (child.type !== "element") continue;
        const el = child as Element;
        const cls = el.properties?.className;
        if (Array.isArray(cls) && (cls as string[]).includes("vocasync-word")) {
          out.push(cls as string[]);
        } else {
          walk(el);
        }
      }
    };
    walk(tree);
    return out;
  }

  function treeWith(text: string): Root {
    return {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: text }],
        },
      ],
    };
  }

  test("adds a class alongside vocasync-word rather than replacing it", () => {
    // The removed `classPrefix` option renamed the span class while `.vocasync-word`
    // stayed hardcoded in the stylesheet, the player and the WordPress fork, so
    // setting it silently broke highlighting. The replacement is additive.
    const tree = treeWith("I paid");
    const transformer = rehypeAudioWords({
      audioMapPath,
      collectionName: "blog",
      extraWordClass: "prose-word",
    });
    // @ts-expect-error unified plugin transformer signature (tree, file)
    transformer(tree, { path: "/x/src/content/blog/hello.md" });
    expect(classesOf(tree)).toEqual([
      ["vocasync-word", "prose-word"],
      ["vocasync-word", "prose-word"],
    ]);
  });

  test("emits only vocasync-word by default", () => {
    const tree = treeWith("I paid");
    run(tree);
    expect(classesOf(tree)).toEqual([["vocasync-word"], ["vocasync-word"]]);
  });
});
