import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import type { Task } from '@mindoist/shared/types';
import { CalendarDayCountdown } from './CalendarDayCountdown';

const NOW = new Date('2026-08-03T09:00:00');

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'task-1',
    title: 'A task',
    priority: 3,
    tagIds: [],
    ...overrides,
  } as Task;
}

function renderChip(tasks: Task[], date = NOW) {
  return render(
    <I18nextProvider i18n={i18n}>
      <CalendarDayCountdown date={date} tasks={tasks} />
    </I18nextProvider>,
  );
}

describe('CalendarDayCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('counts down to the next deadline still ahead on that day', () => {
    renderChip([
      task({ id: 'later', dueDate: '2026-08-03', dueTime: '17:00' }),
      task({ id: 'next', dueDate: '2026-08-03', dueTime: '11:30' }),
      task({ id: 'other-day', dueDate: '2026-08-04', dueTime: '09:30' }),
    ]);
    expect(screen.getByTestId('calendar-day-countdown-2026-08-03')).toHaveTextContent('Due in 2h 30m');
  });

  it('skips deadlines that already passed on that day', () => {
    renderChip([
      task({ id: 'passed', dueDate: '2026-08-03', dueTime: '07:00' }),
      task({ id: 'ahead', dueDate: '2026-08-03', dueTime: '10:00' }),
    ]);
    expect(screen.getByTestId('calendar-day-countdown-2026-08-03')).toHaveTextContent('Due in 1h 0m');
  });

  it('ignores completed tasks', () => {
    renderChip([
      task({ id: 'done', dueDate: '2026-08-03', dueTime: '11:30', completedAt: '2026-08-03T08:00:00Z' }),
    ]);
    expect(screen.queryByTestId('calendar-day-countdown-2026-08-03')).not.toBeInTheDocument();
  });

  it('renders nothing for a day with no deadline ahead', () => {
    renderChip([task({ id: 'none', dueDate: '2026-08-04', dueTime: '09:00' })]);
    expect(screen.queryByTestId('calendar-day-countdown-2026-08-03')).not.toBeInTheDocument();
  });

  it('treats a deadline without a time as end of day', () => {
    renderChip([task({ id: 'allday', dueDate: '2026-08-03' })]);
    expect(screen.getByTestId('calendar-day-countdown-2026-08-03')).toHaveTextContent('Due in 14h 59m');
  });

  it('reads the deadline object when present', () => {
    renderChip([
      task({ id: 'deadline', deadline: { date: '2026-08-03', time: '12:00' } as Task['deadline'] }),
    ]);
    expect(screen.getByTestId('calendar-day-countdown-2026-08-03')).toHaveTextContent('Due in 3h 0m');
  });
});
