import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VocaSyncClient } from "../src/api/client.js";
import { validateConfig } from "../src/config/schema.js";
import { buildSpeechDocument } from "../src/core/speech-builder.js";
import { contentHashFor, legacyContentHashFor } from "../src/sync/content-hash.js";
import { sync } from "../src/sync/orchestrator.js";
import type { AudioArtifact, AudioMap } from "../src/types/index.js";

/**
 * End to end: a site whose audio map was written by v2.0.x must sync with ZERO API calls
 * — every call is synthesis or alignment the customer pays for again. The client here
 * fails the test if anything touches it.
 */

const forbiddenClient = new Proxy({} as VocaSyncClient, {
  get(_t, prop) {
    if (prop === "then") return undefined;
    return () => {
      throw new Error(`API called: ${String(prop)} — a v2.0-era entry was re-synthesised`);
    };
  },
});

const POST = "---\ntitle: Hello\n---\n\nHello world. This is a post.\n";

let dir: string;
let mapPath: string;

async function setup(storedHash: (text: string) => string) {
  const contentDir = join(dir, "content");
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, "hello.md"), POST);
  const config = validateConfig({
    collection: { name: "blog", path: contentDir },
    output: { audioMapPath: mapPath },
  });
  const doc = await buildSpeechDocument(
    {
      slug: "hello",
      content: "\nHello world. This is a post.\n",
      frontmatter: { title: "Hello" },
      filePath: "x",
    },
    { math: config.math }
  );
  const entry: AudioArtifact = {
    contentHash: storedHash(doc.normalisedSpeechtext),
    voice: config.synthesis.voice,
    language: config.language,
    format: config.synthesis.format,
    synthesisProjectUuid: "syn-1",
    synthesisPublishableKey: "pk_syn",
    alignmentProjectUuid: "aln-1",
    alignmentPublishableKey: "pk_aln",
    audioUrl: "https://x/stream",
    words: [{ word: "hello", start: 0, end: 0.5 }],
    duration: 2,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
  const map: AudioMap = {
    version: 3,
    updatedAt: "2026-09-01T00:00:00Z",
    entries: { hello: entry },
  };
  await writeFile(mapPath, JSON.stringify(map, null, 2));
  return { config, text: doc.normalisedSpeechtext };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vocasync-legacy-"));
  mapPath = join(dir, "audio-map.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sync over a v2.0-era audio map", () => {
  test("makes no API call and reports the post unchanged", async () => {
    const { config } = await setup((text) =>
      legacyContentHashFor({
        normalisedSpeechtext: text,
        voice: "onyx",
        language: "en",
        format: "mp3",
        align: true,
      })
    );
    const summary = await sync(config, forbiddenClient);
    expect(summary.errors).toBe(0);
    expect(summary.synced).toBe(0);
    expect(summary.unchanged).toBe(1);
  });

  test("upgrades the stored hash to the v2.1 shape in place", async () => {
    const { config, text } = await setup((t) =>
      legacyContentHashFor({
        normalisedSpeechtext: t,
        voice: "onyx",
        language: "en",
        format: "mp3",
        align: true,
      })
    );
    await sync(config, forbiddenClient);
    const saved = JSON.parse(await readFile(mapPath, "utf-8")) as AudioMap;
    expect(saved.entries.hello.contentHash).toBe(
      contentHashFor({
        normalisedSpeechtext: text,
        voice: "onyx",
        language: "en",
        format: "mp3",
        align: true,
      })
    );
    // Everything else about the entry is untouched: same audio, same timings.
    expect(saved.entries.hello.synthesisProjectUuid).toBe("syn-1");
    expect(saved.entries.hello.words).toEqual([{ word: "hello", start: 0, end: 0.5 }]);
  });

  test("a dry run upgrades nothing on disk", async () => {
    await setup((t) =>
      legacyContentHashFor({
        normalisedSpeechtext: t,
        voice: "onyx",
        language: "en",
        format: "mp3",
        align: true,
      })
    );
    const before = await readFile(mapPath, "utf-8");
    const config = validateConfig({
      collection: { name: "blog", path: join(dir, "content") },
      output: { audioMapPath: mapPath },
    });
    const summary = await sync(config, forbiddenClient, { dryRun: true });
    expect(summary.unchanged).toBe(1);
    expect(await readFile(mapPath, "utf-8")).toBe(before);
  });

  test("an already-current map is not rewritten", async () => {
    const { config } = await setup((t) =>
      contentHashFor({
        normalisedSpeechtext: t,
        voice: "onyx",
        language: "en",
        format: "mp3",
        align: true,
      })
    );
    const before = await readFile(mapPath, "utf-8");
    const summary = await sync(config, forbiddenClient);
    expect(summary.unchanged).toBe(1);
    expect(await readFile(mapPath, "utf-8")).toBe(before);
  });
});
