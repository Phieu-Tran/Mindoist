import { describe, expect, it } from 'vitest';
import { parseFeatureFlag, resolveFeatureFlags } from './feature-flags';

describe('feature flags', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['off', false],
  ])('parses %s', (value, expected) => {
    expect(parseFeatureFlag(value)).toBe(expected);
  });

  it('uses a safe fallback for missing and invalid values', () => {
    expect(parseFeatureFlag(undefined)).toBe(false);
    expect(parseFeatureFlag('invalid')).toBe(false);
    expect(parseFeatureFlag('invalid', true)).toBe(true);
  });

  it('keeps the remaining rollout switch immutable', () => {
    const flags = resolveFeatureFlags({
      VITE_DESIGN_TOKENS_V2: '1',
    });

    expect(flags).toEqual({
      designTokensV2: true,
      uiKitDefault: 'legacy',
      uiKitSwitcher: true,
    });
    expect(Object.isFrozen(flags)).toBe(true);
  });

  it('enables the completed rollout by default while preserving explicit rollback values', () => {
    expect(resolveFeatureFlags({}, true)).toMatchObject({
      designTokensV2: true,
    });
    expect(
      resolveFeatureFlags(
        {
          VITE_DESIGN_TOKENS_V2: '0',
        },
        true,
      ),
    ).toMatchObject({
      designTokensV2: false,
    });
  });

  it('resolves the UI kit default and switcher per environment', () => {
    expect(resolveFeatureFlags({})).toMatchObject({ uiKitDefault: 'legacy', uiKitSwitcher: true });
    expect(resolveFeatureFlags({ VITE_UI_KIT: 'HeroUI', VITE_UI_KIT_SWITCHER: 'off' }))
      .toMatchObject({ uiKitDefault: 'heroui', uiKitSwitcher: false });
    expect(resolveFeatureFlags({ VITE_UI_KIT: 'material' })).toMatchObject({ uiKitDefault: 'legacy' });
  });
});
