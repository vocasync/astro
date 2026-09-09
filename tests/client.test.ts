import { afterEach, describe, expect, test } from "bun:test";
import { toAlignmentLocale, VocaSyncClient, withPublishableKey } from "../src/api/client.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Route {
  method: string;
  match: string;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function mockFetch(routes: Route[]) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    for (const r of routes) {
      if (r.method === method && url.includes(r.match)) {
        return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
          status: r.status ?? 200,
          headers: r.headers,
        });
      }
    }
    return new Response(`not mocked: ${method} ${url}`, { status: 404 });
  }) as typeof fetch;
}

const client = new VocaSyncClient("sk_test");

describe("VocaSyncClient", () => {
  test("validateApiKey reads plan.balanceCents from /me", async () => {
    mockFetch([{ method: "GET", match: "/me", body: { plan: { balanceCents: 1500 } } }]);
    expect(await client.validateApiKey()).toEqual({ valid: true, balanceCents: 1500 });
  });

  test("validateApiKey returns invalid on 401", async () => {
    mockFetch([{ method: "GET", match: "/me", status: 401, body: { error: "nope" } }]);
    expect(await client.validateApiKey()).toEqual({ valid: false });
  });

  test("synthesize returns the project uuid", async () => {
    mockFetch([
      { method: "POST", match: "/synthesis", body: { projectUuid: "syn-1", status: "pending" } },
    ]);
    const res = await client.synthesize({
      name: "astro-x",
      text: "hello",
      voice: "onyx",
      quality: "hd",
      language: "en",
      outputFormat: "mp3",
    });
    expect(res.projectUuid).toBe("syn-1");
  });

  test("pollUntilComplete resolves on completed", async () => {
    mockFetch([
      {
        method: "GET",
        match: "/projects/syn-1",
        body: { projectUuid: "syn-1", projectType: "synthesis", status: "completed", name: "x" },
      },
    ]);
    const status = await client.pollUntilComplete("syn-1", { intervalMs: 1 });
    expect(status.status).toBe("completed");
  });

  test("pollUntilComplete throws on failed with the server error", async () => {
    mockFetch([
      {
        method: "GET",
        match: "/projects/bad",
        body: { projectUuid: "bad", projectType: "alignment", status: "failed", error: "boom" },
      },
    ]);
    await expect(client.pollUntilComplete("bad", { intervalMs: 1 })).rejects.toThrow(/boom/);
  });

  test("createPublishableKey returns the key", async () => {
    mockFetch([{ method: "POST", match: "/publishable-key", body: { publishableKey: "pk_live" } }]);
    expect(await client.createPublishableKey("syn-1")).toBe("pk_live");
  });

  test("presignAlignment returns upload targets", async () => {
    mockFetch([
      {
        method: "POST",
        match: "/alignment/presign",
        body: {
          projectUuid: "ali-1",
          audio: { key: "a/key", uploadUrl: "https://s3/a" },
          transcript: { key: "t/key", uploadUrl: "https://s3/t" },
        },
      },
    ]);
    const res = await client.presignAlignment({
      audioName: "synthesis.mp3",
      audioType: "audio/mpeg",
      audioSize: 100,
      transcriptSize: 20,
      language: "en-US",
    });
    expect(res.projectUuid).toBe("ali-1");
    expect(res.audio.uploadUrl).toBe("https://s3/a");
  });

  test("fetchAlignmentWords returns words + duration", async () => {
    mockFetch([
      {
        method: "GET",
        match: "/stream/ali-1/alignment",
        body: { words: [{ word: "hi", start: 0, end: 0.4 }], duration: 0.4 },
      },
    ]);
    const url = withPublishableKey(client.streamUrl("ali-1", "alignment"), "pk_ali");
    const res = await client.fetchAlignmentWords(url);
    expect(res.words).toHaveLength(1);
    expect(res.duration).toBe(0.4);
  });
});

describe("language mapping", () => {
  test.each([
    ["en", "en-US"],
    ["pt", "pt-PT"],
    ["zh", "zh-CN"],
    ["fr", "fr"],
    ["xx", "en-US"],
  ])("toAlignmentLocale(%p) === %p", (input, expected) => {
    expect(toAlignmentLocale(input)).toBe(expected);
  });
});

describe("withPublishableKey", () => {
  test("appends pk query param", () => {
    expect(withPublishableKey("https://x.io/stream/a/synthesis", "pk_1")).toBe(
      "https://x.io/stream/a/synthesis?pk=pk_1"
    );
  });
});
