import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { TaskList } from './TaskList';
import type { Task } from '@mindoist/shared/types';
import type { SidebarView } from '../hooks/useApi';

const makeTask = (id: string, title: string, completedAt: string | null = null, overrides: Partial<Task> = {}): Task => ({
  id, userId: 'u1', projectId: null, projectColumnId: null, sectionId: null, parentId: null,
  title, description: null, color: null, priority: 0, dueDate: null, dueTime: null,
  startDate: null, durationMin: null, rrule: null, pomodoroCount: 0, completedAt, sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null,
  recurrenceBasis: null, recurringResetMode: null, tagIds: [],
  ...overrides,
});

describe('TaskList', () => {
  let onToggle: ReturnType<typeof vi.fn>;
  let onSelect: ReturnType<typeof vi.fn>;
  let onRetry: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onToggle = vi.fn();
    onSelect = vi.fn();
    onRetry = vi.fn();
  });

  const renderList = (
    tasks: Task[] = [],
    loading = false,
    error: string | null = null,
    view?: SidebarView,
    overrides: Partial<React.ComponentProps<typeof TaskList>> = {},
  ) =>
    render(
      <I18nextProvider i18n={i18n}>
        <TaskList
          tasks={tasks}
          loading={loading}
          error={error}
          onToggle={onToggle}
          onSelect={onSelect}
          onRetry={onRetry}
          view={view}
          {...overrides}
        />
      </I18nextProvider>
    );

  it('shows loading state', () => {
    renderList([], true);
    expect(screen.getByTestId('task-list-loading')).toBeInTheDocument();
  });

  it('shows empty message when no tasks', () => {
    renderList([]);
    expect(screen.getByTestId('empty-message')).toBeInTheDocument();
  });

  it('renders task titles', () => {
    renderList([makeTask('1', 'Buy milk'), makeTask('2', 'Write tests')]);
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
  });

  it('keeps My Day focused on overdue, today, and anytime tasks', () => {
    const now = new Date();
    const key = (offset: number) => {
      const value = new Date(now);
      value.setDate(value.getDate() + offset);
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    };
    renderList([
      makeTask('overdue', 'Overdue task', null, { dueDate: key(-1) }),
      makeTask('today', 'Today task', null, { dueDate: key(0) }),
      makeTask('anytime', 'Anytime task'),
      makeTask('active-range', 'Active range task', null, { startDate: key(0), dueDate: key(2) }),
      makeTask('future', 'Future task', null, { dueDate: key(2) }),
      makeTask('future-start', 'Future start task', null, { startDate: key(2) }),
    ], false, null, 'today');

    expect(screen.getByText('Overdue task')).toBeInTheDocument();
    expect(screen.getByText('Today task')).toBeInTheDocument();
    expect(screen.getByText('Anytime task')).toBeInTheDocument();
    expect(screen.getByText('Active range task')).toBeInTheDocument();
    expect(screen.queryByText('Future task')).not.toBeInTheDocument();
    expect(screen.queryByText('Future start task')).not.toBeInTheDocument();
  });

  it('calls onToggle when checkbox is clicked', () => {
    const task = makeTask('1', 'Buy milk');
    renderList([task]);
    fireEvent.click(screen.getByTestId('task-toggle-1'));
    expect(onToggle).toHaveBeenCalledWith(task);
  });

  it('calls onSelect when task title is clicked', () => {
    const task = makeTask('1', 'Buy milk');
    renderList([task]);
    fireEvent.click(screen.getByTestId('task-title-1'));
    expect(onSelect).toHaveBeenCalledWith(task);
  });

  it('strikes through completed tasks', () => {
    renderList([makeTask('1', 'Done task', '2026-01-01T00:00:00Z')]);
    const span = screen.getByTestId('task-title-1');
    expect(span.classList.contains('line-through')).toBe(true);
  });

  it('shows error banner with retry button', () => {
    renderList([], false, 'Network error');
    const banner = screen.getByTestId('error-banner');
    expect(banner).toHaveTextContent('Network error');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(screen.getByTestId('retry-btn')).toBeInTheDocument();
  });

  it('retry button calls onRetry', () => {
    renderList([], false, 'Network error');
    fireEvent.click(screen.getByTestId('retry-btn'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows repeat badge for tasks with rrule', () => {
    renderList([makeTask('1', 'Daily standup', null, { rrule: 'FREQ=DAILY' })]);
    const badge = screen.getByTestId('task-rrule-1');
    expect(badge).toBeInTheDocument();
  });

  it('completed view sorts tasks by completedAt descending', () => {
    const tasks = [
      makeTask('1', 'Older', '2026-07-18T08:00:00Z'),
      makeTask('2', 'Newer', '2026-07-19T10:00:00Z'),
      makeTask('3', 'Newest', '2026-07-20T12:00:00Z'),
    ];
    renderList(tasks, false, null, 'completed');
    const titles = screen.getAllByTestId(/^task-title-/);
    expect(titles[0]).toHaveTextContent('Newest');
    expect(titles[1]).toHaveTextContent('Newer');
    expect(titles[2]).toHaveTextContent('Older');
  });

  it('completed view groups tasks by calendar day', () => {
    const tasks = [
      makeTask('1', 'Task A', '2026-07-19T08:00:00Z'),
      makeTask('2', 'Task B', '2026-07-19T14:00:00Z'),
      makeTask('3', 'Task C', '2026-07-20T10:00:00Z'),
    ];
    renderList(tasks, false, null, 'completed');
    expect(screen.getByTestId('completed-group-2026-07-19')).toBeInTheDocument();
    expect(screen.getByTestId('completed-group-2026-07-20')).toBeInTheDocument();
  });

  it('renders metadata: due date', () => {
    // Far-future date so it never lands on a relative label like "Tomorrow".
    renderList([makeTask('1', 'Task with due', null, { dueDate: '2099-12-31T00:00:00.000Z' })]);
    expect(screen.getByTestId('task-due-1')).toHaveTextContent('2099-12-31');
    expect(screen.getByTestId('task-due-1')).not.toHaveTextContent('T00:00:00');
  });

  it('renders metadata: priority', () => {
    renderList([makeTask('1', 'High priority', null, { priority: 2 })]);
    expect(screen.getByTestId('task-priority-1')).toBeInTheDocument();
    expect(screen.getByTestId('task-priority-1')).toHaveTextContent('P2');
  });

  it('renders a tag name and collapses additional tags into a count', () => {
    renderList(
      [makeTask('1', 'Tagged task', null, { tagIds: ['tag-1', 'tag-2'] })],
      false,
      null,
      undefined,
      {
        tags: [
          { id: 'tag-1', userId: 'u1', name: 'backend', color: null, createdAt: '', updatedAt: '', deletedAt: null },
          { id: 'tag-2', userId: 'u1', name: 'api', color: null, createdAt: '', updatedAt: '', deletedAt: null },
        ],
      },
    );
    expect(screen.getByTestId('task-tag-1')).toHaveTextContent('#backend');
    expect(screen.getByTestId('task-tag-1')).toHaveTextContent('+1');
  });

  it('renders custom task color as a list-row accent', () => {
    renderList([makeTask('1', 'Colorful task', null, { color: 'rose' })]);
    const taskEl = screen.getByTestId('task-1');
    expect(taskEl.className).toContain('task-color-rose');
    expect(taskEl.className).toContain('bg-[var(--task-color-bg)]');
  });

  it('shows P1 metadata instead of hiding the highest priority', () => {
    renderList([makeTask('1', 'Highest priority', null, { priority: 1 })]);
    expect(screen.getByTestId('task-priority-1')).toHaveTextContent('P1');
  });

  it('selects visible tasks for bulk completion', () => {
    const tasks = [
      makeTask('1', 'Open one'),
      makeTask('2', 'Open two'),
      makeTask('3', 'Already done', '2026-07-20T08:00:00Z'),
    ];
    const onBulkComplete = vi.fn();

    renderList(tasks, false, null, 'all', { onBulkComplete });
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('task-select-1'));
    fireEvent.click(screen.getByTestId('bulk-select-visible'));

    expect(screen.getByTestId('bulk-selected-count')).toHaveTextContent('3 selected');
    fireEvent.click(screen.getByTestId('bulk-complete'));
    expect(onBulkComplete).toHaveBeenCalledWith([tasks[0], tasks[1]]);
  });

  it('bulk deletes the selected task rows', () => {
    const tasks = [makeTask('1', 'Keep'), makeTask('2', 'Delete me')];
    const onBulkDelete = vi.fn();

    renderList(tasks, false, null, 'all', { onBulkDelete });
    fireEvent.click(screen.getByTestId('task-select-2'));

    expect(screen.getByTestId('bulk-selected-count')).toHaveTextContent('1 selected');
    fireEvent.click(screen.getByTestId('bulk-delete'));
    expect(onBulkDelete).toHaveBeenCalledWith([tasks[1]]);
  });

  it('highlights a selected task that has no color with a background tint', () => {
    renderList([makeTask('1', 'Task')], false, null, 'inbox', { selectedTaskId: '1' });
    const taskEl = screen.getByTestId('task-1');
    expect(taskEl.className).toContain('bg-sidebar-accent/80');
    expect(taskEl.className).toContain('ring-1');
    expect(taskEl.className).not.toContain('before:bg-primary');
  });

  // Regression: `cn()` runs tailwind-merge, which treats bg-[var(--task-color-bg)]
  // and bg-sidebar-accent/80 as one conflict group and keeps only the last — so
  // selecting a colored task used to silently erase its tint. Selection on a
  // colored row must therefore be a ring, never a background.
  it('keeps the task color tint when a colored task is selected', () => {
    renderList([makeTask('1', 'Task', null, { color: 'indigo' })], false, null, 'inbox', { selectedTaskId: '1' });
    const taskEl = screen.getByTestId('task-1');
    expect(taskEl.className).toContain('task-color-indigo');
    expect(taskEl.className).toContain('bg-[var(--task-color-bg)]');
    expect(taskEl.className).not.toContain('bg-sidebar-accent');
    expect(taskEl.className).toContain('ring-2');
  });
});
