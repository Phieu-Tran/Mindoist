import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import type { Task } from '@mindoist/shared/types';
import { canonicalTaskOverrides, type LegacyTaskOverrides } from '../test/task-fixture';
import { SummaryCalendar } from './SummaryCalendar';
import type { ObsidianSettings } from '@/lib/obsidian-settings';

const obsidianSettings: ObsidianSettings = {
  vault: 'Hiếu - Personal',
  folder: '03_Project/Mindoist',
  filenameTemplate: 'Tổng kết Mindoist {{yyyy-MM}}',
  weeklyFilenameTemplate: 'Tổng kết tuần {{weekStart}}',
};

const makeTask = (id: string, title: string, dueDate: string, overrides: LegacyTaskOverrides = {}): Task => ({
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
  deadline: { date: dueDate },
  startDate: null,
  estimateMin: null,
  rrule: null,
  pomodoroCount: 0,
  completedAt: null,
  sortOrder: 0,
  createdAt: '2026-07-20T08:00:00Z',
  updatedAt: '2026-07-20T08:00:00Z',
  deletedAt: null,
  recurrenceBasis: null, recurringResetMode: null, tagIds: [],
  ...canonicalTaskOverrides({ dueDate, ...overrides }),
});

describe('SummaryCalendar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00'));
  });

  afterEach(() => vi.useRealTimers());

  const renderCalendar = (
    onSelectTask = vi.fn(),
    settings: ObsidianSettings | null = obsidianSettings,
    onConfigureObsidian = vi.fn(),
  ) => render(
    <I18nextProvider i18n={i18n}>
      <SummaryCalendar
        tasks={[
          makeTask('1', 'Today task', '2026-07-20', { priority: 1, dueTime: '09:00', projectId: 'p1', projectColumnId: 'c1', tagIds: ['t1'] }),
          makeTask('2', 'Tomorrow task', '2026-07-21T00:00:00.000Z', { priority: 2 }),
        ]}
        projects={[{ id: 'p1', userId: 'u1', parentId: null, areaId: null, name: 'Personal', color: null, type: 'PERSONAL', isArchived: false, calendarSyncEnabled: false, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null }]}
        projectColumns={[{ id: 'c1', projectId: 'p1', name: 'Doing', color: 'ocean', isDone: false, sortOrder: 1, createdAt: '', updatedAt: '', deletedAt: null }]}
        tags={[{ id: 't1', userId: 'u1', name: 'urgent', color: null, createdAt: '', updatedAt: '', deletedAt: null }]}
        onSelectTask={onSelectTask}
        obsidianSettings={settings ?? undefined}
        onConfigureObsidian={onConfigureObsidian}
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

  it('switches to a unique monthly task ledger and opens tasks without changing its own view', () => {
    const onSelectTask = vi.fn();
    renderCalendar(onSelectTask);

    fireEvent.click(screen.getByTestId('summary-view-list'));

    expect(screen.getByTestId('summary-monthly-list')).toBeInTheDocument();
    expect(screen.getByTestId('summary-month-total')).toHaveTextContent('2');
    expect(screen.getByTestId('summary-month-open')).toHaveTextContent('2');
    expect(screen.getByText('Today task')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Tomorrow task' }));
    expect(onSelectTask).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
    expect(screen.getByTestId('summary-monthly-list')).toBeInTheDocument();
  });

  it('reviews Monday through Sunday and navigates one week at a time', () => {
    renderCalendar();

    fireEvent.click(screen.getByTestId('summary-view-week'));
    expect(screen.getByTestId('summary-weekly-list')).toBeInTheDocument();
    expect(screen.getByTestId('summary-week-total')).toHaveTextContent('2');
    expect(screen.getByTestId('summary-week-range')).toHaveTextContent(/Jul 20.*Jul 26, 2026/);

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByTestId('summary-week-empty')).toHaveTextContent('No task activity in this week');

    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByTestId('summary-week-total')).toHaveTextContent('2');
  });

  it('previews the exact weekly Obsidian template and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderCalendar();

    fireEvent.click(screen.getByTestId('summary-view-week'));
    fireEvent.click(screen.getByTestId('summary-preview-markdown'));

    const preview = screen.getByTestId('summary-markdown-preview');
    expect(preview).toHaveTextContent('type: mindoist-weekly-review');
    expect(preview).toHaveTextContent('week_start: 2026-07-20');
    expect(preview).toHaveTextContent('- [ ] Today task');
    expect(preview).toHaveTextContent('Personal · Doing · #urgent · P1');

    await act(async () => {
      fireEvent.click(screen.getByTestId('summary-copy-markdown'));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('period: week'));
    expect(screen.getByRole('status')).toHaveTextContent('Markdown copied.');

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
  });

  it('creates an Obsidian-ready Markdown note without requiring a plugin', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    let openedHref = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureHref(this: HTMLAnchorElement) {
      openedHref = this.href;
    });

    renderCalendar();
    fireEvent.click(screen.getByTestId('summary-view-list'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('summary-open-obsidian'));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('# Mindoist monthly review — July 2026'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('- [ ] Today task'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Personal · Doing · #urgent · P1'));
    expect(openedHref).toContain(
      'obsidian://new?vault=Hi%E1%BA%BFu%20-%20Personal&file=03_Project%2FMindoist%2FT%E1%BB%95ng%20k%E1%BA%BFt%20Mindoist%202026-07.md&clipboard',
    );
    expect(screen.getByRole('status')).toHaveTextContent('The Markdown is ready and Obsidian is opening.');

    clickSpy.mockRestore();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
  });

  it('opens Obsidian settings instead of guessing a local vault', () => {
    const onConfigureObsidian = vi.fn();
    renderCalendar(vi.fn(), null, onConfigureObsidian);
    fireEvent.click(screen.getByTestId('summary-view-list'));

    expect(screen.getByTestId('summary-open-obsidian')).toHaveTextContent('Configure Obsidian');
    expect(screen.getByText(/Choose your local vault/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('summary-open-obsidian'));

    expect(onConfigureObsidian).toHaveBeenCalledOnce();
  });
});
