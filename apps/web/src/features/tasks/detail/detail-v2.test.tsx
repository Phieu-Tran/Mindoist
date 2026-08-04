import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateTaskRequest } from '@mindoist/shared/types';
import { TaskScheduleEditor } from './TaskScheduleEditor';
import { propertiesForSection } from './property-registry';
import { useTaskAutosave } from './use-task-autosave';

const enqueueMutation = vi.fn();

vi.mock('@/lib/sync/engine', () => ({
  enqueueMutation: (...args: unknown[]) => enqueueMutation(...args),
}));

describe('Task Detail v2 property composition', () => {
  it('keeps deadline and planned time as separate registered properties', () => {
    expect(propertiesForSection('schedule').map(property => property.id)).toEqual([
      'deadline',
      'plannedTime',
      'duration',
    ]);
  });

  it('shows deadline without planned time controls', () => {
    const onDeadlineDateChange = vi.fn();
    const onDeadlineTimeChange = vi.fn();
    render(
      <TaskScheduleEditor
        deadlineDate="2026-08-03"
        deadlineTime="17:30"
        onDeadlineDateChange={onDeadlineDateChange}
        onDeadlineTimeChange={onDeadlineTimeChange}
      />,
    );

    expect(screen.getByText('Deadline')).toBeInTheDocument();
    expect(screen.getByTestId('detail-deadline-v2')).toBeInTheDocument();
    expect(screen.getByTestId('detail-deadline-time-v2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Planned start')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
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
