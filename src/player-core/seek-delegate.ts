/**
 * Click-to-seek delegation, keyed by the article root rather than the document.
 *
 * The shipped player attached a `click` listener to `document` from inside every
 * player's init function. On a page with one player per post -- an index page, the
 * common case -- clicking any word ran every listener, so every player seeked to that
 * word and called play(). Several tracks started at once.
 *
 * Here each article root gets exactly one listener no matter how many players are on
 * the page, and a word only ever reaches the player that owns the root containing it.
 */

export type SeekHandler = (dataI: number) => void;

interface RootBinding {
  handlers: SeekHandler[];
  listener: (event: Event) => void;
}

const bindings = new WeakMap<Element, RootBinding>();

export interface SeekDelegateOptions {
  wordSelector?: string;
  /** Marks the root so CSS can show a pointer cursor over words. */
  activeClass?: string;
  /** Reports an ambiguous configuration; defaults to console.warn. */
  onWarn?: (message: string) => void;
}

/**
 * Route word clicks inside `root` to `handler`. Returns an unregister function.
 */
export function registerSeekRoot(
  root: Element,
  handler: SeekHandler,
  options: SeekDelegateOptions = {}
): () => void {
  const {
    wordSelector = ".vocasync-word[data-i]",
    activeClass = "vocasync-click-seek",
    onWarn = (message: string) => console.warn(message),
  } = options;

  let binding = bindings.get(root);

  if (!binding) {
    const created: RootBinding = {
      handlers: [],
      listener: (event: Event) => {
        const target = event.target as Element | null;
        const span = target?.closest?.(wordSelector) as HTMLElement | null;
        if (!span) return;

        // Never hijack a text selection the reader is making.
        const selection = root.ownerDocument?.defaultView?.getSelection?.();
        if (selection && selection.toString().length > 0) return;

        const dataI = Number.parseInt(span.dataset.i ?? "", 10);
        if (!Number.isFinite(dataI)) return;

        // Only the owning player acts. Notifying every handler is precisely the
        // bug this module exists to fix.
        created.handlers[0]?.(dataI);
      },
    };
    root.addEventListener("click", created.listener);
    root.classList.add(activeClass);
    bindings.set(root, created);
    binding = created;
  }

  binding.handlers.push(handler);
  if (binding.handlers.length > 1) {
    onWarn(
      "[vocasync] Two players resolve to the same article root, so click-to-seek is " +
        "ambiguous and only the first player will respond. Give each player its own " +
        "`articleSelector`."
    );
  }

  return () => {
    const current = bindings.get(root);
    if (!current) return;
    const index = current.handlers.indexOf(handler);
    if (index !== -1) current.handlers.splice(index, 1);
    if (current.handlers.length === 0) {
      root.removeEventListener("click", current.listener);
      root.classList.remove(activeClass);
      bindings.delete(root);
    }
  };
}
