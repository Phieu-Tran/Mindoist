import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Task, TimeBlock } from '@mindoist/shared/types';
import type { CalendarProjection } from '../projection';
import { CalendarGridView } from './CalendarGridView';

const makeTask = (id: string, title: string, overrides: Partial<Task> = {}): Task => ({
  id, userId: 'user-1', projectId: null, projectColumnId: null, sectionId: null,
  parentId: null, title, description: null, color: null, priority: 1,
  deadline: null, startDate: null, estimateMin: 60, rrule: null, recurringResetMode: null,
  recurrenceBasis: null, pomodoroCount: 0, completedAt: '2026-08-12T10:00:00Z', sortOrder: 0,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-12T10:00:00Z', deletedAt: null,
  tagIds: [], ...overrides,
});

const timeBlock = (taskId: string): TimeBlock => ({
  id: 'block-1', userId: 'user-1', taskId,
  startAt: '2026-08-12T09:00:00', endAt: '2026-08-12T10:00:00',
  timeZone: 'Asia/Ho_Chi_Minh', allDay: false, source: 'MANUAL',
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', deletedAt: null,
});

describe('CalendarGridView', () => {
  it('renders a Monday-Friday working week', () => {
    render(
      <CalendarGridView
        anchorDate={new Date('2026-08-16T12:00:00Z')}
        projection={null}
        tasks={[]}
        onSelectTask={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('gridcell')).toHaveLength(5);
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Fri')).toBeTruthy();
  });

  it.each([
    ['timeGridDay', 1],
    ['timeGrid3Day', 3],
    ['timeGridWeek', 7],
  ] as const)('renders %s with %i day columns', (view, expectedDays) => {
    const { unmount } = render(
      <CalendarGridView
        anchorDate={new Date('2026-08-12T12:00:00Z')}
        projection={null}
        tasks={[]}
        view={view}
        onSelectTask={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('gridcell')).toHaveLength(expectedDays);
    unmount();
  });

  it('creates an inline scheduled task with project inheritance or an explicit flat color', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarGridView
        anchorDate={new Date('2026-08-12T12:00:00Z')}
        projection={null}
        tasks={[]}
        projects={[{ id: 'project-jade', name: 'Jade launch', color: 'jade' }]}
        view="timeGridDay"
        onSelectTask={vi.fn()}
        onCreateTask={onCreateTask}
      />,
    );

    fireEvent.keyDown(screen.getByRole('gridcell'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Plan launch' } });
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'project-jade' } });

    const form = screen.getByRole('form', { name: 'Create scheduled task' });
    expect(form.getAttribute('style')).toContain('--calendar-draft-identity-color: var(--color-project-jade)');
    expect(screen.getByRole('group', { name: 'Task color' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rose' }));
    expect(form.getAttribute('style')).toContain('--calendar-draft-identity-color: var(--color-project-rose)');
    fireEvent.click(screen.getByRole('button', { name: 'Create scheduled task' }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Plan launch',
      projectId: 'project-jade',
      color: 'rose',
      allDay: false,
    })));
  });

  it('marks completed timed and all-day tasks for strike-through and uses roomier time slots', () => {
    const timedTask = makeTask('timed-task', 'Completed focus');
    const allDayTask = makeTask('all-day-task', 'Completed deadline', {
      deadline: { date: '2026-08-12' },
    });
    const projection: CalendarProjection = {
      timeBlocks: [timeBlock(timedTask.id)],
      deadlines: [{
        id: 'deadline-1', taskId: allDayTask.id, title: allDayTask.title,
        startDate: null, date: '2026-08-12', time: null, timeZone: null,
        completedAt: allDayTask.completedAt, priority: 1, projectId: null, colorOverride: null,
      }],
      externalEvents: [],
    };
    const { container } = render(
      <CalendarGridView
        anchorDate={new Date('2026-08-12T12:00:00')}
        projection={projection}
        tasks={[timedTask, allDayTask]}
        view="timeGridDay"
        onSelectTask={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Completed focus/ }).closest('.mindoist-time-grid-block'))
      .toHaveClass('calendar-task-event-completed');
    expect(screen.getByRole('button', { name: 'Completed deadline' }))
      .toHaveClass('calendar-task-event-completed');
    expect(container.querySelector('.mindoist-time-grid')).toHaveStyle({
      '--grid-height': '1496px',
      '--calendar-hour-height': '88px',
    });
  });
});
