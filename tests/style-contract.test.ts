import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The style contract.
 *
 * The player's appearance is a public API: consumers theme it through
 * `--vocasync-*` custom properties and target `.vocasync-*` classes. CSS is not
 * typechecked and browsers report nothing when a token resolves to `unset`, so
 * without these tests the surface rots silently -- and it had: two tokens declared
 * and never read, one rule styling a class nothing emits.
 *
 * These also pin the guarantees v2 makes about the cascade. `@layer` alone is not
 * enough: layer precedence is fixed by the order layer names are first seen, so a
 * consumer whose Tailwind import registers its layers before ours would find our
 * rules outranking their utilities. Every selector is therefore ALSO wrapped in
 * `:where()`, which drops it to zero specificity, making the outcome independent of
 * import order. A rule that escapes either mechanism is a bug, hence the assertions.
 */

const ROOT = join(import.meta.dir, "..");
const STYLES = join(ROOT, "src/styles");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const cssFiles = walk(STYLES).filter((f) => f.endsWith(".css"));
const cssByFile = new Map(cssFiles.map((f) => [f, readFileSync(f, "utf8")]));
const allCss = [...cssByFile.values()].join("\n");

const sourceFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|astro)$/.test(f));
const sources = new Map(sourceFiles.map((f) => [f, readFileSync(f, "utf8")]));

const rel = (f: string) => f.slice(ROOT.length + 1);

/** Strip comments so prose never counts as code. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("token contract", () => {
  const declared = new Set<string>();
  for (const m of stripComments(allCss).matchAll(/^\s*(--vocasync-[a-z0-9-]+)\s*:/gm)) {
    declared.add(m[1]);
  }

  const consumed = new Set<string>();
  for (const text of [...cssByFile.values(), ...sources.values()]) {
    for (const m of stripComments(text).matchAll(/var\(\s*(--vocasync-[a-z0-9-]+)/g)) {
      consumed.add(m[1]);
    }
  }

  test("the stylesheets declare a substantial token surface", () => {
    expect(declared.size).toBeGreaterThan(40);
  });

  test("every consumed token is declared", () => {
    // An undeclared token resolves to `unset`: a transparent background or an
    // inherited colour, with nothing reported anywhere.
    const undeclared = [...consumed].filter((t) => !declared.has(t)).sort();
    expect(undeclared).toEqual([]);
  });

  test("every declared token is consumed", () => {
    const dead = [...declared].filter((t) => !consumed.has(t)).sort();
    expect(dead).toEqual([]);
  });

  test("the four seeds are registered so a bad value cannot break the component", () => {
    // @property gives each seed a typed fallback. Assign a gradient to an
    // unregistered custom property and every rule using it resolves to `unset`.
    const registered = new Set(
      [...allCss.matchAll(/@property\s+(--vocasync-[a-z0-9-]+)/g)].map((m) => m[1])
    );
    expect([...registered].sort()).toEqual([
      "--vocasync-accent",
      "--vocasync-highlight",
      "--vocasync-surface",
      "--vocasync-text",
    ]);
    for (const seed of registered) {
      const block = allCss.slice(allCss.indexOf(`@property ${seed}`));
      expect(block.slice(0, 160)).toContain("initial-value");
    }
  });
});

describe("documentation contract", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const documented = new Set([...readme.matchAll(/`(--vocasync-[a-z0-9-]+)`/g)].map((m) => m[1]));
  const declared = new Set<string>();
  for (const m of stripComments(allCss).matchAll(/^\s*(--vocasync-[a-z0-9-]+)\s*:/gm)) {
    declared.add(m[1]);
  }

  test("every token the player ships is documented in the README", () => {
    // The previous README documented 10 of 30 tokens, and one of the values it gave
    // did not match what shipped. An undocumented token is one nobody can use.
    const undocumented = [...declared].filter((t) => !documented.has(t)).sort();
    expect(undocumented).toEqual([]);
  });

  test("the migration table covers every renamed or removed v1 token", () => {
    // Tokens named in the README that no longer exist must be accounted for there,
    // or a reader following an old blog post gets no explanation.
    const v1Only = [...documented].filter((t) => !declared.has(t));
    const migration = readme.slice(readme.indexOf("## Migrating from v1"));
    const unexplained = v1Only.filter((t) => !migration.includes(t)).sort();
    expect(unexplained).toEqual([]);
    expect(v1Only.length).toBeGreaterThan(10);
  });
});

describe("strings documentation contract", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const strings = readFileSync(join(ROOT, "src/player-core/strings.ts"), "utf8");

  test("every translatable key is documented", () => {
    // An undocumented key is one nobody knows they can translate, and every one of
    // these is either visible text or an accessible label.
    const iface = strings.slice(
      strings.indexOf("export interface PlayerStrings"),
      strings.indexOf("export const defaultStrings")
    );
    const keys = [...iface.matchAll(/^\s{2}(\w+)[?:]/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(15);
    const section = readme.slice(readme.indexOf("### Text and translation"));
    const undocumented = keys.filter((k) => !section.slice(0, 3000).includes(`\`${k}\``));
    expect(undocumented).toEqual([]);
  });
});

describe("README examples contract", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  /** Everything before the migration guide, which legitimately names removed API. */
  const body = readme.slice(0, readme.indexOf("## Migrating from v1"));

  test("no example uses a prop that was removed in v2", () => {
    // The Quick Start still passed `label="…"` after the prop became
    // `strings={{ label }}` -- a broken snippet in the first code anyone copies.
    const removed = [
      "label=",
      "enableMiniPlayer",
      "enableHighlighting",
      "enableClickToSeek",
      "trailLength=",
      "classPrefix",
      "variables.css",
    ];
    const used = removed.filter((r) => body.includes(r));
    expect(used).toEqual([]);
  });

  test("every AudioPlayer prop used in an example is a real prop", () => {
    const types = readFileSync(join(ROOT, "src/components/types.ts"), "utf8");
    const declared = new Set([...types.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]));
    const used = new Set<string>();
    for (const block of body.matchAll(/<AudioPlayer\b([\s\S]*?)\/?>/g)) {
      for (const attr of block[1].matchAll(/(?:^|\s)([a-zA-Z]+)=/g)) used.add(attr[1]);
    }
    expect(used.size).toBeGreaterThan(3);
    const unknown = [...used].filter((u) => !declared.has(u) && u !== "slot");
    expect(unknown).toEqual([]);
  });
});

