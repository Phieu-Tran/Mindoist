import type { PositionedBlock, CalendarItem } from './types';
import { dateToY } from './time-grid';

type TimedItem = Extract<CalendarItem, { kind: 'block' | 'external' }>;

/** Overlapping blocks share columns within their group; gaps reset the width. */
export function layoutTimedItems(items: TimedItem[], options: { startHour?: number; slotHeight?: number; minHeight?: number } = {}): PositionedBlock[] {
  const { startHour = 0, slotHeight = 20, minHeight = 20 } = options;
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  const result: PositionedBlock[] = [];
  const columnEnds: number[] = [];
  let groupStart = 0;
  let groupEnd = -Infinity;
  const finishGroup = () => {
    for (let index = groupStart; index < result.length; index++) {
      result[index].columnCount = columnEnds.length;
    }
  };
  for (const item of sorted) {
    const start = item.start.getTime();
    const end = item.end.getTime();
    if (start >= groupEnd) {
      finishGroup();
      groupStart = result.length;
      columnEnds.length = 0;
    }
    let column = columnEnds.findIndex(columnEnd => columnEnd <= start);
    if (column < 0) column = columnEnds.length;
    columnEnds[column] = end;
    groupEnd = Math.max(groupEnd, end);
    result.push({
      item,
      column,
      columnCount: 1,
      top: dateToY(item.start, startHour, slotHeight),
      height: Math.max(minHeight, dateToY(item.end, startHour, slotHeight) - dateToY(item.start, startHour, slotHeight)),
    });
  }
  finishGroup();
  return result;
}
