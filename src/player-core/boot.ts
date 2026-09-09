import { createPlayer } from "./player.js";
import * as registry from "./registry.js";

/**
 * Finds every player on the page and wires it up.
 *
 * The component previously used `define:vars`, which forces an inline script: Astro
 * re-executes those on a view-transition swap, so the player kept working across
 * navigations by accident. A hoisted module script does NOT re-execute -- the browser
 * has already loaded it -- so the lifecycle has to be explicit:
 *
 *   - boot on load, for pages without <ClientRouter />
 *   - boot again on `astro:page-load`, which fires after every swap
 *   - tear down on `astro:before-swap`, or animation loops, IntersectionObservers and
 *     click delegates leak onto every subsequent page
 *
 * `data-vocasync-ready` makes booting idempotent, since both paths can fire for the
 * same document.
 */

const READY_ATTR = "data-vocasync-ready";
const PLAYER_SELECTOR = ".vocasync-player";

/** Wire up every player in `doc` that is not already running. */
export function bootAll(doc: Document = document): void {
  for (const el of Array.from(doc.querySelectorAll(PLAYER_SELECTOR))) {
    const root = el as HTMLElement;
    if (root.hasAttribute(READY_ATTR)) continue;
    try {
      createPlayer(root);
    } catch (error) {
      // One malformed player must not stop the others on the page.
      console.error("[vocasync] Failed to initialise player", error);
    }
  }
}

/** Destroy every live player. Runs before a view-transition swap. */
export function teardownAll(): void {
  registry.destroyAll();
}

let installed = false;

/**
 * Install the lifecycle once per document. Safe to call repeatedly.
 */
export function install(doc: Document = document): void {
  if (installed) return;
  installed = true;

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", () => bootAll(doc), { once: true });
  } else {
    bootAll(doc);
  }

  // Astro's view transitions. These listeners survive swaps because the module is
  // evaluated once; that is precisely why they have to exist.
  doc.addEventListener("astro:page-load", () => bootAll(doc));
  doc.addEventListener("astro:before-swap", teardownAll);
}
