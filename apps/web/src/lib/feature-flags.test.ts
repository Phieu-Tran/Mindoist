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
    });
    expect(Object.isFrozen(flags)).toBe(true);
  });

  it('enables the completed rollout by default while preserving explicit rollback values', () => {
    expect(resolveFeatureFlags({}, true)).toEqual({
      designTokensV2: true,
    });
    expect(
      resolveFeatureFlags(
        {
          VITE_DESIGN_TOKENS_V2: '0',
        },
        true,
      ),
    ).toEqual({
      designTokensV2: false,
    });
  });
});
