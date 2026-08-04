import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Project, ProjectColumn, Task } from '@mindoist/shared/types';
import { ProjectWorkspace } from './ProjectWorkspace';

const hookMocks = vi.hoisted(() => ({
  createColumn: vi.fn(),
  updateColumn: vi.fn(),
  deleteColumn: vi.fn(),
  refetch: vi.fn(),
}));

const columns: ProjectColumn[] = [
  { id: 'c1', projectId: 'p1', name: 'Backlog', color: 'slate', isDone: false, sortOrder: 0, createdAt: '', updatedAt: '', deletedAt: null },
  { id: 'c2', projectId: 'p1', name: 'Done', color: 'jade', isDone: true, sortOrder: 1, createdAt: '', updatedAt: '', deletedAt: null },
];

vi.mock('../hooks/useApi', () => ({
  useProjectColumns: () => ({
    columns,
    loading: false,
    error: null,
    ...hookMocks,
  }),
}));

const project: Project = {
  id: 'p1',
  userId: 'u1',
  parentId: null,
  name: 'Product launch',
  color: 'ocean',
  type: 'PERSONAL',
  isArchived: false,
  calendarSyncEnabled: false,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  areaId: null,
};

function makeTask(id: string, title: string, projectColumnId: string | null): Task {
  return {
    id,
    userId: 'u1',
    projectId: 'p1',
    projectColumnId,
    sectionId: null,
    parentId: null,
    title,
    description: null,
    color: null,
    priority: 2,
    dueDate: null,
    dueTime: null,
    startDate: null,
    durationMin: null,
    rrule: null,
    pomodoroCount: 0,
    completedAt: null,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    recurrenceBasis: null,
    recurringResetMode: null,
    tagIds: [],
  };
}

