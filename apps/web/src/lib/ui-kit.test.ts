import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UI_KIT_STORAGE_KEY,
  consumeUiKitQueryParam,
  getUiKitPreference,
  parseUiKit,
  resolveUiKit,
  setUiKitPreference,
} from './ui-kit';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('ui-kit resolution', () => {
  it('parses only known kits', () => {
    expect(parseUiKit('HeroUI ')).toBe('heroui');
    expect(parseUiKit('legacy')).toBe('legacy');
    expect(parseUiKit('material')).toBeNull();
    expect(parseUiKit(null)).toBeNull();
  });

  it('falls back to the environment default (legacy in tests)', () => {
    expect(getUiKitPreference()).toBe('default');
    expect(resolveUiKit()).toBe('legacy');
  });

  it('prefers the per-device choice over the environment default', () => {
    localStorage.setItem(UI_KIT_STORAGE_KEY, 'heroui');
    expect(resolveUiKit()).toBe('heroui');
    localStorage.setItem(UI_KIT_STORAGE_KEY, 'garbage');
    expect(resolveUiKit()).toBe('legacy');
  });

  it('applies ?ui-kit= to storage and strips it from the URL', () => {
    window.history.replaceState(null, '', '/today?ui-kit=heroui&tab=1');
    consumeUiKitQueryParam();
    expect(localStorage.getItem(UI_KIT_STORAGE_KEY)).toBe('heroui');
    expect(window.location.search).toBe('?tab=1');

    window.history.replaceState(null, '', '/today?ui-kit=default');
    consumeUiKitQueryParam();
    expect(localStorage.getItem(UI_KIT_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(resolveUiKit()).toBe('legacy');
    expect(() => setUiKitPreference('heroui', false)).not.toThrow();
  });
});
