import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import type { Task } from '@mindoist/shared/types';
import {
  PomodoroTimer,
  DEFAULT_WORK_MINUTES,
  pomodoroStorageKey,
} from './PomodoroTimer';

const makeTask = (pomodoroCount: number): Task => ({
  id: 'task-1',
  userId: 'user-1',
  projectId: null,
  projectColumnId: null,
  sectionId: null,
  parentId: null,
  title: 'Focus task',
  description: null,
  color: null,
  priority: 3,
  dueDate: null,
  dueTime: null,
  startDate: null,
  durationMin: null,
  rrule: null,
  pomodoroCount,
  completedAt: null,
  sortOrder: 0,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  deletedAt: null,
  recurrenceBasis: null,
  recurringResetMode: null,
  tagIds: [],
});

describe('PomodoroTimer', () => {
  let onComplete: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T08:00:00.000Z'));
    window.localStorage.clear();
    await i18n.changeLanguage('en');
    onComplete = vi.fn().mockResolvedValue(makeTask(1));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderTimer = (taskId = 'task-1', initialCount = 0) => render(
    <I18nextProvider i18n={i18n}>
      <PomodoroTimer taskId={taskId} initialCount={initialCount} onComplete={onComplete} />
    </I18nextProvider>,
  );

  it('starts counting down from 25:00', () => {
    renderTimer();
    expect(screen.getByTestId('pomodoro-time')).toHaveTextContent('25:00');

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByTestId('pomodoro-time')).toHaveTextContent('24:59');
    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-status', 'running');
  });

  it('pauses without losing the remaining time', () => {
    renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const pausedTime = screen.getByTestId('pomodoro-time').textContent;

    act(() => vi.advanceTimersByTime(5000));

    expect(screen.getByTestId('pomodoro-time')).toHaveTextContent(pausedTime!);
    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-status', 'paused');
  });

  it('resets to an idle 25:00 work session', () => {
    renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByTestId('pomodoro-time')).toHaveTextContent('25:00');
    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-phase', 'work');
    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-status', 'idle');
  });

  it('records a completed work session and starts a five-minute break', async () => {
    renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_WORK_MINUTES * 60 * 1000);
    });

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith('task-1');
    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-phase', 'break');
    expect(screen.getByTestId('pomodoro-time')).toHaveTextContent('05:00');
    expect(screen.getByText('1 sessions')).toBeInTheDocument();
  });

  it('restores the paused state for the matching task only', () => {
    window.localStorage.setItem(pomodoroStorageKey('task-1'), JSON.stringify({
      phase: 'work',
      status: 'paused',
      remainingSeconds: 321,
      endTime: null,
    }));
    window.localStorage.setItem(pomodoroStorageKey('task-2'), JSON.stringify({
      phase: 'break',
      status: 'paused',
      remainingSeconds: 42,
      endTime: null,
    }));

    renderTimer('task-1');

    expect(screen.getByTestId('pomodoro-time')).toHaveTextContent('05:21');
    expect(screen.getByTestId('pomodoro-timer')).toHaveAttribute('data-phase', 'work');
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});
