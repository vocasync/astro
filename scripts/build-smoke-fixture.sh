#!/usr/bin/env bash
# Generate tests/fixtures/smoke/player.html from a real Astro build.
#
# The player's markup and its client script live inside AudioPlayer.astro, which
# `bun test` cannot import (no Astro compiler). Testing a hand-written copy of the
# markup would drift silently, so the smoke suite runs against genuine build output
# instead, and CI regenerates this file to prove it is still current.
#
#   bun run fixtures:smoke          regenerate
#   bun run fixtures:smoke --check  fail if the committed fixture is stale
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/tests/fixtures/smoke/player.html"
WORK="${TMPDIR:-/tmp}/vocasync-smoke.$$"
CHECK="${1:-}"
mkdir -p "$WORK" "$(dirname "$OUT")"
trap 'rm -rf "$WORK"' EXIT

(cd "$ROOT" && bun run build >/dev/null 2>&1)
(cd "$ROOT" && npm pack --pack-destination "$WORK" --silent >/dev/null 2>&1)
TARBALL="$(find "$WORK" -maxdepth 1 -name 'vocasync-astro-*.tgz' | head -1)"

P="$WORK/site"
mkdir -p "$P/src/pages" "$P/src/content/blog" "$P/src/data"
cp "$ROOT/tests/fixtures/compat/audio-map.json" "$P/src/data/audio-map.json"
cp "$ROOT/tests/fixtures/compat/post.md"        "$P/src/content/blog/post.md"

cat > "$P/package.json" <<JSON
{ "name": "smoke", "type": "module", "private": true,
  "dependencies": { "astro": "5.18.2", "@vocasync/astro": "file:$TARBALL" } }
JSON
cat > "$P/vocasync.config.mjs" <<'JS'
export default { collection: { name: "blog", path: "./src/content/blog" } };
JS
cat > "$P/astro.config.mjs" <<'JS'
import { defineConfig } from "astro/config";
import vocasync from "@vocasync/astro";
import { rehypeAudioWords, rehypeMathSpeech } from "@vocasync/astro/rehype";
const o = { collectionName: "blog", audioMapPath: "src/data/audio-map.json" };
export default defineConfig({
  build: { inlineStylesheets: "always" },
  markdown: { rehypePlugins: [[rehypeMathSpeech, o], [rehypeAudioWords, o]] },
  integrations: [vocasync()],
});
JS
cat > "$P/src/content.config.ts" <<'TS'
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
export const collections = {
  blog: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
    schema: z.object({ title: z.string(), description: z.string() }),
  }),
};
TS
cat > "$P/src/pages/index.astro" <<'ASTRO'
---
import AudioPlayer from "@vocasync/astro/components/AudioPlayer.astro";
import audioMap from "../data/audio-map.json";
import { getEntry, render } from "astro:content";
const post = await getEntry("blog", "post");
const { Content } = await render(post);
---
<html><head><title>smoke</title></head><body>
<AudioPlayer slug="post" audioEntry={audioMap.entries.post} />
<div data-article-body><Content /></div>
</body></html>
ASTRO

(cd "$P" && bun install >/dev/null 2>&1 && bunx astro build >/dev/null 2>&1)

GENERATED="$P/dist/index.html"
[ -f "$GENERATED" ] || { echo "smoke fixture build produced no output" >&2; exit 1; }

if [ "$CHECK" = "--check" ]; then
  if ! diff -q "$OUT" "$GENERATED" >/dev/null 2>&1; then
    echo "tests/fixtures/smoke/player.html is stale. Run: bun run fixtures:smoke" >&2
    diff -u "$OUT" "$GENERATED" | head -40 >&2 || true
    exit 1
  fi
  echo "smoke fixture is current"
else
  cp "$GENERATED" "$OUT"
  echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
fi
