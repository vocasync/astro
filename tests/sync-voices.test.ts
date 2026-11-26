import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VocaSyncClient } from "../src/api/client.js";
import { validateConfig } from "../src/config/schema.js";
import { buildSpeechDocument } from "../src/core/speech-builder.js";
import { contentHashFor } from "../src/sync/content-hash.js";
import { sync } from "../src/sync/orchestrator.js";
import type { AudioArtifact, AudioMap } from "../src/types/index.js";

const BODY = "\nHello world. This is a post.\n";
const post = (fm: string) => `---\ntitle: Hello\n${fm}---\n${BODY}`;

let dir: string;
let mapPath: string;
let contentDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vocasync-voices-"));
  mapPath = join(dir, "audio-map.json");
  contentDir = join(dir, "content");
  await mkdir(contentDir, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const forbidden = new Proxy({} as VocaSyncClient, {
  get(_t, prop) {
    if (prop === "then") return undefined;
    return () => {
      throw new Error(`API called: ${String(prop)}`);
    };
  },
});

/** A client that records the synthesis request and fails fast afterwards. */
function recordingClient() {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    synthesize: async (p: Record<string, unknown>) => {
      calls.push(p);
      return { projectUuid: "syn-new" };
    },
    pollUntilComplete: async () => ({ status: "completed", durationSeconds: 3 }),
    createPublishableKey: async () => "pk",
    streamUrl: () => "https://x/stream",
  } as unknown as VocaSyncClient;
  return { client, calls };
}

async function textOf(language = "en") {
  const config = validateConfig({
    collection: { name: "blog", path: contentDir },
    output: { audioMapPath: mapPath },
    language: language as never,
    align: false,
  });
  const doc = await buildSpeechDocument(
    { slug: "hello", content: BODY, frontmatter: { title: "Hello" }, filePath: "x" },
    { math: config.math }
  );
  return doc.normalisedSpeechtext;
}

async function writeMap(entry: Partial<AudioArtifact>) {
  const map: AudioMap = {
    version: 3,
    updatedAt: "2026-09-01T00:00:00Z",
    entries: {
      hello: {
        contentHash: "x",
        voice: "onyx",
        language: "en",
        format: "mp3",
        synthesisProjectUuid: "syn-1",
        synthesisPublishableKey: "pk",
        audioUrl: "https://x/stream",
        aligned: false,
        duration: 2,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        ...entry,
      },
    },
  };
  await writeFile(mapPath, JSON.stringify(map));
}

describe("voice hash stability through sync", () => {
  test("frontmatter voice nova and spark are the same artifact: no API call", async () => {
    await writeFile(join(contentDir, "hello.md"), post("voice: spark\n"));
    const text = await textOf();
    // Stored by an old release under the legacy name.
    await writeMap({
      voice: "nova",
      contentHash: contentHashFor({
        normalisedSpeechtext: text,
        voice: "nova",
        language: "en",
        format: "mp3",
        align: false,
      }),
    });
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    const summary = await sync(config, forbidden);
    expect(summary.unchanged).toBe(1);
    expect(summary.errors).toBe(0);
  });

  test("the default voice (basalt) matches a hash stored under onyx", async () => {
    await writeFile(join(contentDir, "hello.md"), post(""));
    const text = await textOf();
    await writeMap({
      contentHash: contentHashFor({
        normalisedSpeechtext: text,
        voice: "onyx",
        language: "en",
        format: "mp3",
        align: false,
      }),
    });
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    expect((await sync(config, forbidden)).unchanged).toBe(1);
  });
});

describe("voice sending", () => {
  test("a legacy name is sent as its target; quality is still sent", async () => {
    await writeFile(join(contentDir, "hello.md"), post(""));
    const { client, calls } = recordingClient();
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
      synthesis: { voice: "onyx", quality: "hd" },
    });
    const summary = await sync(config, client);
    expect(summary.synced).toBe(1);
    expect(calls[0].voice).toBe("basalt");
    expect(calls[0].quality).toBe("hd");
    // Stored as written, not as sent.
    const saved = JSON.parse(await readFile(mapPath, "utf-8")) as AudioMap;
    expect(saved.entries.hello.voice).toBe("onyx");
  });

  test("the default config sends basalt, never onyx", async () => {
    await writeFile(join(contentDir, "hello.md"), post(""));
    const { client, calls } = recordingClient();
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    await sync(config, client);
    expect(calls[0].voice).toBe("basalt");
  });

  test("a new voice is stored as written", async () => {
    await writeFile(join(contentDir, "hello.md"), post("voice: oak\n"));
    const { client, calls } = recordingClient();
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    await sync(config, client);
    expect(calls[0].voice).toBe("oak");
    const saved = JSON.parse(await readFile(mapPath, "utf-8")) as AudioMap;
    expect(saved.entries.hello.voice).toBe("oak");
  });

  test("an unknown frontmatter voice is a per-post error", async () => {
    await writeFile(join(contentDir, "hello.md"), post("voice: ballad\n"));
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    const summary = await sync(config, forbidden);
    expect(summary.errors).toBe(1);
  });
});

describe("unsupported synthesis language", () => {
  const only = { supportedLanguages: ["en"] };

  test("still validates in config (v2.1.2 codes keep parsing)", () => {
    expect(() =>
      validateConfig({ collection: { name: "b", path: "./p" }, language: "uk" })
    ).not.toThrow();
  });

  test("an unchanged post reports nothing", async () => {
    await writeFile(join(contentDir, "hello.md"), post("language: uk\n"));
    const text = await textOf("uk");
    await writeMap({
      language: "uk",
      contentHash: contentHashFor({
        normalisedSpeechtext: text,
        voice: "onyx",
        language: "uk",
        format: "mp3",
        align: false,
      }),
    });
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    const summary = await sync(config, forbidden, only);
    expect(summary.unchanged).toBe(1);
    expect(summary.errors).toBe(0);
  });

  test("a changed post gets a per-post error and no API call", async () => {
    await writeFile(join(contentDir, "hello.md"), post("language: uk\n"));
    await writeMap({ language: "uk", contentHash: "stale" });
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    const summary = await sync(config, forbidden, only);
    expect(summary.errors).toBe(1);
    expect(summary.results[0].error).toContain("uk");
  });

  test("a new post is an error too, and a supported sibling is unaffected", async () => {
    await writeFile(join(contentDir, "hello.md"), post("language: uk\n"));
    await writeFile(join(contentDir, "other.md"), post(""));
    const { client, calls } = recordingClient();
    const config = validateConfig({
      collection: { name: "blog", path: contentDir },
      output: { audioMapPath: mapPath },
      align: false,
    });
    const summary = await sync(config, client, only);
    expect(summary.errors).toBe(1);
    expect(summary.synced).toBe(1);
    expect(calls).toHaveLength(1);
  });
});
