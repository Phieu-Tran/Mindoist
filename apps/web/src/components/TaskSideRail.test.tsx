import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Task } from '@mindoist/shared/types';
import { TaskSideRail } from './TaskSideRail';

const makeTask = (id: string, title: string, overrides: Partial<Task> = {}): Task => ({
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
  dueDate: null,
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

const projects: Project[] = [{
  id: 'p1',
  userId: 'u1',
  parentId: null,
  name: 'Work',
  color: 'ocean',
  type: 'PERSONAL',
  isArchived: false,
  calendarSyncEnabled: false,
  sortOrder: 0,
  createdAt: '2026-07-20T08:00:00Z',
  updatedAt: '2026-07-20T08:00:00Z',
  deletedAt: null,
  areaId: null,
}];

describe('TaskSideRail', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00'));
  });

  afterEach(() => vi.useRealTimers());

  const renderRail = (tasks: Task[], selectedTask: Task | null, onSelectTask = vi.fn()) => {
    const result = render(
      <I18nextProvider i18n={i18n}>
        <TaskSideRail
          tasks={tasks}
          selectedTask={selectedTask}
          projects={projects}
          tags={[]}
          onSave={vi.fn()}
          onCompletePomodoro={vi.fn()}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onSelectTask={onSelectTask}
        />
      </I18nextProvider>,
    );
    return { ...result, onSelectTask };
  };

  it('stacks selected task details above a compact calendar strip', async () => {
    const selectedTask = makeTask('1', 'Implement Task CRUD API', {
      dueDate: '2026-07-22T00:00:00.000Z',
      dueTime: '11:00',
      projectId: 'p1',
      color: 'sky',
    });
    renderRail([selectedTask], selectedTask);
    await act(async () => {
      await import('./TaskDetail');
    });

    const rail = screen.getByTestId('task-side-rail');
    expect(rail).toContainElement(screen.getByTestId('task-detail'));
    expect(rail).toContainElement(screen.getByTestId('rail-calendar'));
    expect(screen.getByTestId('rail-calendar-compact')).toBeInTheDocument();
    expect(screen.getByTestId('detail-title')).toHaveValue('Implement Task CRUD API');
    expect(screen.getByTestId('rail-calendar-month')).toHaveTextContent('July 2026');
    expect(screen.queryByTestId('rail-calendar-day-2026-07-22')).not.toBeInTheDocument();
  });

  it('does not reserve an empty detail rail when no task is selected', () => {
    const agendaTask = makeTask('2', 'Design review', {
      dueDate: '2026-07-20T00:00:00.000Z',
      dueTime: '14:00',
      color: 'rose',
    });
    renderRail([agendaTask], null);

    expect(screen.queryByTestId('task-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-side-rail')).not.toBeInTheDocument();
  });
});
