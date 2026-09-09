#!/usr/bin/env bash
# Typecheck .astro files (templates + client scripts) with `astro check`.
#
# @astrojs/language-server needs TypeScript's programmatic API, which the native
# compiler (7.x) does not expose yet, so this repo cannot run `astro check` against
# its pinned TypeScript. Rather than hold the whole project back on TS 6 -- `tsc
# --noEmit` is ~8x faster on 7 -- this swaps a TS 6 build into node_modules for the
# duration of the check and restores the pinned one afterwards.
#
# package.json and bun.lock are never touched. Delete this script and fold `astro
# check` into the normal gate once Astro supports TS 7.
# Track: https://github.com/withastro/roadmap/discussions/1321
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TS_CHECK_VERSION="${TS_CHECK_VERSION:-6.0.3}"
NM_TS="$ROOT/node_modules/typescript"
STASH="$ROOT/node_modules/.typescript-pinned"
TMP="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP"
  if [ -d "$STASH" ]; then
    rm -rf "$NM_TS"
    mv "$STASH" "$NM_TS"
  fi
}
trap cleanup EXIT

echo "astro check: installing typescript@${TS_CHECK_VERSION} (pinned version restored on exit)"
printf '{"name":"astro-check-ts","private":true}\n' > "$TMP/package.json"
(cd "$TMP" && bun add "typescript@${TS_CHECK_VERSION}" >/dev/null 2>&1)

if [ ! -d "$TMP/node_modules/typescript" ]; then
  echo "error: could not install typescript@${TS_CHECK_VERSION}" >&2
  exit 1
fi

[ -e "$NM_TS" ] && mv "$NM_TS" "$STASH"
cp -r "$TMP/node_modules/typescript" "$NM_TS"

bunx astro check "$@"
