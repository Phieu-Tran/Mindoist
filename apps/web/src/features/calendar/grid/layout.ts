import type { PositionedBlock, CalendarItem } from './types';
import { dateToY } from './time-grid';

type TimedItem = Extract<CalendarItem, { kind: 'block' | 'external' }>;

/** Interval-graph colouring: overlapping blocks receive separate columns. */
export function layoutTimedItems(items: TimedItem[], options: { startHour?: number; slotHeight?: number; minHeight?: number } = {}): PositionedBlock[] {
  const { startHour = 0, slotHeight = 20, minHeight = 20 } = options;
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  const columns: TimedItem[][] = [];
  const assigned = new Map<string, number>();
  for (const item of sorted) {
    let column = columns.findIndex(columnItems => columnItems.every(other => other.end.getTime() <= item.start.getTime() || item.end.getTime() <= other.start.getTime()));
    if (column < 0) { column = columns.length; columns.push([]); }
    columns[column].push(item);
    assigned.set(item.id, column);
  }
  return sorted.map(item => ({
    item,
    column: assigned.get(item.id) || 0,
    columnCount: columns.length,
    top: dateToY(item.start, startHour, slotHeight),
    height: Math.max(minHeight, dateToY(item.end, startHour, slotHeight) - dateToY(item.start, startHour, slotHeight)),
  }));
}
