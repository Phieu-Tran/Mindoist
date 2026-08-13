import { describe, expect, it } from 'vitest';
import { extendTaskSelection, toggleTaskSelection } from './keyboard-selection';

describe('keyboard task selection', () => {
  it('toggles only the focused task', () => {
    expect([...toggleTaskSelection(new Set(['a']), 'b')]).toEqual(['a', 'b']);
    expect([...toggleTaskSelection(new Set(['a', 'b']), 'b')]).toEqual(['a']);
  });

  it('extends the selected range while moving focus', () => {
    const down = extendTaskSelection(new Set(), ['a', 'b', 'c'], 'a', 'next');
    expect(down.focusedTaskId).toBe('b');
    expect([...down.selectedIds]).toEqual(['a', 'b']);

    const up = extendTaskSelection(down.selectedIds, ['a', 'b', 'c'], 'b', 'previous');
    expect(up.focusedTaskId).toBe('a');
    expect([...up.selectedIds]).toEqual(['a', 'b']);
  });
});
