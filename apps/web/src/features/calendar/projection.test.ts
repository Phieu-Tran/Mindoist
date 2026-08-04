import { describe, expect, it } from 'vitest';
import type { Task } from '@mindoist/shared/types';
import {
  calendarProjectionToEvents,
  taskRangeToEvent,
  type CalendarProjection,
  type DeadlineProjection,
} from './projection';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  userId: 'user-1',
  projectId: null,
  projectColumnId: null,
  sectionId: null,
  parentId: null,
  title: 'Ship calendar range',
  description: null,
  color: null,
  priority: 2,
  dueDate: '2026-07-25',
  dueTime: null,
  startDate: '2026-07-20',
  durationMin: null,
  rrule: null,
  recurringResetMode: null,
  recurrenceBasis: null,
  pomodoroCount: 0,
  completedAt: null,
  sortOrder: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  tagIds: [],
  ...overrides,
});

const makeDeadline = (overrides: Partial<DeadlineProjection> = {}): DeadlineProjection => ({
  id: 'deadline-task-1',
  taskId: 'task-1',
  title: 'Ship calendar range',
  startDate: '2026-07-20',
  date: '2026-07-25',
  time: null,
  timeZone: null,
  completedAt: null,
  priority: 2,
  projectId: null,
  colorOverride: null,
  ...overrides,
});

const makeProjection = (deadline: DeadlineProjection): CalendarProjection => ({
  timeBlocks: [],
  deadlines: [deadline],
  externalEvents: [],
});

const identityTask = {
  id: 'identity-task',
  title: 'Write release notes',
  projectId: 'project-1',
  priority: 1,
  color: null,
  completedAt: null,
} as Task;

const identityProjection: CalendarProjection = {
  timeBlocks: [
    {
      id: 'block-1',
      userId: 'user-1',
      taskId: identityTask.id,
      startAt: '2026-08-03T02:00:00.000Z',
      endAt: '2026-08-03T03:00:00.000Z',
      timeZone: 'Asia/Ho_Chi_Minh',
      allDay: false,
      source: 'MANUAL',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      deletedAt: null,
    },
  ],
  deadlines: [
    {
      id: `deadline-${identityTask.id}`,
      taskId: identityTask.id,
      title: identityTask.title,
      startDate: null,
      date: '2026-08-04',
      time: '17:30',
      timeZone: 'Asia/Ho_Chi_Minh',
      completedAt: null,
      priority: 1,
      projectId: identityTask.projectId,
      colorOverride: null,
    },
  ],
  externalEvents: [
    {
      id: 'google-1',
      title: 'Team meeting',
      startAt: '2026-08-03T06:00:00.000Z',
      endAt: '2026-08-03T07:00:00.000Z',
      allDay: false,
      provider: 'GOOGLE',
    },
  ],
};

describe('calendarProjectionToEvents', () => {
  it('keeps time blocks, deadline markers and provider events as separate kinds', () => {
    const events = calendarProjectionToEvents(identityProjection, [identityTask], [
      { id: 'project-1', color: 'jade' },
    ]);

    expect(events.map(event => event.extendedProps?.kind)).toEqual([
      'timeBlock',
      'deadline',
      'externalEvent',
    ]);
    expect(events[0].color).toBe('var(--color-project-jade)');
    expect(events[1].classNames).toContain('calendar-priority-marker-p1');
    expect(events[1].color).toBe('var(--color-project-jade)');
    expect(events[2].editable).toBe(false);
  });

  it('does not turn task priority into the time-block identity color', () => {
    const [timeBlock] = calendarProjectionToEvents(identityProjection, [identityTask], []);
    expect(timeBlock.color).toBe('var(--calendar-time-block-accent)');
    expect(timeBlock.classNames).not.toContain('calendar-priority-event-p1');
  });

  it('marks overlapping planned blocks with a non-color conflict class', () => {
    const overlap: CalendarProjection = {
      ...identityProjection,
      timeBlocks: [
        identityProjection.timeBlocks[0],
        {
          ...identityProjection.timeBlocks[0],
          id: 'block-2',
          startAt: '2026-08-03T02:30:00.000Z',
          endAt: '2026-08-03T03:30:00.000Z',
        },
      ],
      deadlines: [],
      externalEvents: [],
    };
    const events = calendarProjectionToEvents(overlap, [identityTask], []);
    expect(events[0].classNames).toContain('calendar-conflict-event');
    expect(events[1].extendedProps?.conflict).toBe(true);
  });
});

