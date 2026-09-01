import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, TimeBlock } from '@mindoist/shared/types';
import { canonicalTaskOverrides, type LegacyTaskOverrides } from '../test/task-fixture';
import { PlanningCeremony } from './PlanningCeremony';

const makeTask = (id: string, overrides: LegacyTaskOverrides = {}): Task => ({
  id,
  userId: 'user-1',
  projectId: null,
  projectColumnId: null,
  sectionId: null,
  parentId: null,
  title: `Task ${id}`,
  description: null,
  color: null,
  priority: 4,
  deadline: null,
  startDate: null,
  estimateMin: 60,
  rrule: null,
  pomodoroCount: 0,
  completedAt: null,
  sortOrder: 0,
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  deletedAt: null,
  recurrenceBasis: null,
  recurringResetMode: null,
  tagIds: [],
  ...canonicalTaskOverrides(overrides),
});

const makeBlock = (id: string, taskId: string, startHour: number, endHour: number, overrides: Partial<TimeBlock> = {}): TimeBlock => ({
  id,
  userId: 'user-1',
  taskId,
  startAt: new Date(2026, 7, 12, startHour).toISOString(),
  endAt: new Date(2026, 7, 12, endHour).toISOString(),
  timeZone: 'Asia/Bangkok',
  allDay: false,
  source: 'MANUAL',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  deletedAt: null,
  completedAt: null,
  actualMin: null,
  ...overrides,
});

describe('PlanningCeremony', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 9, 15));
  });

  afterEach(() => vi.useRealTimers());

  it('shows capacity and only counts active top-level unscheduled tasks', () => {
    const scheduled = makeTask('scheduled', { estimateMin: 300 });
    const unscheduled = makeTask('unscheduled', { estimateMin: 90 });
    const completed = makeTask('completed', { completedAt: '2026-08-12T08:00:00.000Z' });
    const child = makeTask('child', { parentId: 'unscheduled' });
    render(<PlanningCeremony tasks={[scheduled, unscheduled, completed, child]} timeBlocks={[makeBlock('block-1', scheduled.id, 8, 13)]} workHoursPerDay={4} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Overcommitted by 1h');
    expect(screen.getByText('Unscheduled').parentElement).toHaveTextContent('1 · 1.5h');
  });

  it('accumulates focus time on the active block and can complete it', async () => {
    const task = makeTask('focus');
    const onUpdateTimeBlock = vi.fn().mockResolvedValue(undefined);
    render(<PlanningCeremony tasks={[task]} timeBlocks={[makeBlock('block-1', task.id, 9, 10, { actualMin: 5 })]} workHoursPerDay={8} onUpdateTimeBlock={onUpdateTimeBlock} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => vi.advanceTimersByTime(60_000));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(onUpdateTimeBlock).toHaveBeenCalledWith('block-1', expect.objectContaining({
      actualMin: 6,
      completedAt: expect.any(String),
    })));
  });

  it('moves only unfinished slipped tasks during shutdown', () => {
    const overdue = makeTask('overdue', { dueDate: '2026-08-11' });
    const scheduled = makeTask('scheduled');
    const completed = makeTask('completed');
    const onMoveAllTomorrow = vi.fn();
    render(<PlanningCeremony
      tasks={[overdue, scheduled, completed]}
      timeBlocks={[
        makeBlock('block-1', scheduled.id, 8, 9),
        makeBlock('block-2', completed.id, 7, 8, { completedAt: '2026-08-12T01:00:00.000Z' }),
      ]}
      workHoursPerDay={8}
      onMoveAllTomorrow={onMoveAllTomorrow}
    />);

    fireEvent.click(screen.getByRole('tab', { name: 'Close day' }));
    expect(screen.getByText('Slipped tasks').parentElement).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'Move all to tomorrow' }));
    expect(onMoveAllTomorrow).toHaveBeenCalledWith([overdue, scheduled]);
  });
});
