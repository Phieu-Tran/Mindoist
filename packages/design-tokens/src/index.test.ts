import { describe, expect, it } from 'vitest';
import { accentColors, priorityColors, projectColors, providerColors } from './index.js';

describe('color ownership', () => {
  it('keeps priority colors independent from every accent preset', () => {
    const baseline = JSON.stringify(priorityColors);
    for (const accent of Object.keys(accentColors.light)) {
      expect(accent).not.toBe('p1');
      expect(JSON.stringify(priorityColors)).toBe(baseline);
    }
  });

  it('defines project and provider identity outside the action accent palette', () => {
    expect(projectColors.light.indigo).not.toBe(accentColors.light.indigo);
    expect(providerColors.google).not.toBe(accentColors.light.indigo);
  });
});
