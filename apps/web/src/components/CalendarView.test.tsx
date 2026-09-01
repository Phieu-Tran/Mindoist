import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import type { Task } from '@mindoist/shared/types';
import { CalendarView } from './CalendarView';

const getCalendarProjection = vi.fn();
const createTimeBlock = vi.fn();
const updateTimeBlock = vi.fn();
vi.mock('@/features/calendar/api', () => ({ getCalendarProjection: (...args: unknown[]) => getCalendarProjection(...args), createTimeBlock: (...args: unknown[]) => createTimeBlock(...args), updateTimeBlock: (...args: unknown[]) => updateTimeBlock(...args) }));

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', userId: 'user-1', projectId: null, projectColumnId: null, sectionId: null,
  parentId: null, title: 'Deep work', description: null, color: null, priority: 1,
  deadline: null, startDate: null, estimateMin: 60, rrule: null, recurringResetMode: null,
  recurrenceBasis: null, pomodoroCount: 0, completedAt: null, sortOrder: 0,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', deletedAt: null,
  tagIds: [], ...overrides,
});

describe('CalendarView custom engine', () => {
  const onCreateTask = vi.fn();
  const onSelectTask = vi.fn();
  const onUpdateTask = vi.fn();

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    window.history.replaceState({}, '', '/calendar?view=5day&date=2026-08-12&plan=false');
    getCalendarProjection.mockReset();
    getCalendarProjection.mockResolvedValue({ timeBlocks: [], deadlines: [], externalEvents: [] });
    onCreateTask.mockReset();
    onSelectTask.mockReset();
    onUpdateTask.mockReset();
  });

  const renderCalendar = (props: Partial<React.ComponentProps<typeof CalendarView>> = {}) => render(
    <I18nextProvider i18n={i18n}>
      <CalendarView tasks={[]} onSelectTask={onSelectTask} onCreateTask={onCreateTask} onUpdateTask={onUpdateTask} {...props} />
    </I18nextProvider>,
  );

  it('uses the custom engine and fixes the five-day view to Monday-Friday', async () => {
    renderCalendar();
    await waitFor(() => expect(getCalendarProjection).toHaveBeenCalled());
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(5);
    expect(document.querySelector('[data-calendar-engine="grid"]')).toBeTruthy();
  });

  it('renders month without FullCalendar', async () => {
    window.history.replaceState({}, '', '/calendar?view=month&date=2026-08-12&plan=false');
    renderCalendar();
    await waitFor(() => expect(getCalendarProjection).toHaveBeenCalled());
    expect(screen.getByRole('grid')).toHaveAccessibleName(/August 2026/i);
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
  });

  it('creates a named one-hour slot inline from the keyboard', async () => {
    window.history.replaceState({}, '', '/calendar?view=day&date=2026-08-12&plan=false');
    renderCalendar();
    const day = await screen.findByRole('gridcell');
    fireEvent.keyDown(day, { key: 'Enter' });
    const titleInput = screen.getByRole('textbox', { name: 'Task name' });
    fireEvent.change(titleInput, { target: { value: 'Write launch brief' } });
    fireEvent.submit(titleInput.closest('form')!);
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Write launch brief',
      date: '2026-08-12',
      startTime: '09:00',
      endTime: '10:00',
      allDay: false,
    })));
  });

  it('keeps the inline slot open and explains how to retry when creation fails', async () => {
    onCreateTask.mockRejectedValueOnce(new Error('offline'));
    window.history.replaceState({}, '', '/calendar?view=day&date=2026-08-12&plan=false');
    renderCalendar();
    fireEvent.keyDown(await screen.findByRole('gridcell'), { key: 'Enter' });
    const titleInput = screen.getByRole('textbox', { name: 'Task name' });
    fireEvent.change(titleInput, { target: { value: 'Retry this block' } });
    fireEvent.submit(titleInput.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection and try again');
    expect(titleInput).toBeEnabled();
  });

  it('shows plan capacity and unfinished overdue tasks', async () => {
    window.history.replaceState({}, '', '/calendar?view=day&date=2026-08-12&plan=true');
    const todayTask = makeTask({ id: 'today', title: 'Today work', estimateMin: 180 });
    const overdue = makeTask({ id: 'overdue', title: 'Renew certificate', deadline: { date: '2000-07-29' } });
    renderCalendar({ tasks: [overdue], todayTasks: [todayTask], workHoursPerDay: 6 });
    expect(screen.getByText('Time blocked').parentElement).toHaveTextContent('0h / 6h');
    expect(screen.getByText('3:00')).toBeInTheDocument();
    const overdueSection = screen.getByTestId('calendar-overdue-section');
    expect(within(overdueSection).getByText('Renew certificate')).toBeInTheDocument();
  });

  it('deep-links view, date and panel state through validated search values', async () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId('calendar-view-switch'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Month'));
    await waitFor(() => expect(window.location.search).toContain('view=month'));
    expect(window.location.search).toContain('date=2026-08-12');
    expect(window.location.search).toContain('plan=false');
  });
});
