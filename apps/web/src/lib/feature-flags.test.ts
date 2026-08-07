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

  it('keeps the three rollout switches independent and immutable', () => {
    const flags = resolveFeatureFlags({
      VITE_TASK_DETAIL_V2: 'true',
      VITE_CALENDAR_V2: 'false',
      VITE_DESIGN_TOKENS_V2: '1',
    });

    expect(flags).toEqual({
      taskDetailV2: true,
      calendarV2: false,
      designTokensV2: true,
    });
    expect(Object.isFrozen(flags)).toBe(true);
  });

  it('enables the completed rollout by default while preserving explicit rollback values', () => {
    expect(resolveFeatureFlags({}, true)).toEqual({
      taskDetailV2: true,
      calendarV2: true,
      designTokensV2: true,
    });
    expect(
      resolveFeatureFlags(
        {
          VITE_TASK_DETAIL_V2: 'false',
          VITE_CALENDAR_V2: 'off',
          VITE_DESIGN_TOKENS_V2: '0',
        },
        true,
      ),
    ).toEqual({
      taskDetailV2: false,
      calendarV2: false,
      designTokensV2: false,
    });
  });
});
