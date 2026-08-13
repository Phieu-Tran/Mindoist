import { describe, expect, it } from 'vitest';
import type { Task } from '@mindoist/shared/types';
import { calendarProjectionToItems, type CalendarProjection, type DeadlineProjection } from './projection';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', userId: 'user-1', projectId: 'project-1', projectColumnId: null,
  sectionId: null, parentId: null, title: 'Ship calendar', description: null,
  color: null, priority: 1, deadline: { date: '2026-08-04', time: '17:30', timeZone: 'Asia/Ho_Chi_Minh' },
  startDate: null, estimateMin: 60, rrule: null, recurringResetMode: null, recurrenceBasis: null,
  pomodoroCount: 0, completedAt: null, sortOrder: 0, createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z', deletedAt: null, tagIds: [], ...overrides,
});

const deadline = (overrides: Partial<DeadlineProjection> = {}): DeadlineProjection => ({
  id: 'deadline-task-1', taskId: 'task-1', title: 'Ship calendar', startDate: null,
  date: '2026-08-04', time: '17:30', timeZone: 'Asia/Ho_Chi_Minh', completedAt: null,
  priority: 1, projectId: 'project-1', colorOverride: null, ...overrides,
});

const projection = (overrides: Partial<CalendarProjection> = {}): CalendarProjection => ({
  timeBlocks: [{
    id: 'block-1', userId: 'user-1', taskId: 'task-1', startAt: '2026-08-03T02:00:00Z',
    endAt: '2026-08-03T03:00:00Z', timeZone: 'Asia/Ho_Chi_Minh', allDay: false,
    source: 'MANUAL', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', deletedAt: null,
  }],
  deadlines: [deadline()],
  externalEvents: [{ id: 'google-1', title: 'Standup', startAt: '2026-08-03T06:00:00Z', endAt: '2026-08-03T07:00:00Z', allDay: false, provider: 'GOOGLE' }],
  ...overrides,
});

describe('calendarProjectionToItems', () => {
  it('keeps planned blocks, deadlines and external events as distinct renderer-neutral kinds', () => {
    const items = calendarProjectionToItems(projection(), [task()], [{ id: 'project-1', color: 'jade' }]);
    expect(items.map(item => item.kind)).toEqual(['block', 'deadline', 'external']);
    expect(items[0]).toMatchObject({ identityColor: 'var(--color-project-jade)', editable: true });
    expect(items[1]).toMatchObject({ allDay: false, time: '17:30' });
    expect(items[2]).toMatchObject({ provider: 'google', allDay: false });
  });

  it('inherits project identity until an explicit task color overrides it', () => {
    const inherited = calendarProjectionToItems(
      projection({ deadlines: [], externalEvents: [] }),
      [task({ color: null })],
      [{ id: 'project-1', color: 'jade' }],
    );
    expect(inherited[0]).toMatchObject({ identityColor: 'var(--color-project-jade)', colorName: 'jade' });

    const overridden = calendarProjectionToItems(
      projection({ deadlines: [], externalEvents: [] }),
      [task({ color: 'rose' })],
      [{ id: 'project-1', color: 'jade' }],
    );
    expect(overridden[0]).toMatchObject({ identityColor: 'var(--color-project-rose)', colorName: 'rose' });
  });

  it('marks all overlapping time blocks without using priority as their hue', () => {
    const second = { ...projection().timeBlocks[0], id: 'block-2', startAt: '2026-08-03T02:30:00Z', endAt: '2026-08-03T03:30:00Z' };
    const items = calendarProjectionToItems(projection({ timeBlocks: [projection().timeBlocks[0], second], deadlines: [], externalEvents: [] }), [task()], []);
    expect(items).toHaveLength(2);
    expect(items.every(item => item.kind === 'block' && item.conflict)).toBe(true);
    expect(items[0]).toMatchObject({ identityColor: 'var(--calendar-time-block-accent)' });
  });

  it('represents a task range separately from its deadline point', () => {
    const items = calendarProjectionToItems(projection({ timeBlocks: [], deadlines: [deadline({ startDate: '2026-07-20' })], externalEvents: [] }), [task({ startDate: '2026-07-20' })], []);
    expect(items.map(item => item.kind)).toEqual(['range', 'deadline']);
    expect(items[0]).toMatchObject({ startDate: '2026-07-20', endDate: '2026-08-04' });
  });

  it('drops stale projected tasks immediately once a loaded task list no longer contains them', () => {
    const items = calendarProjectionToItems(projection(), [task({ id: 'other-task' })], []);
    expect(items.map(item => item.kind)).toEqual(['external']);
  });

  it('retains projection data during a cold load when the task list is empty', () => {
    const items = calendarProjectionToItems(projection({ timeBlocks: [], externalEvents: [] }), [], []);
    expect(items.map(item => item.kind)).toEqual(['deadline']);
  });
});
