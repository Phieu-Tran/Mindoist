import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateTaskRequest } from '@mindoist/shared/types';
import { TaskScheduleEditor } from './TaskScheduleEditor';
import { propertiesForSection } from './property-registry';
import { useTaskAutosave } from './use-task-autosave';

// TaskScheduleEditor is controlled - startDate/deadlineDate only reflect a
// pick once the parent re-renders with the new value, the way TaskDetail
// really drives it. A wrapper with real state is needed wherever a test
// depends on that round-trip (e.g. the backwards-range guard, which reads
// the just-picked start value back out of props).
function ControlledSchedule() {
  const [startDate, setStartDate] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  return (
    <TaskScheduleEditor
      deadlineDate={deadlineDate}
      deadlineTime=""
      onDeadlineDateChange={setDeadlineDate}
      onDeadlineTimeChange={() => {}}
      startDate={startDate}
      onStartDateChange={setStartDate}
    />
  );
}

const enqueueMutation = vi.fn();

vi.mock('@/lib/sync/engine', () => ({
  enqueueMutation: (...args: unknown[]) => enqueueMutation(...args),
}));

describe('Task Detail v2 property composition', () => {
  it('keeps deadline and planned time as separate registered properties', () => {
    expect(propertiesForSection('schedule').map(property => property.id)).toEqual([
      'deadline',
      'plannedTime',
    ]);
  });

  it('shows a due day whose single final date is the deadline', () => {
    const onDeadlineDateChange = vi.fn();
    const onDeadlineTimeChange = vi.fn();
    const onStartDateChange = vi.fn();
    render(
      <TaskScheduleEditor
        deadlineDate="2026-08-03"
        deadlineTime="17:30"
        onDeadlineDateChange={onDeadlineDateChange}
        onDeadlineTimeChange={onDeadlineTimeChange}
        startDate=""
        onStartDateChange={onStartDateChange}
      />,
    );

    expect(screen.getByText('Due day')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Deadline:/ })).toBeInTheDocument();
    expect(screen.getByTestId('detail-deadline-v2')).toBeInTheDocument();
    expect(screen.getByTestId('detail-deadline-time-v2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Planned start')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
  });

  it('sets the deadline directly when only one date is picked', () => {
    const onDeadlineDateChange = vi.fn();
    render(
      <TaskScheduleEditor
        deadlineDate=""
        deadlineTime=""
        onDeadlineDateChange={onDeadlineDateChange}
        onDeadlineTimeChange={vi.fn()}
        startDate=""
        onStartDateChange={vi.fn()}
      />,
    );

    // One calendar, one spot: opening the single deadline trigger and
    // picking a day sets the deadline directly - no separate start-date
    // control needed for the common single-date case.
    fireEvent.click(screen.getByTestId('detail-deadline-v2'));
    fireEvent.click(screen.getByRole('button', { name: '15' }));

    expect(onDeadlineDateChange).toHaveBeenCalledWith(expect.stringMatching(/-15$/));
    expect(screen.queryByRole('dialog', { name: 'Pick date' })).not.toBeInTheDocument();
  });

  it('turns into a start->deadline span from the same popup, without a second control', () => {
    const onStartDateChange = vi.fn();
    const onDeadlineDateChange = vi.fn();
    render(
      <TaskScheduleEditor
        deadlineDate=""
        deadlineTime=""
        onDeadlineDateChange={onDeadlineDateChange}
        onDeadlineTimeChange={vi.fn()}
        startDate=""
        onStartDateChange={onStartDateChange}
      />,
    );

    fireEvent.click(screen.getByTestId('detail-deadline-v2'));
    fireEvent.click(screen.getByTestId('date-range-add-start'));
    fireEvent.click(screen.getByRole('button', { name: '15' }));
    expect(onStartDateChange).toHaveBeenCalledWith(expect.stringMatching(/-15$/));

    fireEvent.click(screen.getByRole('button', { name: '16' }));
    expect(onDeadlineDateChange).toHaveBeenCalledWith(expect.stringMatching(/-16$/));
    expect(screen.queryByRole('dialog', { name: 'Pick date' })).not.toBeInTheDocument();
  });

  it('cannot build a backwards range - days before the start are disabled while picking the deadline', () => {
    render(<ControlledSchedule />);

    fireEvent.click(screen.getByTestId('detail-deadline-v2'));
    fireEvent.click(screen.getByTestId('date-range-add-start'));
    fireEvent.click(screen.getByRole('button', { name: '15' })); // start = day 15

    const earlierDay = screen.getByRole('button', { name: '14' });
    expect(earlierDay).toBeDisabled();
    fireEvent.click(earlierDay);
    // Still on the Due tab, still nothing picked for it - the popup stayed
    // open instead of accepting the click as a (backwards) deadline.
    expect(screen.getByRole('dialog', { name: 'Pick date' })).toBeInTheDocument();
  });
});

describe('useTaskAutosave', () => {
  const initialDraft: UpdateTaskRequest = { title: 'Before' };

  beforeEach(() => {
    vi.useFakeTimers();
    enqueueMutation.mockReset();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces a save and supports undoing the last persisted draft', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ dirty, draft }) =>
        useTaskAutosave({
          enabled: true,
          taskId: 'task-1',
          dirty,
          draft,
          initialDraft,
          save,
          delay: 100,
        }),
      {
        initialProps: {
          dirty: false,
          draft: initialDraft,
        },
      },
    );

    rerender({ dirty: true, draft: { title: 'After' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(save).toHaveBeenCalledWith({ title: 'After' });
    expect(result.current.state).toBe('saved');
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });
    expect(save).toHaveBeenLastCalledWith(initialDraft);
  });

  it('queues an offline draft instead of losing it', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const save = vi.fn();
    const { result } = renderHook(() =>
      useTaskAutosave({
        enabled: true,
        taskId: 'task-1',
        dirty: true,
        draft: { title: 'Offline edit' },
        initialDraft,
        save,
        delay: 100,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(save).not.toHaveBeenCalled();
    expect(enqueueMutation).toHaveBeenCalledWith(
      'task',
      'task-1',
      'upsert',
      { title: 'Offline edit' },
      expect.any(String),
    );
    expect(result.current.state).toBe('queued');
  });
});