describe("README navigation contract", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const slugify = (h: string) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  const headings = new Set([...readme.matchAll(/^#{2,4} (.+)$/gm)].map((m) => slugify(m[1])));

  test("every internal link points at a heading that exists", () => {
    // A broken anchor scrolls nowhere and reports nothing.
    const links = [...readme.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(10);
    expect([...new Set(links)].filter((l) => !headings.has(l))).toEqual([]);
  });

  test("the table of contents covers every top-level section", () => {
    const toc = readme.slice(
      readme.indexOf("## Table of Contents"),
      readme.indexOf("## Installation")
    );
    const listed = new Set([...toc.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((m) => m[1]));
    const sections = [...readme.matchAll(/^## (.+)$/gm)]
      .map((m) => m[1])
      .filter((h) => !["Features", "Demo", "Table of Contents", "License"].includes(h));
    const missing = sections.map(slugify).filter((s2) => !listed.has(s2));
    expect(missing).toEqual([]);
  });
});

describe("cascade contract", () => {
  test("no rule uses !important", () => {
    for (const [file, css] of cssByFile) {
      expect({ file: rel(file), important: stripComments(css).includes("!important") }).toEqual({
        file: rel(file),
        important: false,
      });
    }
  });

  test("every stylesheet that styles anything declares the layer order", () => {
    for (const [file, css] of cssByFile) {
      if (!/\{/.test(stripComments(css).replace(/@import[^;]+;/g, ""))) continue;
      if (rel(file).endsWith("vocasync.css")) continue; // the barrel only imports
      expect({ file: rel(file), declares: css.includes("@layer vocasync.tokens,") }).toEqual({
        file: rel(file),
        declares: true,
      });
    }
  });

  test("every class selector is wrapped in :where()", () => {
    // A bare `.vocasync-thing` would carry real specificity and could beat a
    // consumer's own rule inside the same layer.
    const offenders: string[] = [];
    for (const [file, css] of cssByFile) {
      const body = stripComments(css);
      for (const m of body.matchAll(/(^|[\s,>+~(])(\.vocasync-[a-z0-9_-]+)/g)) {
        const before = body.slice(Math.max(0, m.index - 40), m.index + m[0].length);
        if (!/:where\([^)]*$/.test(before)) offenders.push(`${rel(file)}: ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("layered rules are the only ones that style the player", () => {
    for (const [file, css] of cssByFile) {
      const body = stripComments(css).replace(/@import[^;]+;/g, "");
      if (!body.includes(".vocasync-")) continue;
      // Everything selecting a vocasync class must sit inside an @layer block.
      const layerless = body.split("@layer")[0];
      expect({ file: rel(file), strayRules: /\.vocasync-[a-z-]+[^;]*\{/.test(layerless) }).toEqual({
        file: rel(file),
        strayRules: false,
      });
    }
  });
});

describe("scheme contract", () => {
  const tokens = readFileSync(join(STYLES, "tokens.css"), "utf8");

  /**
   * Both of these were real bugs, caught in a browser rather than here: happy-dom
   * ignores @layer entirely, so nothing in this suite can evaluate the cascade. They
   * are pinned structurally instead, because the failure is silent -- the player
   * simply stays light while the site goes dark.
   */

  test("dark-scheme selectors carry real specificity", () => {
    // Wrapped in :where() they score zero and lose to the `:root` block declaring the
    // light values, so adding `.dark` did nothing at all.
    const darkBlocks = [
      ...tokens.matchAll(
        /^\s*(\[data-vocasync-scheme="dark"\]|\.dark|\[data-theme="dark"\]|\[data-mode="dark"\])/gm
      ),
    ];
    expect(darkBlocks.length).toBeGreaterThanOrEqual(4);
    expect(tokens).not.toContain(':where([data-vocasync-scheme="dark"]');
    expect(tokens).not.toMatch(/:where\([^)]*\.dark[^)]*\)/);
  });

  test("the derivation runs after the scheme blocks", () => {
    // Derived tokens must recompute from whichever seeds won, or a custom seed only
    // half-applies in dark mode: the surface changes, the borders do not.
    const firstDark = tokens.indexOf("@media (prefers-color-scheme: dark)");
    const classDark = tokens.indexOf('\n  [data-vocasync-scheme="dark"]');
    const derivation = tokens.indexOf("@supports (color: color-mix");
    const contrast = tokens.indexOf("@supports (color: oklch(from red");
    expect(firstDark).toBeGreaterThan(-1);
    expect(classDark).toBeGreaterThan(firstDark);
    expect(derivation).toBeGreaterThan(classDark);
    expect(contrast).toBeGreaterThan(classDark);
  });

  test("an explicit light signal opts out of the OS dark preference", () => {
    const media = tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"));
    for (const signal of [
      '[data-vocasync-scheme="light"]',
      ".light",
      '[data-theme="light"]',
      '[data-mode="light"]',
    ]) {
      expect(media.slice(0, 400)).toContain(signal);
    }
  });

  test("every scheme block sets the seeds, not just derived colours", () => {
    // Setting only derived values would leave the seeds light, so anything deriving
    // from them at runtime would disagree with the rest of the player.
    const seeds = [
      "--vocasync-accent:",
      "--vocasync-surface:",
      "--vocasync-text:",
      "--vocasync-highlight:",
    ];
    const blocks = tokens
      .split(/(?=@media \(prefers-color-scheme: dark\)|\n {2}\[data-vocasync-scheme="dark"\])/)
      .slice(1);
    expect(blocks.length).toBe(2);
    for (const block of blocks) {
      for (const seed of seeds) expect(block).toContain(seed);
    }
  });
});

describe("class contract", () => {
  const styled = new Set<string>();
  for (const m of stripComments(allCss).matchAll(/\.(vocasync-[a-z0-9_-]+)/g)) styled.add(m[1]);

  const referenced = new Set<string>();
  for (const text of sources.values()) {
    for (const m of stripComments(text).matchAll(/["'`\s.](vocasync-[a-z0-9_-]+)/g)) {
      referenced.add(m[1]);
    }
  }

  test("the stylesheets style classes at all", () => {
    expect(styled.size).toBeGreaterThan(10);
  });

  test("every class the stylesheets style is emitted by some code path", () => {
    // `.vocasync-math-speech` styled a class nothing emitted for months.
    const orphaned = [...styled].filter((c) => !referenced.has(c)).sort();
    expect(orphaned).toEqual([]);
  });
});
