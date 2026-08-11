import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import type { Task } from '@mindoist/shared/types';
import { SummaryCalendar } from './SummaryCalendar';

const makeTask = (id: string, title: string, dueDate: string, overrides: Partial<Task> = {}): Task => ({
  id,
  userId: 'u1',
  projectId: null,
  projectColumnId: null,
  sectionId: null,
  parentId: null,
  title,
  description: null,
  color: null,
  priority: 4,
  dueDate,
  dueTime: null,
  startDate: null,
  durationMin: null,
  rrule: null,
  pomodoroCount: 0,
  completedAt: null,
  sortOrder: 0,
  createdAt: '2026-07-20T08:00:00Z',
  updatedAt: '2026-07-20T08:00:00Z',
  deletedAt: null,
  recurrenceBasis: null, recurringResetMode: null, tagIds: [],
  ...overrides,
});

describe('SummaryCalendar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00'));
  });

  afterEach(() => vi.useRealTimers());

  const renderCalendar = (onSelectTask = vi.fn()) => render(
    <I18nextProvider i18n={i18n}>
      <SummaryCalendar
        tasks={[
          makeTask('1', 'Today task', '2026-07-20', { priority: 1, dueTime: '09:00' }),
          makeTask('2', 'Tomorrow task', '2026-07-21T00:00:00.000Z', { priority: 2 }),
        ]}
        onSelectTask={onSelectTask}
      />
    </I18nextProvider>,
  );

  it('shows tasks for today by default and changes the agenda when a date is selected', () => {
    renderCalendar();
    expect(screen.getByTestId('summary-day-tasks')).toHaveTextContent('Today task');
    expect(screen.getByTestId('summary-day-tasks')).not.toHaveTextContent('Tomorrow task');

    fireEvent.click(screen.getByTestId('summary-calendar-day-2026-07-21'));
    expect(screen.getByTestId('summary-day-tasks')).toHaveTextContent('Tomorrow task');
    expect(screen.getByTestId('summary-day-tasks')).not.toHaveTextContent('Today task');
  });

  it('opens the selected task from the daily agenda', () => {
    const onSelectTask = vi.fn();
    renderCalendar(onSelectTask);
    fireEvent.click(screen.getByRole('button', { name: /Today task/ }));
    expect(onSelectTask).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('dims the day-cell dot for a completed task instead of hiding it', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SummaryCalendar
          tasks={[
            makeTask('1', 'Done task', '2026-07-20', { priority: 1, completedAt: '2026-07-20T10:00:00Z' }),
          ]}
        />
      </I18nextProvider>,
    );
    const dot = document.querySelector('[data-testid="summary-calendar-day-2026-07-20"] .summary-calendar-dots span');
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass('summary-dot-completed');
  });

  it('navigates months and returns to today', () => {
    renderCalendar();
    expect(screen.getByTestId('summary-calendar-month')).toHaveTextContent('July 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByTestId('summary-calendar-month')).toHaveTextContent('August 2026');
    expect(screen.getByTestId('summary-day-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByTestId('summary-calendar-month')).toHaveTextContent('July 2026');
  });
});
