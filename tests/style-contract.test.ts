import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The style contract.
 *
 * The player's appearance is a public API: consumers theme it through
 * `--vocasync-*` custom properties and target `.vocasync-*` classes. Nothing else
 * checks that surface -- CSS is not typechecked and the component is not covered by
 * unit tests -- so declarations rot silently. Three had already rotted when these
 * tests were written: two tokens declared but never read, and one rule styling a
 * class no code emits.
 *
 * These tests assert both directions. A token that is declared but never consumed is
 * a promise the player does not keep; a token consumed but never declared renders as
 * `unset`, which is invisible until someone reports a colourless player.
 */

const ROOT = join(import.meta.dir, "..");
const CSS = join(ROOT, "src/styles/variables.css");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const sourceFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|astro|css)$/.test(f));
const sources = new Map(sourceFiles.map((f) => [f, readFileSync(f, "utf8")]));
const css = readFileSync(CSS, "utf8");

/** `--vocasync-x: value` in a declaration position. */
function declaredTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/^\s*(--vocasync-[a-z0-9-]+)\s*:/gm)) out.add(m[1]);
  return out;
}

/** `var(--vocasync-x)` anywhere, including inside color-mix()/calc(). */
function consumedTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/var\(\s*(--vocasync-[a-z0-9-]+)/g)) out.add(m[1]);
  return out;
}

describe("token contract", () => {
  const declared = declaredTokens(css);
  const consumed = new Set<string>();
  for (const text of sources.values()) {
    for (const t of consumedTokens(text)) consumed.add(t);
  }

  test("the stylesheet declares tokens at all", () => {
    expect(declared.size).toBeGreaterThan(20);
  });

  test("every consumed token is declared", () => {
    const undeclared = [...consumed].filter((t) => !declared.has(t)).sort();
    expect(undeclared).toEqual([]);
  });

  test("every declared token is consumed", () => {
    const dead = [...declared].filter((t) => !consumed.has(t)).sort();
    expect(dead).toEqual([]);
  });
});

describe("class contract", () => {
  /** Class selectors the stylesheet actually styles. */
  const styled = new Set<string>();
  for (const m of css.matchAll(/\.(vocasync-[a-z0-9_-]+)/g)) styled.add(m[1]);

  /** Every `vocasync-*` token appearing anywhere in source, CSS excluded. */
  const referenced = new Set<string>();
  for (const [file, text] of sources) {
    if (file.endsWith(".css")) continue;
    for (const m of text.matchAll(/["'`\s.](vocasync-[a-z0-9_-]+)/g)) referenced.add(m[1]);
  }

  test("the stylesheet styles classes at all", () => {
    expect(styled.size).toBeGreaterThan(0);
  });

  test("every class the stylesheet styles is emitted by some code path", () => {
    const orphaned = [...styled].filter((c) => !referenced.has(c)).sort();
    expect(orphaned).toEqual([]);
  });
});
