/**
 * Remembered playback preferences and positions.
 *
 * Every access is guarded. `localStorage` throws outright when a browser is
 * configured to block site data, and in Safari's private mode writes throw once the
 * quota is hit -- a player that crashes on boot because someone hardened their
 * browser would be a poor trade for remembering a volume setting.
 */

const PREFS_KEY = "vocasync:prefs";
const POSITION_PREFIX = "vocasync:pos:";

/** Preferences shared by every player on the site. */
export interface PlayerPrefs {
  rate?: number;
  volume?: number;
  muted?: boolean;
  highlighting?: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Returns null rather than throwing when storage is unavailable. */
export function getStorage(view?: { localStorage?: StorageLike } | null): StorageLike | null {
  try {
    const store = view?.localStorage;
    if (!store) return null;
    // Presence is not permission: probe before trusting it.
    const probe = "vocasync:probe";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function readJson(store: StorageLike | null, key: string): unknown {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function readPrefs(store: StorageLike | null): PlayerPrefs {
  const raw = readJson(store, PREFS_KEY);
  if (!raw || typeof raw !== "object") return {};
  const { rate, volume, muted, highlighting } = raw as Record<string, unknown>;
  const prefs: PlayerPrefs = {};
  // Validate rather than trust: this is user-writable storage, and a bad rate would
  // be assigned straight to playbackRate.
  if (isFiniteNumber(rate) && rate > 0 && rate <= 5) prefs.rate = rate;
  if (isFiniteNumber(volume) && volume >= 0 && volume <= 1) prefs.volume = volume;
  if (typeof muted === "boolean") prefs.muted = muted;
  if (typeof highlighting === "boolean") prefs.highlighting = highlighting;
  return prefs;
}

export function writePrefs(store: StorageLike | null, patch: PlayerPrefs): void {
  if (!store) return;
  try {
    store.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(store), ...patch }));
  } catch {
    // Quota or a blocked write; preferences are a convenience, not a requirement.
  }
}

export function readPosition(store: StorageLike | null, slug: string): number | null {
  const raw = readJson(store, POSITION_PREFIX + slug);
  return isFiniteNumber(raw) && raw > 0 ? raw : null;
}

export function writePosition(store: StorageLike | null, slug: string, seconds: number): void {
  if (!store || !Number.isFinite(seconds)) return;
  try {
    store.setItem(POSITION_PREFIX + slug, JSON.stringify(seconds));
  } catch {
    /* ignore */
  }
}

export function clearPosition(store: StorageLike | null, slug: string): void {
  if (!store) return;
  try {
    store.removeItem(POSITION_PREFIX + slug);
  } catch {
    /* ignore */
  }
}

/**
 * Where to resume, given a remembered position.
 *
 * Declines when the reader was essentially at the start or had all but finished, so a
 * fresh listen is not skipped a few seconds in and a completed article does not
 * reopen at its final second.
 */
export function resumePoint(saved: number | null, duration: number): number | null {
  if (saved === null || !Number.isFinite(duration) || duration <= 0) return null;
  if (saved < 5) return null;
  if (saved > duration - 10) return null;
  return saved;
}