describe('ProjectWorkspace', () => {
  const onMoveTask = vi.fn().mockResolvedValue(undefined);
  const onSelectTask = vi.fn();
  const onUpdateCalendarSync = vi.fn().mockResolvedValue(undefined);
  const tasks = [
    makeTask('t1', 'Plan launch', null),
    makeTask('t2', 'Publish release', 'c2'),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    hookMocks.createColumn.mockResolvedValue({});
    hookMocks.updateColumn.mockResolvedValue({});
    hookMocks.deleteColumn.mockResolvedValue(undefined);
    onMoveTask.mockResolvedValue(undefined);
    onUpdateCalendarSync.mockResolvedValue(undefined);
  });

  const renderWorkspace = () => render(
    <ProjectWorkspace
      project={project}
      tasks={tasks}
      loading={false}
      error={null}
      onRetry={vi.fn()}
      onSelectTask={onSelectTask}
      onMoveTask={onMoveTask}
      onUpdateCalendarSync={onUpdateCalendarSync}
      onDeleteProject={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  const showBoard = () => fireEvent.click(screen.getByRole('button', { name: 'Board' }));

  it('groups unassigned tasks into the first column and assigned tasks into their column', () => {
    renderWorkspace();
    showBoard();
    expect(within(screen.getByTestId('project-column-c1')).getByText('Plan launch')).toBeInTheDocument();
    expect(within(screen.getByTestId('project-column-c2')).getByText('Publish release')).toBeInTheDocument();
  });

  it('shows open tasks before completed ones in a column, regardless of input order', () => {
    const mixedTasks = [
      { ...makeTask('done1', 'Already done', 'c1'), completedAt: '2026-07-20T00:00:00Z' },
      makeTask('open1', 'Still open A', 'c1'),
      makeTask('open2', 'Still open B', 'c1'),
    ];
    render(
      <ProjectWorkspace
        project={project}
        tasks={mixedTasks}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTask={onSelectTask}
        onMoveTask={onMoveTask}
        onUpdateCalendarSync={onUpdateCalendarSync}
        onDeleteProject={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    showBoard();
    const titles = within(screen.getByTestId('project-column-c1'))
      .getAllByTestId(/^project-task-/)
      .map(card => card.textContent);
    expect(titles[0]).toContain('Still open A');
    expect(titles[1]).toContain('Still open B');
    expect(titles[2]).toContain('Already done');
  });

  it('moves a task with the keyboard-accessible destination select', async () => {
    renderWorkspace();
    const select = screen.getByRole('combobox', { name: 'Move Plan launch to another column' });
    fireEvent.click(select);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Done' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('option', { name: 'Done' }));
    await waitFor(() => expect(onMoveTask).toHaveBeenCalledWith(tasks[0], columns[1]));
  });

  it('moves a Kanban card from its compact overflow menu', async () => {
    renderWorkspace();
    showBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Move Plan launch to another column' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Done' }));
    await waitFor(() => expect(onMoveTask).toHaveBeenCalledWith(tasks[0], columns[1]));
  });

  it('shows a tag name and an overflow count on compact Kanban cards', () => {
    const taggedTask = { ...makeTask('tagged', 'Tagged card', 'c1'), tagIds: ['tag-1', 'tag-2'] };
    render(
      <ProjectWorkspace
        project={project}
        tasks={[taggedTask]}
        tags={[
          { id: 'tag-1', userId: 'u1', name: 'backend', color: null, createdAt: '', updatedAt: '', deletedAt: null },
          { id: 'tag-2', userId: 'u1', name: 'api', color: null, createdAt: '', updatedAt: '', deletedAt: null },
        ]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTask={onSelectTask}
        onMoveTask={onMoveTask}
        onUpdateCalendarSync={onUpdateCalendarSync}
        onDeleteProject={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    showBoard();
    expect(screen.getByTestId('project-task-tag-tagged')).toHaveTextContent('#backend');
    expect(screen.getByTestId('project-task-tag-tagged')).toHaveTextContent('+1');
  });

  it('switches between the Kanban board and compact list view', () => {
    renderWorkspace();
    expect(screen.getByTestId('project-list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByTestId('project-board')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.queryByTestId('project-board')).not.toBeInTheDocument();
    expect(screen.getByTestId('project-list')).toBeInTheDocument();
    expect(screen.getByText('Plan launch')).toBeInTheDocument();
  });

  it('enables Calendar sync only for the current project', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByTestId('project-calendar-sync'));
    await waitFor(() => expect(onUpdateCalendarSync).toHaveBeenCalledWith(project, true));
  });

  it('adds and renames columns with inline forms', async () => {
    renderWorkspace();
    showBoard();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add column' })[0]);
    fireEvent.change(screen.getByLabelText('New column'), { target: { value: 'Review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(hookMocks.createColumn).toHaveBeenCalledWith({ name: 'Review', color: 'slate', sortOrder: 2 }));

    fireEvent.click(screen.getByRole('button', { name: 'Rename Backlog' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Column name' }), { target: { value: 'Ideas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save column name' }));
    await waitFor(() => expect(hookMocks.updateColumn).toHaveBeenCalledWith('c1', { name: 'Ideas' }));
  });

  it('asks for an in-app confirmation before deleting a column', async () => {
    renderWorkspace();
    showBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Backlog' }));
    const confirmation = screen.getByText(/Delete “Backlog”/).closest('[role="alert"]');
    expect(confirmation).not.toBeNull();
    fireEvent.click(within(confirmation as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(hookMocks.deleteColumn).toHaveBeenCalledWith('c1'));
  });

  it('asks for an in-app confirmation before deleting the project', async () => {
    const onDeleteProject = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectWorkspace
        project={project}
        tasks={tasks}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTask={onSelectTask}
        onMoveTask={onMoveTask}
        onUpdateCalendarSync={onUpdateCalendarSync}
        onDeleteProject={onDeleteProject}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Delete “Product launch”/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(onDeleteProject).toHaveBeenCalledWith(project));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
