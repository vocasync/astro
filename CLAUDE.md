# @vocasync/astro

An Astro integration that turns blog posts into narrated audio with word-level
highlighting. Published to npm. Lives at `~/projects/vocasync/astro/`; GitHub
remote is `vocasync/astro`.

## Package manager & runtime

Use **`bun`** exclusively (never npm/pnpm/yarn for scripts/deps).

```sh
bun install
bun run build        # tsc -> dist/ + copy *.astro and styles
bun run dev          # tsc --watch
bun test             # bun:test (NOT vitest)
bunx tsc --noEmit    # type check
bunx biome check     # lint + format check
bunx biome check --write   # auto-fix
```

Run `bunx tsc --noEmit`, `bun test`, and `bunx biome check` before every commit.

## Architecture (how audio is produced)

`align=true` auto-chaining is **deprecated** — the CLI uses an explicit two-POST flow:

1. `POST /v1/synthesis` with `speechtext` (no `align`), poll, mint a publishable key.
2. Download the audio, `POST /v1/alignment/presign`, PUT the audio + the
   `normalisedSpeechtext` transcript, `POST /v1/alignment`, poll, mint a key.
3. Fetch the word timings and write a **v3** `audio-map.json` entry (two project
   UUIDs, two publishable keys, embedded `words`, `mathSpeech`, resolved params).

**Token parity is the core invariant.** `src/core/spoken-form.ts`
(`expandSpokenForms`/`stripForAlignment`/`spokenTokenCount`) is the single source of
tokenization. The alignment transcript IS `stripForAlignment(expandSpokenForms(text))`,
so the worker's normalizer is a no-op over it and the rehype plugin's `data-i`/`data-n`
indices line up token-for-token with the alignment word stream. `speech-builder` and
the rehype walk must see the **same visible tokens** — never emit speech for content
the rehype walk skips (code, images), or you desync `data-i`.

**Math runs only in the CLI.** `speakLatex` (mathjax-full + speech-rule-engine) works
under Node/bun but NOT under Astro's Vite SSR loader. So `vocasync sync` computes each
expression's spoken form and stores it in `audio-map.json` (`mathSpeech`, keyed by
latex); `rehype-math-speech` reads it from there at build time and never calls the math
engines. Keep it that way.

## Release discipline

**Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`,
`perf:`, `ci:`).

**Never mix implementation with version bumps.** Order:

```sh
# 1. Implementation commit(s) land first
git commit -m "feat: ..."

# 2. Separate bump commit — package.json (+ bun.lock) ONLY
bun pm version <patch|minor|major> --no-git-tag-version
git add package.json bun.lock
git commit -m "chore(release): bump to vX.Y.Z"

# 3. Tag that commit and push
git tag vX.Y.Z && git push && git push --tags
```

- Bump `package.json` — the tag alone does not propagate the version.
- `.github/workflows/publish.yml` triggers on `v*` tags: it lints, typechecks, tests,
  builds, and `npm publish --provenance` (OIDC trusted publisher; `NPM_TOKEN` secret).
  A red lint/typecheck/test blocks the publish.
- Pre-1.0: breaking changes (e.g. the `audio-map` schema version) bump the **minor**.
- **Never** force-push or rewrite history; failed CI runs and dead tags stay as a record.

## Consumers re-sync on schema bumps

The `audio-map.json` schema `version` (currently 3) is load-bearing: legacy entries
missing v3 fields are re-synthesized on the next `vocasync sync` (an API cost). Call
this out in release notes when the schema changes.

## External design memory (dev vault)

Cross-device architectural memory lives in the **dev** Obsidian vault (synced
across all devices; typically `~/Projects/dev`). Before non-trivial work, consult
it — start at `_meta/HOME.md`, then `projects/vocasync/` and `_shared/`. Record durable
decisions there as you go so they carry to other devices (Claude Code's local
durable memory does not sync between machines).
