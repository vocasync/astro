/**
 * Resolve the audio stream URL, appending the publishable key when one is present.
 *
 * This is deliberately NOT shared with `api/client.ts`'s `withPublishableKey`, which
 * looks almost identical. That one runs under Node during `vocasync sync`, always
 * against absolute API URLs, and has no `document` to resolve a base from. This one
 * runs in the browser, where an audio map may legitimately carry a site-relative URL.
 * Two runtimes, two correct behaviours -- unifying them would break one of them.
 */

/**
 * Returns the URL to assign to `audio.src`, or null when there is nothing playable.
 *
 * Never throws. The previous implementation called `new URL(url)` with no base, which
 * throws on a relative URL; the throw was swallowed by the caller's outer try/catch
 * and surfaced as "Audio not available for this article" with no error anywhere.
 */
export function resolveAudioSrc(
  audioUrl: unknown,
  publishableKey?: unknown,
  base?: string
): string | null {
  if (typeof audioUrl !== "string" || audioUrl.trim() === "") return null;
  if (typeof publishableKey !== "string" || publishableKey === "") return audioUrl;

  try {
    const url = new URL(audioUrl, base);
    url.searchParams.set("pk", publishableKey);
    return url.toString();
  } catch {
    // An unparseable URL is still worth attempting: the browser may resolve it even
    // where URL() will not, and a 404 is a better failure than no audio at all.
    return audioUrl;
  }
}
