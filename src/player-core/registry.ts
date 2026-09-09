/**
 * Tracks live player instances on the page.
 *
 * Exists for two reasons: exclusive playback (starting one player stops the others,
 * rather than letting several tracks overlap), and teardown, which a view-transition
 * navigation needs so animation loops and observers do not leak across pages.
 */

export interface RegisteredPlayer {
  readonly root: Element;
  pause(): void;
  destroy(): void;
}

const instances = new Set<RegisteredPlayer>();

export function register(player: RegisteredPlayer): void {
  instances.add(player);
}

export function unregister(player: RegisteredPlayer): void {
  instances.delete(player);
}

/** Pause every player except the one starting. */
export function pauseOthers(except: RegisteredPlayer): void {
  for (const player of instances) {
    if (player !== except) player.pause();
  }
}

/** Destroy every instance. Called before a view-transition swap. */
export function destroyAll(): void {
  for (const player of Array.from(instances)) player.destroy();
  instances.clear();
}

export function count(): number {
  return instances.size;
}