describe('calendar task range projection', () => {
  it('uses an exclusive end so the range includes the deadline date', () => {
    const event = taskRangeToEvent(makeTask(), []);

    expect(event).toMatchObject({
      id: 'task-range-task-1',
      start: '2026-07-20',
      end: '2026-07-26',
      allDay: true,
      editable: false,
      extendedProps: { kind: 'taskRange', source: 'mindoist' },
    });
  });

  it('folds a date-only deadline into the final edge of the continuous range', () => {
    const events = calendarProjectionToEvents(
      makeProjection(makeDeadline()),
      [makeTask()],
      [],
    );

    expect(events.map(event => event.id)).toEqual(['task-range-task-1']);
  });

  it('renders an overlapping range from projection data even when the task list is unavailable', () => {
    const events = calendarProjectionToEvents(
      makeProjection(makeDeadline({
        startDate: '2026-06-15',
        date: '2026-08-31',
        colorOverride: 'jade',
      })),
      [],
      [],
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'task-range-task-1',
      start: '2026-06-15',
      end: '2026-09-01',
      color: 'var(--task-color-accent)',
      classNames: expect.arrayContaining(['calendar-task-range-event', 'task-color-jade']),
    });
  });

  it('uses the task color override for a projected deadline marker', () => {
    const events = calendarProjectionToEvents(
      makeProjection(makeDeadline({ startDate: null, colorOverride: 'sky' })),
      [],
      [],
    );

    expect(events[0]).toMatchObject({
      id: 'deadline-task-1',
      color: 'var(--task-color-accent)',
      classNames: expect.arrayContaining(['calendar-deadline-event', 'task-color-sky']),
    });
  });

  it('drops a deadline whose task is no longer in an already-loaded task list', () => {
    // Regression: deleting a task removed it from the live task list
    // immediately, but its deadline lingered in the (separately-fetched,
    // only-refetched-on-navigation) projection snapshot, so its marker kept
    // showing on Calendar right after deletion. An empty task list (cold
    // load) is different - see the "task list is unavailable" case above -
    // this only applies once the list has actually loaded and doesn't
    // include the task.
    const events = calendarProjectionToEvents(
      makeProjection(makeDeadline({ startDate: null, colorOverride: 'sky' })),
      [makeTask({ id: 'some-other-task', dueDate: null, startDate: null })],
      [],
    );

    expect(events).toEqual([]);
  });

  it('keeps both the range and a precise marker when the deadline has a time', () => {
    const events = calendarProjectionToEvents(
      makeProjection(makeDeadline({ time: '11:30', timeZone: 'Asia/Ho_Chi_Minh' })),
      [makeTask({ dueTime: '11:30' })],
      [],
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 'task-range-task-1',
      start: '2026-07-20',
      end: '2026-07-26',
      allDay: true,
    });
    expect(events[1]).toMatchObject({
      id: 'deadline-task-1',
      start: '2026-07-25T11:30:00',
      allDay: false,
      extendedProps: { kind: 'deadline' },
    });
  });

  it.each([
    { startDate: null, dueDate: '2026-07-25' },
    { startDate: '2026-07-25', dueDate: '2026-07-25' },
    { startDate: '2026-07-26', dueDate: '2026-07-25' },
  ])('does not create an invalid range for %o', overrides => {
    expect(taskRangeToEvent(makeTask(overrides), [])).toBeNull();
  });
});
