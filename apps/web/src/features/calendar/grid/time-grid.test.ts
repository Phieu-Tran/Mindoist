import { describe, expect, it } from 'vitest';
import { workWeekDates } from './time-grid';

describe('workWeekDates', () => {
  it('returns Monday through Friday for a weekend anchor', () => {
    const days = workWeekDates(new Date('2026-08-16T12:00:00Z'));
    expect(days.map(day => day.getDay())).toEqual([1, 2, 3, 4, 5]);
  });
});
