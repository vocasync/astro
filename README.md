# @vocasync/astro

Turn your Astro blog posts into narrated audio with word-level synchronization.

## Features

- 🎙️ **Text-to-Speech Synthesis** - Generate natural-sounding audio narration for your content
- 🎯 **Word-Level Alignment** - Precise timestamps for every word, powered by forced alignment
- ✨ **Live Word Highlighting** - Karaoke-style highlighting that follows along with playback
- 🎛️ **Built-in Audio Player** - Keyboard shortcuts, a floating dock, and controls you can reorder or replace
- 🌍 **14 Languages** - Global reach with support for 14 languages
- 🎨 **Themeable down to the pixel** - Four seeds carry a whole theme; every rule loses to yours, so no `!important`
- 🌗 **Dark mode that follows yours** - The OS preference plus `.dark`, `[data-theme]` and `[data-mode]`, with no configuration
- 🈯 **Translatable** - Every visible string and accessible label is overridable
- 🧩 **Headless option** - Import the engine and bring your own markup

## Demo

🔗 **[Live Demo](https://astro-integration-demo.vocasync.io)** — See the audio player and word highlighting in action

📂 **[Demo Source Code](https://github.com/vocasync/astro-demo)** — Example implementation for reference

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)
- [Components](#components)
- [Headless usage](#headless-usage)
- [Supported Languages](#supported-languages)
- [Math Support](#math-support)
- [Deployment](#deployment)
- [Important: Audio Map](#important-audio-map)
- [Theming](#theming)
- [Migrating from v1](#migrating-from-v1)

## Installation

```bash
npm install @vocasync/astro
# or
bun add @vocasync/astro
# or
pnpm add @vocasync/astro
```

### Astro 7

Astro 7 no longer installs `@astrojs/markdown-remark` by default, and the rehype
plugins that produce word highlighting cannot run without it:

```bash
bun add @astrojs/markdown-remark
```

Astro 4, 5 and 6 need nothing extra. The plugin is tested against all four on every
change.

## Quick Start

### 1. Create VocaSync Config

Create a `vocasync.config.mjs` file in your project root:

```javascript
// vocasync.config.mjs
export default {
  collection: {
    name: "blog",              // Your content collection name
    path: "./src/content/blog", // Path to your content
  },
};
```

### 2. Add to Astro Config

Update your `astro.config.mjs`:

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import vocasync from "@vocasync/astro";
import { rehypeAudioWords } from "@vocasync/astro/rehype";

export default defineConfig({
  markdown: {
    rehypePlugins: [
      [rehypeAudioWords, {
        collectionName: "blog",                    // Must match your collection name
        audioMapPath: "src/data/audio-map.json"   // Must match output.audioMapPath
      }]
    ]
  },
  integrations: [vocasync()],
});
```

### 3. Set API Key

Create a `.env` file:

```bash
VOCASYNC_API_KEY=voca_xxxxxxxxxxxxxxxx
```

Get your API key at [vocasync.io](https://vocasync.io)

### 4. Create Audio Map Directory

```bash
mkdir -p src/data
```

### 5. Sync Your Content

```bash
npx vocasync sync
```

This will, for each post:
- Read the content from your collection
- Submit a **synthesis** job, then an explicit **alignment** job (with the post's transcript)
- Wait for both to complete and fetch the word timings
- Save everything (URLs, keys, timings) to `audio-map.json`

### 6. Add the Player Component

In your article layout or page:

```astro
---
// src/layouts/ArticleLayout.astro
import AudioPlayer from "@vocasync/astro/components/AudioPlayer.astro";
import audioMap from "../data/audio-map.json";

const { post } = Astro.props;
const audioEntry = audioMap.entries[post.slug];
---

<article>
  <!-- Audio player at the top -->
  <AudioPlayer slug={post.slug} audioEntry={audioEntry} label="Listen to this post" />
  
  <!-- Article content - must have data-article-body for word highlighting -->
  <div data-article-body>
    <slot />
  </div>
</article>
```

## Project Structure

After setup, your project should look like this:

```
my-astro-site/
├── astro.config.mjs          # Astro config with vocasync integration
├── vocasync.config.mjs       # VocaSync configuration
├── .env                      # API key (add to .gitignore)
├── src/
│   ├── content/
│   │   └── blog/             # Your content collection
│   │       ├── my-post.md
│   │       └── another-post.md
│   ├── data/
│   │   └── audio-map.json    # Generated - DO NOT DELETE (see below)
│   └── layouts/
│       └── ArticleLayout.astro
└── package.json
```

## Configuration

### vocasync.config.mjs

Full configuration options:

```javascript
// vocasync.config.mjs
export default {
  // Content collection settings (required)
  collection: {
    name: "blog",                    // Collection name
    path: "./src/content/blog",      // Path to content files
    slugField: "slug",               // Frontmatter field for slug (optional)
  },
  
  // Language for synthesis and alignment (ISO 639-1 code)
  // See "Supported Languages" section below for all options
  language: "en",
  
  // Synthesis settings
  synthesis: {
    // alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer
    voice: "onyx",
    quality: "sd",                   // sd (standard) or hd (high definition)
    format: "mp3",                   // mp3, aac, opus, flac, wav (sent as outputFormat)
  },
  
  // LaTeX/math support
  math: {
    enabled: false,                  // Enable math-to-speech conversion
    style: "clearspeak",             // clearspeak or mathspeak
  },
  
  // Output settings
  output: {
    audioMapPath: "./src/data/audio-map.json",
  },
  
  // Frontmatter field to opt-in/out per post
  frontmatterField: "audio",         // Set `audio: false` in frontmatter to skip
  
  // Processing options
  processing: {
    concurrency: 3,                  // Parallel jobs (1-10)
    force: false,                    // Force reprocessing
  },
};
```

### Per-Post Overrides

Any post can override the global `voice`, `language`, or `format` from its frontmatter.
Values that aren't overridden fall back to `vocasync.config.mjs`:

```markdown
---
title: "Bienvenue"
language: fr
voice: shimmer
---

Bonjour…
```

Invalid values are skipped with a warning. Changing any of these re-syncs the post
(the change-detection hash includes the resolved voice/language/format).

### Rehype Plugin Options

```javascript
// In astro.config.mjs
[rehypeAudioWords, {
  collectionName: "blog",                  // Content collection name
  audioMapPath: "src/data/audio-map.json", // Path to audio map
  extraWordClass: "prose-word",             // optional extra class on each word span
}]
```

## CLI Commands

```bash
# Sync all content (synthesis + alignment)
npx vocasync sync

# Sync a single post
npx vocasync sync --only my-post-slug

# Force reprocessing (ignores cache)
npx vocasync sync --force

# Dry run (preview without API calls)
npx vocasync sync --dry-run

# Use a custom config file
npx vocasync sync --config ./path/to/vocasync.config.mjs

# Check configuration
npx vocasync check

# Check job status
npx vocasync status <projectUuid>

# Show help
npx vocasync help
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--only <slug>` | Only process a specific post by slug |
| `--force` | Force reprocessing, ignore cache |
| `--dry-run` | Preview what would be processed without API calls |
| `--config <path>` | Use a custom config file path |

## Components

### AudioPlayer

```astro
---
import AudioPlayer from "@vocasync/astro/components/AudioPlayer.astro";
import audioMap from "../data/audio-map.json";
---

<AudioPlayer slug={slug} audioEntry={audioMap.entries[slug]} />

<div data-article-body>
  <Content />
</div>
```

The player renders markup only. Playback, highlighting and the view-transition
lifecycle live in a module script that is bundled once per page, no matter how many
players are on it.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `slug` | `string` | required | Post slug, used to look up audio |
| `audioEntry` | `AudioEntry` | — | Entry from `audio-map.json` |
| `variant` | `"bar" \| "minimal" \| "card"` | `"bar"` | Shape of the player |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Scales the whole player |
| `controls` | `ControlName[]` | see below | Which controls render, and in what order |
| `speeds` | `number[]` | `[0.5, 0.75, 1, 1.25, 1.5, 2]` | Playback rates in the speed menu |
| `skipSeconds` | `number` | `15` | How far the skip controls and arrow keys jump |
| `strings` | `Partial<PlayerStrings>` | English | Every visible string and accessible label |
| `articleSelector` | `string` | `"[data-article-body]"` | Element containing the word spans |
| `highlight` | `HighlightOptions` | `{}` | `{ enabled, trailLength, clickToSeek }` |
| `dock` | `DockOptions` | `{}` | `{ enabled }` — the floating player |
| `autoScroll` | `"off" \| "paragraph"` | `"off"` | Scroll the spoken paragraph into view |
| `exclusive` | `boolean` | `true` | Starting this player pauses the others |
| `rememberPreferences` | `boolean` | `true` | Persist speed, volume, mute and highlighting |
| `rememberPosition` | `boolean` | `false` | Resume where the reader left off, keyed by `slug` |
| `mediaSession` | `boolean` | `true` | Publish to the OS media controls |
| `title` | `string` | — | Title for the OS media controls |
| `artwork` | `string` | — | Artwork URL for the OS media controls |
| `showPlaceholder` | `boolean` | `true` | Show a message when there is no audio |
| `class` | `string` | `""` | Extra classes on the root |
| `id` | `string` | derived | Overrides the generated element id |

#### Controls, and their order

`controls` sets both which controls appear and where they sit:

```astro
<AudioPlayer slug={slug} controls={["play", "volume", "progress", "highlight"]} />
```

| Name | Renders |
|------|---------|
| `play` | Play/pause button |
| `progress` | Elapsed/total time above the seek bar; grows to fill the row |
| `time` | Elapsed/total time on its own |
| `highlight` | Word-highlighting toggle |
| `speed` | Playback-speed menu |
| `volume` | Mute button and volume slider |
| `skip-back` | Jump backwards by `skipSeconds` |
| `skip-forward` | Jump forwards by `skipSeconds` |

Default: `["play", "progress", "highlight", "speed", "volume"]`. Anything you leave out
is not rendered — pass `[]` with `dock={{ enabled: true }}` for a dock-only player.

#### Variants

`bar` is a horizontal strip on a card. `minimal` drops the background, border, shadow
and padding so the player borrows the page — useful inline with prose or under a title.
`card` opens room above the controls for a title or artwork through the `before` slot.

#### Slots

Every slot falls back to the shipped markup, so override only what you need.

| Slot | Replaces |
|------|----------|
| `icon-play`, `icon-pause` | Play/pause icons |
| `icon-volume`, `icon-muted` | Volume icons |
| `icon-highlight-on`, `icon-highlight-off` | Highlight-toggle icons |
| `icon-skip-back`, `icon-skip-forward` | Skip icons |
| `placeholder` | The "no audio" message |
| `error` | The failed-to-load message and its retry button |
| `before`, `after` | Arbitrary content above/below the controls |

```astro
<AudioPlayer slug={slug} audioEntry={entry} variant="card">
  <div slot="before"><strong>{title}</strong></div>
  <svg slot="icon-play" class="vocasync-icon vocasync-icon--play" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" fill="currentColor" />
  </svg>
</AudioPlayer>
```

#### Text and translation

Every visible string and every `aria-label` comes from `strings`:

```astro
<AudioPlayer
  slug={slug}
  audioEntry={entry}
  strings={{
    label: "Écouter cet article",
    play: "Lire",
    pause: "Pause",
    unavailable: "Audio non disponible pour cet article",
  }}
/>
```

Keys: `label`, `loading`, `unavailable`, `error`, `retry`, `play`, `pause`, `seek`,
`mute`, `unmute`, `volume`, `speed`, `highlightOn`, `highlightOff`. Anything you omit
keeps its English default.

### Remembering what the reader chose

Speed, volume, mute and the highlighting toggle persist across pages and visits by
default — set `rememberPreferences={false}` to opt out. `rememberPosition` is separate
and off by default: resuming is welcome on a long article and confusing on a short post
someone expects to start from the beginning. When on, a position is only restored if
the reader was more than five seconds in and more than ten seconds from the end, and it
is cleared once the audio finishes.

All of it degrades quietly. `localStorage` throws outright in browsers configured to
block site data, and stored values are validated before use — a hand-edited playback
rate is not assigned to the media element.

### Loading and failure states

The player root carries `data-player-state` (`loading`, `ready`, `no-audio`, `error`)
and `data-player-buffering` while the media element is waiting on the network. They are
distinct on purpose: a slow connection should not look like a broken one. Both are
styleable:

```css
:root:has(.vocasync-player[data-player-buffering]) { /* … */ }
```

The seek bar also paints its buffered range, driven by `--vocasync-played` and
`--vocasync-buffered`.

#### Events

The root element dispatches bubbling `CustomEvent`s, so you can hook analytics or
build your own UI alongside the player without forking it:

`vocasync:ready`, `vocasync:play`, `vocasync:pause`, `vocasync:ended`,
`vocasync:error`, `vocasync:ratechange`, `vocasync:wordchange`.

```js
document.querySelector(".vocasync-player")
  .addEventListener("vocasync:wordchange", (e) => {
    // e.detail is { index, el } or null during silence between words
  });
```

#### Keyboard shortcuts

Available when focus is inside the player.

| Key | Action |
|-----|--------|
| `Space` | Play/pause |
| `←` / `→` | Skip by `skipSeconds` (default 15) |
| `M` | Toggle mute |
| `H` | Toggle word highlighting |
| `Esc` | Close the speed menu |

Inside the speed menu, `↑`/`↓`, `Home` and `End` move between rates and `Esc` returns
focus to the trigger.

### Word Highlighting

Wrap your article content so the player can find the word spans:

```astro
<div data-article-body>
  <Content />
</div>
```

The rehype plugin wraps each word in a `<span class="vocasync-word" data-i data-n>` at
build time. `data-i` is the word's start index in the alignment stream and `data-n` is
how many alignment tokens it consumes — a visible word can span several, since "$50" is
spoken as two.

Clicking a word seeks to it. That is independent of the highlighting toggle, so a
reader who turns highlighting off keeps click-to-seek.

## Headless usage

If you want entirely your own markup, import the engine and skip the component. This
API is covered by semver from 2.0.0.

```ts
import { createPlayer } from "@vocasync/astro/player-core";

const player = createPlayer(document.querySelector(".my-player"));
// player.pause(); player.destroy();
```

`createPlayer` reads its configuration from a
`<script type="application/json" class="vocasync-data">` inside the element, and finds
controls by `data-action` and `data-state` attributes — see the shipped component for
the shape it expects.

Lower-level pieces are exported too, for building something quite different:

```ts
import {
  computeSpanTimings, // visible units -> time spans
  spanAtTime,         // the span active at t, or null during silence
  idxForTime,
  createHighlighter,
  resolveAudioSrc,
} from "@vocasync/astro/player-core";
```

Headless consumers still need `content.css` for the word-highlighting styles, but can
skip `player.css`:

```css
@import "@vocasync/astro/styles/content.css";
```

## Supported Languages

VocaSync supports 14 languages where both speech synthesis and forced alignment are available. Languages use ISO 639-1 codes:

| Code | Language | Code | Language |
|------|----------|------|----------|
| `zh` | Chinese | `pl` | Polish |
| `cs` | Czech | `pt` | Portuguese |
| `en` | English | `ru` | Russian |
| `fr` | French | `es` | Spanish |
| `de` | German | `sv` | Swedish |
| `ja` | Japanese | `tr` | Turkish |
| `ko` | Korean | `uk` | Ukrainian |

> **Note:** VocaSync requires both speech synthesis and word-level forced alignment for each language. While synthesis (powered by OpenAI TTS) supports 61 languages, alignment (powered by Montreal Forced Aligner) is available for a smaller set. The 14 languages listed above are where both capabilities overlap, and they match the platform's alignment-supported set.

## Math Support

VocaSync supports LaTeX math equations using [Speech Rule Engine](https://github.com/zorkow/speech-rule-engine) to convert math to spoken text.

### Installation

Install the math dependencies. `mathjax-full` powers both the spoken form and (via
`rehype-mathjax`) the visual rendering, so you don't also need KaTeX:

```bash
bun add remark-math rehype-mathjax mathjax-full speech-rule-engine
```

### Setup

Math needs three plugins in a specific order:

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import vocasync from "@vocasync/astro";
import { rehypeAudioWords, rehypeMathSpeech } from "@vocasync/astro/rehype";
import remarkMath from "remark-math";
import rehypeMathjax from "rehype-mathjax";

const collectionName = "blog";
const audioMapPath = "src/data/audio-map.json";

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkMath], // parse $...$ / $$...$$
    rehypePlugins: [
      [rehypeMathSpeech, { collectionName, audioMapPath }], // attach spoken form (before render)
      rehypeMathjax,                                        // render math to HTML
      [rehypeAudioWords, { collectionName, audioMapPath }], // wrap words + math units
    ],
  },
  integrations: [vocasync()],
});
```

Enable math in `vocasync.config.mjs` so `vocasync sync` generates the spoken forms:

```javascript
export default {
  // ...
  math: { enabled: true, style: "clearspeak" }, // or "mathspeak"
};
```

> **Currency `$` collides with math.** With `remark-math` enabled, `$5 … $1200` is parsed
> as an inline math span. Escape currency dollar signs as `\$` (e.g. `\$5`, `\$1200`) so
> they're treated as text — VocaSync then speaks them correctly ("five dollars").

### How It Works

1. During `vocasync sync` (Node/CLI), each LaTeX expression is converted to spoken text
   (e.g. `$x^2$` → "x squared") and stored in `audio-map.json`. It's spoken and aligned
   as part of the post's audio.
2. At build time, **rehypeMathSpeech** reads those spoken forms from the audio map and
   attaches each as a `data-speech` attribute on the math element (math-to-speech never
   runs inside the Astro/Vite build).
3. **rehypeMathjax** renders the math to visual HTML.
4. **rehypeAudioWords** wraps each math expression as a single highlight unit, so the whole
   equation lights up together while it's read.

### Configuration

Set the speech style in `vocasync.config.mjs`:

```javascript
export default {
  // ...
  math: {
    enabled: true,
    style: "clearspeak",  // or "mathspeak"
  },
};
```

- **clearspeak**: Natural, conversational style (recommended)
- **mathspeak**: More formal, precise mathematical speech

## Deployment

### Build Strategy

#### For Large Content Collections

If you have many posts, we recommend running `npx vocasync sync` **once locally** before your first deployment:

```bash
# Run locally to generate all audio (may take a while)
npx vocasync sync

# Commit the audio-map to version control
git add src/data/audio-map.json
git commit -m "Add audio map"
git push
```

This approach:
- Prevents long CI/CD build times (important for platforms like Vercel with time limits)
- Only new or changed posts will be processed on subsequent builds
- Audio map acts as a cache - existing entries are skipped

#### For New/Updated Posts

For ongoing updates, include the sync command in your build script:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "npx vocasync sync && astro build",
    "preview": "astro preview"
  }
}
```

Since most builds only process new or changed content, this adds minimal time.

### CI/CD Environment Variables

Make sure to set `VOCASYNC_API_KEY` in your deployment environment:

- **Vercel**: Settings → Environment Variables
- **Netlify**: Site settings → Environment variables
- **GitHub Actions**: Repository secrets

### Example GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      - run: bun run build
        env:
          VOCASYNC_API_KEY: ${{ secrets.VOCASYNC_API_KEY }}
      
      - name: Deploy
        # Your deploy step here
```

## Important: Audio Map

### What is audio-map.json?

The `audio-map.json` file is the **source of truth** for VocaSync. Each entry stores:

- The synthesis and alignment **project UUIDs** (the two-POST flow uses two projects)
- A **publishable key** for each (the synthesis key streams the audio; the alignment key
  was used at build time to fetch the timings)
- The **word timings** (`words`) and any **math spoken forms** (`mathSpeech`), embedded so
  the player needs no runtime alignment fetch
- The resolved `voice` / `language` / `format`, a content hash, and timestamps

### Audio Map Versions

- **Version 1/2** (legacy): a single project + one `publishableKey`, no embedded timings.
- **Version 3** (current): two projects + two publishable keys, embedded `words` timings,
  and per-post `voice`/`language`/`format`.

Legacy v1/v2 entries are missing the v3 fields, so the first `vocasync sync` re-synthesizes
them once to produce complete v3 entries.

### ⚠️ Do Not Delete

**If you delete `audio-map.json`, running `npx vocasync sync` will re-create synthesis and alignment jobs for ALL content.** This will:

1. Incur API costs for re-processing everything
2. Generate new audio files (old URLs will still work)

### Best Practices

1. **Commit to version control**: Add `audio-map.json` to git
2. **Back it up**: Keep a backup before major changes
3. **Don't edit manually**: Let the CLI manage this file

```bash
# Add to git
git add src/data/audio-map.json
git commit -m "Add audio map"
```

### What to Ignore

Add your `.env` file to `.gitignore`:

```gitignore
# .gitignore
.env
.env.local
```

## Theming

The player is designed to disappear into your site. Every visual decision is a CSS
custom property, and every rule it ships sits in a cascade layer *and* is wrapped in
`:where()` — so it has zero specificity and any rule you write beats it, whatever your
import order. You should never need `!important`.

The stylesheet is injected for you. Pass `styles: false` to the integration if you
would rather import it yourself.

### Start with four seeds

```css
:root {
  --vocasync-accent: #7c3aed;
  --vocasync-surface: #ffffff;
  --vocasync-text: #1e1b2e;
  --vocasync-highlight: #f59e0b;
}
```

Borders, muted text, hover states, the track behind the progress bar and the contrast
colour on the play button all derive from those four. Override any derived token on
its own if a derivation is not what you wanted.

### Better: point them at tokens you already have

```css
:root {
  --vocasync-accent: var(--color-primary);
  --vocasync-surface: var(--color-card);
  --vocasync-text: var(--color-text);
}
```

Now the player follows your palette *and* your dark mode, because your tokens already
flip. For shadcn/ui and Tailwind that is a single import:

```css
@import "@vocasync/astro/styles/preset-shadcn.css";
```

### Dark mode

Recognised with no configuration: the OS preference, plus `.dark`,
`[data-theme="dark"]` and `[data-mode="dark"]` — which covers Tailwind, next-themes,
daisyUI and Starlight. An explicit `.light`, `[data-theme="light"]` or
`data-vocasync-scheme="light"` opts out of the OS preference.

If your site signals dark mode some other way, name the selector:

```js
vocasync({ theme: { darkSelector: '[data-appearance="night"]' } })
```

### Token reference

**Colour — seeds**

| Token | Default | Notes |
|-------|---------|-------|
| `--vocasync-accent` | `#3b82f6` | Play button, progress fill, slider thumbs |
| `--vocasync-surface` | `#f8fafc` | Player background |
| `--vocasync-text` | `#1e293b` | Primary text |
| `--vocasync-highlight` | `#10b981` | The word currently being spoken |

These four are registered with `@property`, so assigning something that is not a colour
falls back instead of blanking the component.

**Colour — derived** (override individually if you want)

| Token | Derived from |
|-------|--------------|
| `--vocasync-accent-hover` | accent, darkened |
| `--vocasync-accent-content` | black or white, whichever reads on the accent |
| `--vocasync-surface-raised` | surface, lightened — menus and the dock |
| `--vocasync-text-muted` | text mixed toward surface |
| `--vocasync-text-faint` | text mixed further toward surface |
| `--vocasync-border` | text mixed heavily toward surface |
| `--vocasync-track` | the unfilled part of a slider |
| `--vocasync-buffered-color` | the loaded-so-far range behind the seek bar |
| `--vocasync-highlight-active-bg` | highlight at 25% |
| `--vocasync-highlight-trail-bg` | highlight at 12% |
| `--vocasync-highlight-active-text` | unset — the active word keeps the prose colour |
| `--vocasync-l-threshold` | `0.623` — lightness at which `accent-content` flips to black. Perceptual, not a WCAG measurement; raise it if your accent needs dark text sooner |

**Typography**

| Token | Default |
|-------|---------|
| `--vocasync-font-family` | `inherit` |
| `--vocasync-font-size` | `0.875rem` |
| `--vocasync-font-size-sm` | `0.75rem` |
| `--vocasync-font-weight` | `400` |
| `--vocasync-font-weight-medium` | `500` |
| `--vocasync-line-height` | `1.4` |
| `--vocasync-numeric` | `tabular-nums` |

**Density and size** — `--vocasync-density` multiplies all of the following, so one
value rescales the player. The `size` prop sets it per player.

| Token | Default |
|-------|---------|
| `--vocasync-density` | `1` |
| `--vocasync-unit` | `0.25rem` |
| `--vocasync-gap` | `0.75rem` |
| `--vocasync-gap-sm` | `0.25rem` |
| `--vocasync-padding` | `1rem` |
| `--vocasync-control-size` | `2.5rem` |
| `--vocasync-control-size-sm` | `2rem` |
| `--vocasync-icon-size` | `1.25rem` |

**Shape**

| Token | Default |
|-------|---------|
| `--vocasync-radius` | `0.75rem` |
| `--vocasync-radius-control` | `0.375rem` |
| `--vocasync-radius-menu` | `0.5rem` |
| `--vocasync-radius-pill` | `9999px` |
| `--vocasync-word-radius` | `0.125rem` |
| `--vocasync-border-width` | `1px` |

**Sliders, dock, focus, elevation, motion, layering**

| Token | Default |
|-------|---------|
| `--vocasync-slider-height` | `0.375rem` |
| `--vocasync-played` | runtime state — the played range, written by the player |
| `--vocasync-buffered` | runtime state — the loaded range, written by the player |
| `--vocasync-slider-thumb-size` | `1rem` |
| `--vocasync-volume-width` | `4rem` |
| `--vocasync-dock-height` | `3.5rem` |
| `--vocasync-dock-offset` | `1rem` |
| `--vocasync-dock-width` | `20rem` |
| `--vocasync-focus-width` | `2px` |
| `--vocasync-focus-offset` | `2px` |
| `--vocasync-focus-color` | `var(--vocasync-accent)` |
| `--vocasync-shadow-sm`, `--vocasync-shadow`, `--vocasync-shadow-lg` | subtle elevation |
| `--vocasync-transition-fast`, `--vocasync-transition` | `150ms` / `200ms` ease |
| `--vocasync-menu-z` | `10` |
| `--vocasync-dock-z` | `1000` |

### Stylesheets

| Import | Contains |
|--------|----------|
| `@vocasync/astro/styles/vocasync.css` | Everything (what the integration injects) |
| `@vocasync/astro/styles/layers.css` | The `@layer` order statement only |
| `@vocasync/astro/styles/tokens.css` | The tokens above |
| `@vocasync/astro/styles/content.css` | Word highlighting — needed even when headless |
| `@vocasync/astro/styles/player.css` | The player chrome — skip it if you bring your own |
| `@vocasync/astro/styles/preset-shadcn.css` | Maps our tokens onto a shadcn host's |

Import `layers.css` first if you want the layer order pinned regardless of where your
other imports land.

## Migrating from v1

**Your audio map is unchanged.** The schema stays at version 3, so there is no re-sync
and no API spend — this release is presentation only.

### Why the styling changed

Astro compiles a component's scoped styles to `.vocasync-player[data-astro-cid-…]`,
which has higher specificity than a plain class. Your own `.vocasync-player { … }` lost
to it, and so did any Tailwind utility passed through `class`. Three `!important`
declarations closed the rest. In practice the player could not be restyled.

The CSS now ships as ordinary stylesheets, in a cascade layer, with every selector
wrapped in `:where()`. Your rules win — layered or not, in any import order — and
nothing needs `!important`.

### Stylesheet import

```diff
- import "@vocasync/astro/styles/variables.css";
```

Delete it. The integration injects the stylesheet; pass `styles: false` if you would
rather import `@vocasync/astro/styles/vocasync.css` yourself.

### Token renames

| v1 | v2 |
|----|----|
| `--vocasync-primary` | `--vocasync-accent` |
| `--vocasync-primary-hover` | `--vocasync-accent-hover` |
| `--vocasync-primary-content` | `--vocasync-accent-content` |
| `--vocasync-surface-elevated` | `--vocasync-surface-raised` |
| `--vocasync-border-focus` | `--vocasync-focus-color` |
| `--vocasync-player-radius` | `--vocasync-radius` |
| `--vocasync-player-padding` | `--vocasync-padding` |
| `--vocasync-player-gap` | `--vocasync-gap` |
| `--vocasync-button-size` | `--vocasync-control-size` |
| `--vocasync-button-radius` | `--vocasync-radius-pill` |
| `--vocasync-slider-radius` | `--vocasync-radius-pill` |
| `--vocasync-mini-height` | `--vocasync-dock-height` |
| `--vocasync-mini-offset` | `--vocasync-dock-offset` |
| `--vocasync-highlight-active-opacity` | `--vocasync-highlight-active-bg` (a colour, not a number) |
| `--vocasync-highlight-trail-opacity` | `--vocasync-highlight-trail-bg` (a colour, not a number) |
| `--vocasync-highlight-text` | **removed** |
| `--vocasync-transition-slow` | **removed** |

`--vocasync-highlight-text` was documented but no rule ever read it, so setting it
never did anything. `--vocasync-transition-slow` was never referenced.

In most cases you can delete the overrides entirely and set the four seeds instead.

### Prop changes

| v1 | v2 |
|----|----|
| `label="…"` | `strings={{ label: "…" }}` |
| `enableMiniPlayer={false}` | `dock={{ enabled: false }}` |
| `enableHighlighting={false}` | `highlight={{ enabled: false }}` |
| `enableClickToSeek={false}` | `highlight={{ clickToSeek: false }}` |
| `trailLength={4}` | `highlight={{ trailLength: 4 }}` |

```diff
  <AudioPlayer
    slug={slug}
    audioEntry={audioEntry}
-   label={`Listen to "${title}"`}
-   enableMiniPlayer={true}
-   enableHighlighting={true}
-   trailLength={4}
+   strings={{ label: `Listen to "${title}"` }}
+   highlight={{ trailLength: 4 }}
  />
```

### Behaviour changes

- **Arrow keys skip 15 seconds, not 5.** Set `skipSeconds={5}` to keep the old jump.
- **Speed, volume, mute and highlighting are remembered** across pages and visits. Set
  `rememberPreferences={false}` to opt out.
- **Autoscroll is off by default.** It used to follow the spoken word with no way to
  stop it, taking over the reader's scroll position. Pass `autoScroll="paragraph"` to
  keep the old behaviour.
- **Starting one player pauses the others.** Pass `exclusive={false}` to allow overlap.
- **A failed load shows an error state with a retry**, rather than leaving controls
  that look interactive but do nothing.
- **Click-to-seek no longer depends on highlighting.** Turning highlighting off used to
  disable it silently.
- **Autoscroll yields to the reader.** Scrolling suspends it for a few seconds rather
  than dragging the page back.

### Rehype plugin

`classPrefix` is removed. It renamed the word-span class while `.vocasync-word` stayed
hardcoded in the stylesheet, the player and the WordPress plugin, so setting it
silently broke highlighting. Use `extraWordClass` to add a class alongside
`vocasync-word`, or drive the engine headlessly for entirely different markup.

```diff
- [rehypeAudioWords, { collectionName, audioMapPath, classPrefix: "vocasync" }]
+ [rehypeAudioWords, { collectionName, audioMapPath }]
```

### Astro 7

Astro 7 replaced its default Markdown processor, so `@astrojs/markdown-remark` is no
longer installed with it — and rehype plugins do not run without it. On Astro 7:

```bash
bun add @astrojs/markdown-remark
```

Astro 4, 5 and 6 need nothing extra.

## Troubleshooting

### "No VocaSync configuration found"

Create a `vocasync.config.mjs` file in your project root.

### Words not highlighting

1. Make sure the rehype plugin is configured in `astro.config.mjs`
2. Check that `collectionName` matches your collection
3. Verify `audioMapPath` points to your audio map
4. Ensure content is wrapped in `[data-article-body]`

### Audio not playing

1. Run `npx vocasync sync` to generate audio
2. Check that `audio-map.json` exists and has entries
3. Verify the `slug` prop matches your content slug

### CLI errors

```bash
# Check your configuration
npx vocasync check

# Verify API key is set
echo $VOCASYNC_API_KEY
```

## License

MIT
