import { featureFlags, type UiKitName } from './feature-flags';

/**
 * Which component kit renders the shared primitives in components/ui.
 * `legacy` is the hand-rolled set; `heroui` wraps HeroUI v3 (React Aria).
 *
 * Resolution order, highest first:
 *   1. `?ui-kit=legacy|heroui|default` in the URL — written through to (2)
 *   2. the per-device choice from Settings (`localStorage['ui-kit']`)
 *   3. the environment default baked in at build time (`VITE_UI_KIT`)
 *
 * Only one kit's code is loaded per page load (see components/ui/kit.ts),
 * so switching kits reloads the page.
 */
export type UiKit = UiKitName;
export type UiKitPreference = UiKit | 'default';

export const UI_KIT_STORAGE_KEY = 'ui-kit';
export const UI_KIT_QUERY_PARAM = 'ui-kit';
export const UI_KIT_OPTIONS: readonly UiKitPreference[] = ['default', 'legacy', 'heroui'];

export function parseUiKit(value: string | null | undefined): UiKit | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'legacy' || normalized === 'heroui' ? normalized : null;
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(UI_KIT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: UiKit | null) {
  try {
    if (value) localStorage.setItem(UI_KIT_STORAGE_KEY, value);
    else localStorage.removeItem(UI_KIT_STORAGE_KEY);
  } catch {
    // Blocked storage (private mode, sandboxed preview) — the choice just
    // won't persist; the environment default still applies.
  }
}

export function getUiKitPreference(): UiKitPreference {
  return parseUiKit(readStorage()) ?? 'default';
}

export function getDefaultUiKit(): UiKit {
  return featureFlags.uiKitDefault;
}

/**
 * Applies a `?ui-kit=` override (if any) to storage and strips it from the
 * address bar so a shared link doesn't keep re-applying it.
 */
export function consumeUiKitQueryParam(location: Pick<Location, 'href'> = window.location) {
  let url: URL;
  try {
    url = new URL(location.href);
  } catch {
    return;
  }
  if (!url.searchParams.has(UI_KIT_QUERY_PARAM)) return;

  const raw = url.searchParams.get(UI_KIT_QUERY_PARAM);
  if (raw?.trim().toLowerCase() === 'default') writeStorage(null);
  else {
    const kit = parseUiKit(raw);
    if (kit) writeStorage(kit);
  }

  url.searchParams.delete(UI_KIT_QUERY_PARAM);
  try {
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Non-browser environments (tests) — the override was still recorded.
  }
}

export function resolveUiKit(): UiKit {
  const preference = getUiKitPreference();
  return preference === 'default' ? getDefaultUiKit() : preference;
}

export function setUiKitPreference(preference: UiKitPreference, reload = true) {
  writeStorage(preference === 'default' ? null : preference);
  if (reload) window.location.reload();
}

export function applyUiKitAttribute(kit: UiKit) {
  document.documentElement.dataset.uiKit = kit;
}
