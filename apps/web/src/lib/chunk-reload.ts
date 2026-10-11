const RELOAD_KEY = 'mindoist:stale-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /is not a valid JavaScript MIME type/i,
  /Unable to preload CSS/i,
];

/** A lazy chunk from a previous deploy no longer exists: the host answers the
 * old hashed URL with index.html, so the dynamic import rejects. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return STALE_CHUNK_PATTERNS.some(pattern => pattern.test(message));
}

/** Reloads to pick up the current build. Returns false when a reload already
 * happened moments ago, so a genuinely broken chunk cannot loop forever. */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage there is no loop guard, so do not reload automatically.
    return false;
  }
  window.location.reload();
  return true;
}

export function installStaleChunkRecovery() {
  window.addEventListener('vite:preloadError', event => {
    if (reloadForStaleChunk()) event.preventDefault();
  });
}
