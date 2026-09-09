#!/usr/bin/env bash
# Prove the declared `astro` peer range actually works.
#
# Packs this repo, then builds a minimal consumer against each supported Astro major
# and asserts three things per version: the build succeeds, the player renders, and
# the rehype plugin emits `data-i` word spans. A green build alone is not enough --
# the spans are the feature.
#
# Run before widening or narrowing the peer range, and before a release.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/vocasync-astro-compat.$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

# Astro 7 dropped @astrojs/markdown-remark from its default install (Sätteri became
# the default Markdown processor), and rehype plugins hard-fail without it.
VERSIONS=(
  "4.16.19|"
  "5.18.2|"
  "6.4.8|"
  '7.3.2|, "@astrojs/markdown-remark": "^7.0.0"'
)

# CI shards this across a job matrix; COMPAT_ONLY=<version> runs a single leg.
if [ -n "${COMPAT_ONLY:-}" ]; then
  selected=()
  for spec in "${VERSIONS[@]}"; do
    [ "${spec%%|*}" = "$COMPAT_ONLY" ] && selected+=("$spec")
  done
  if [ ${#selected[@]} -eq 0 ]; then
    echo "COMPAT_ONLY=$COMPAT_ONLY matches no version in the matrix" >&2
    exit 1
  fi
  VERSIONS=("${selected[@]}")
fi

echo "Packing @vocasync/astro..."
(cd "$ROOT" && bun run build >/dev/null 2>&1) || { echo "build failed"; exit 1; }
(cd "$ROOT" && npm pack --pack-destination "$WORK" --silent >/dev/null 2>&1)
TARBALL="$(find "$WORK" -maxdepth 1 -name 'vocasync-astro-*.tgz' | head -1)"
[ -n "$TARBALL" ] || { echo "npm pack produced no tarball"; exit 1; }

FIXTURE_MAP="$ROOT/tests/fixtures/compat/audio-map.json"
FIXTURE_POST="$ROOT/tests/fixtures/compat/post.md"

fail=0
printf '\n%-10s %-10s %-8s %-8s\n' "ASTRO" "BUILD" "PLAYER" "SPANS"
printf '%s\n' "------------------------------------------"

for spec in "${VERSIONS[@]}"; do
  ver="${spec%%|*}"; extra="${spec#*|}"
  P="$WORK/probe-$ver"
  mkdir -p "$P/src/pages" "$P/src/content/blog" "$P/src/data"
  cp "$FIXTURE_MAP"  "$P/src/data/audio-map.json"
  cp "$FIXTURE_POST" "$P/src/content/blog/post.md"

  cat > "$P/package.json" <<JSON
{ "name": "probe", "type": "module", "private": true,
  "dependencies": { "astro": "$ver", "@vocasync/astro": "file:$TARBALL"$extra } }
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
<html><body>
<AudioPlayer slug="post" audioEntry={audioMap.entries.post} />
<div data-article-body><Content /></div>
</body></html>
ASTRO

  if ! (cd "$P" && bun install >/dev/null 2>&1); then
    printf '%-10s %-10s %-8s %-8s\n' "$ver" "INSTALL✗" "-" "-"; fail=1; continue
  fi
  if ! (cd "$P" && bunx astro build >"$P/build.log" 2>&1); then
    printf '%-10s %-10s %-8s %-8s\n' "$ver" "BUILD✗" "-" "-"
    sed -n '1,4p' "$P/build.log" | sed 's/^/    /'
    fail=1; continue
  fi

  html="$P/dist/index.html"
  player=$(grep -c 'class="vocasync-player"' "$html" 2>/dev/null || echo 0)
  spans=$(grep -o 'vocasync-word' "$html" 2>/dev/null | wc -l | tr -d ' ')
  status="ok"
  [ "$player" -ge 1 ] || { status="✗"; fail=1; }
  [ "$spans"  -gt 0 ] || { status="✗"; fail=1; }
  printf '%-10s %-10s %-8s %-8s\n' "$ver" "$status" "$player" "$spans"
done

echo
if [ "$fail" -ne 0 ]; then echo "compat matrix FAILED"; exit 1; fi
echo "compat matrix passed"
