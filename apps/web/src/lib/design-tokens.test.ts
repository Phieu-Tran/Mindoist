import { describe, expect, it } from 'vitest';
import sharedTokens from '@mindoist/design-tokens/web.css?raw';
import appStyles from '../index.css?raw';

const ACCENTS = ['indigo', 'ocean', 'jade', 'rose', 'amber'];

describe('design token ownership', () => {
  it('does not let an accent preset override priority or identity colors', () => {
    for (const accent of ACCENTS) {
      const blocks = [
        ...appStyles.matchAll(
          new RegExp(
            `:root(?:\\.dark)?\\[data-accent="${accent}"\\]\\s*\\{([^}]*)\\}`,
            'g',
          ),
        ),
      ];
      expect(blocks.length).toBeGreaterThan(0);
      for (const [, declarations] of blocks) {
        expect(declarations).not.toMatch(/--color-(?:p[1-4]|priority|project|provider)/);
      }
    }
  });

  it('publishes explicit priority, project, provider and calendar roles', () => {
    expect(sharedTokens).toContain('--color-priority-p3:');
    expect(sharedTokens).toContain('--color-project-indigo:');
    expect(sharedTokens).toContain('--color-provider-google:');
    expect(sharedTokens).toContain('--calendar-time-block-accent:');
    expect(sharedTokens).toContain('--calendar-deadline-accent:');
  });
});
