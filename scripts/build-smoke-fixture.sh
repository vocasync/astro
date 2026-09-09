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
<html><head><meta charset="utf-8" /><title>smoke</title></head><body>
<AudioPlayer slug="post" audioEntry={audioMap.entries.post} />
<div data-article-body><Content /></div>
</body></html>
ASTRO

# Two players, each owning its own article root. This is the shape that was broken:
# clicking a word used to seek every player on the page and start several tracks.
cat > "$P/src/pages/multi.astro" <<'ASTRO'
---
import AudioPlayer from "@vocasync/astro/components/AudioPlayer.astro";
import audioMap from "../data/audio-map.json";
import { getEntry, render } from "astro:content";
const post = await getEntry("blog", "post");
const { Content } = await render(post);
---
<html><head><meta charset="utf-8" /><title>smoke multi</title></head><body>
<section>
  <AudioPlayer slug="post" audioEntry={audioMap.entries.post} articleSelector="#body-a" />
  <div id="body-a" data-article-body><Content /></div>
</section>
<section>
  <AudioPlayer slug="post" audioEntry={audioMap.entries.post} articleSelector="#body-b" />
  <div id="body-b" data-article-body><Content /></div>
</section>
</body></html>
ASTRO

(cd "$P" && bun install >/dev/null 2>&1 && bunx astro build >/dev/null 2>&1)

inline_page() {
  local built="$1" dest="$2"
  [ -f "$built" ] || { echo "smoke fixture build produced no $built" >&2; exit 1; }
  local rel bundle
  rel="$(grep -o '/_astro/[A-Za-z0-9._-]*\.js' "$built" | head -1)"
  [ -n "$rel" ] || { echo "no player bundle referenced by $built" >&2; exit 1; }
  bundle="$P/dist$rel"
  [ -f "$bundle" ] || { echo "player bundle missing: $bundle" >&2; exit 1; }
  BUNDLE_PATH="$bundle" node -e '
    const fs = require("fs");
    const html = fs.readFileSync(process.argv[1], "utf8");
    const js = fs.readFileSync(process.env.BUNDLE_PATH, "utf8");
    // A replacer FUNCTION, not a string. In a string replacement, dollar-ampersand
    // and dollar-quote are substitution patterns, and minified JS contains those
    // sequences; with a string this silently truncated the bundle and spliced the
    // rest of the document into the middle of it.
    const out = html.replace(
      /<script type="module" src="\/_astro\/[^"]+"><\/script>/,
      () => `<script type="module" data-vocasync-bundle>${js}</script>`
    );
    if (out === html) { console.error("could not inline the player bundle"); process.exit(1); }
    // Prove the bundle survived intact. A truncated inline script still produces a
    // plausible-looking fixture, and the tests would then be driving a page where the
    // player never booted -- which is worse than no fixture at all.
    const embedded = out.match(/<script type="module" data-vocasync-bundle>([\s\S]*?)<\/script>/);
    if (!embedded || embedded[1].length !== js.length) {
      console.error("inlined bundle was truncated: " + (embedded ? embedded[1].length : 0) + " of " + js.length + " bytes");
      process.exit(1);
    }
    try { new Function(embedded[1]); } catch (e) {
      console.error("inlined bundle is not valid JavaScript: " + e.message);
      process.exit(1);
    }
    fs.writeFileSync(process.argv[2], out);
  ' "$built" "$dest"
}

GENERATED="$P/dist/index.html"
[ -f "$GENERATED" ] || { echo "smoke fixture build produced no output" >&2; exit 1; }

# Astro hoists the player's module script into its own bundle, which happy-dom cannot
# fetch. Inline it so each fixture is a single self-contained file the tests can drive.
inline_page "$P/dist/index.html"       "$P/single.html"
inline_page "$P/dist/multi/index.html" "$P/multi.html"

DEST_DIR="$(dirname "$OUT")"
stale=0
for pair in "single.html:player.html" "multi.html:multi-player.html"; do
  built="$P/${pair%%:*}"
  dest="$DEST_DIR/${pair##*:}"
  if [ "$CHECK" = "--check" ]; then
    if ! diff -q "$dest" "$built" >/dev/null 2>&1; then
      echo "$dest is stale. Run: bun run fixtures:smoke" >&2
      stale=1
    fi
  else
    cp "$built" "$dest"
    echo "wrote $dest ($(wc -c < "$dest") bytes)"
  fi
done
[ "$stale" -eq 0 ] || exit 1
[ "$CHECK" = "--check" ] && echo "smoke fixtures are current"
exit 0
