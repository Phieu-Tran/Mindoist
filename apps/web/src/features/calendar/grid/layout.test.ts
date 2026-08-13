import { describe, expect, it } from 'vitest';
import type { TimeBlock } from '@mindoist/shared/types';
import { layoutTimedItems } from './layout';

const block = (id: string, start: string, end: string) => ({
  kind: 'block' as const,
  id,
  taskId: id,
  title: id,
  start: new Date(start),
  end: new Date(end),
  timeZone: 'UTC',
  editable: true as const,
  allDay: false,
  conflict: false,
  completed: false,
  priority: null,
  identityColor: 'indigo',
  colorName: null,
  block: { id } as TimeBlock,
});

describe('calendar grid layout', () => {
  it('colours overlapping intervals into separate columns', () => {
    const result = layoutTimedItems([block('a', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z'), block('b', '2026-01-01T09:30:00Z', '2026-01-01T11:00:00Z'), block('c', '2026-01-01T10:00:00Z', '2026-01-01T10:30:00Z')]);
    expect(result.map(item => item.column)).toEqual([0, 1, 0]);
    expect(result.every(item => item.columnCount === 2)).toBe(true);
  });
  it('keeps a minimum visible height for short blocks', () => {
    const result = layoutTimedItems([block('a', '2026-01-01T09:00:00Z', '2026-01-01T09:01:00Z')]);
    expect(result[0].height).toBe(20);
  });
});
