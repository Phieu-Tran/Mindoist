import { describe, expect, it } from 'vitest';
import { planLegacyScheduleMigration } from './legacy-migration';

describe('planLegacyScheduleMigration', () => {
  it('keeps a date-only deadline as a local calendar date', () => {
    const result = planLegacyScheduleMigration(
      { id: 'date-only', dueDate: '2026-07-29T00:00:00.000Z' },
      'Asia/Ho_Chi_Minh',
    );

    expect(result.deadline).toEqual({ date: '2026-07-29' });
    expect(result.timeBlockCandidate).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('preserves timed deadline semantics and proposes a block only when duration is explicit', () => {
    const result = planLegacyScheduleMigration(
      {
        id: 'timed',
        dueDate: '2026-07-29',
        dueTime: '23:30',
        durationMin: 90,
      },
      'Asia/Ho_Chi_Minh',
    );

    expect(result.deadline).toEqual({
      date: '2026-07-29',
      time: '23:30',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(result.timeBlockCandidate).toEqual({
      source: 'legacy-timed-duration',
      startLocal: '2026-07-29T22:00',
      endLocal: '2026-07-29T23:30',
      timeZone: 'Asia/Ho_Chi_Minh',
      allDay: false,
    });
  });

  it('does not silently convert a multi-day task range into an all-day calendar block', () => {
    const result = planLegacyScheduleMigration(
      {
        id: 'range',
        startDate: '2026-07-27',
        dueDate: '2026-07-29',
      },
      'UTC',
    );

    expect(result.deadline).toEqual({ date: '2026-07-29' });
    expect(result.timeBlockCandidate).toBeNull();
    expect(result.warnings).toContain('ambiguous-date-range');
  });

  it('reports invalid legacy combinations instead of inventing schedule data', () => {
    const result = planLegacyScheduleMigration(
      {
        id: 'invalid',
        dueDate: 'not-a-date',
        dueTime: '25:00',
        durationMin: -30,
      },
      'UTC',
    );

    expect(result.deadline).toBeNull();
    expect(result.timeBlockCandidate).toBeNull();
    expect(result.warnings).toEqual(['invalid-date', 'invalid-time', 'invalid-duration']);
  });
});
