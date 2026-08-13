import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { Sidebar } from './Sidebar';
import type { SidebarView } from '../hooks/useApi';

describe('Sidebar', () => {
  let current: SidebarView;
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    current = 'inbox';
    onSelect = vi.fn();
  });

  const renderSidebar = (overrides?: { projects?: any[]; tags?: any[]; counts?: any; onCreateProject?: (request: any) => Promise<void>; onCreateTag?: (name: string) => Promise<any>; onMoveProject?: (projectId: string, parentId?: string) => Promise<void>; isAdmin?: boolean }) =>
    render(
      <I18nextProvider i18n={i18n}>
        <Sidebar
          current={current}
          counts={overrides?.counts ?? { inbox: 3, today: 1, next7: 5, overdue: 2, completed: 4 }}
          projects={overrides?.projects ?? []}
          tags={overrides?.tags}
          onSelect={onSelect}
          onCreateProject={overrides?.onCreateProject}
          onCreateTag={overrides?.onCreateTag}
          onMoveProject={overrides?.onMoveProject}
          isAdmin={overrides?.isAdmin}
        />
      </I18nextProvider>
    );

  it('shows the administrator console only to administrators', () => {
    const { rerender } = renderSidebar();
    expect(screen.queryByTestId('sidebar-admin')).not.toBeInTheDocument();

    rerender(
      <I18nextProvider i18n={i18n}>
        <Sidebar
          current="inbox"
          counts={{ inbox: 3, today: 1, next7: 5, overdue: 2, completed: 4 }}
          projects={[]}
          onSelect={onSelect}
          isAdmin
        />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('sidebar-admin')).toBeInTheDocument();
  });

  it('renders the five primary destinations and keeps settings in the footer', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-today')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-countdown')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-projects')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-summary')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-completed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-trashed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-import')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-export')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-next7')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-overdue')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-projects-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-tags-toggle')).toBeInTheDocument();
  });

  it('opens global task capture from the persistent add-task button', () => {
    const listener = vi.fn();
    window.addEventListener('mindoist:global-capture', listener);
    try {
      renderSidebar();
      fireEvent.click(screen.getByTestId('sidebar-add-task'));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('mindoist:global-capture', listener);
    }
  });

  it('lists tags, filters by the selected tag, and creates a new tag inline', async () => {
    const onCreateTag = vi.fn().mockResolvedValue({
      id: 'tag-new', userId: 'u1', name: 'Planning', color: '#22c55e', createdAt: '', updatedAt: '', deletedAt: null,
    });
    renderSidebar({
      tags: [{ id: 'tag-research', userId: 'u1', name: 'Research', color: null, createdAt: '', updatedAt: '', deletedAt: null }],
      onCreateTag,
    });

    fireEvent.click(screen.getByTestId('sidebar-tag-tag-research'));
    expect(onSelect).toHaveBeenCalledWith('tags', undefined, 'tag-research');

    fireEvent.click(screen.getByTestId('sidebar-add-tag'));
    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Planning' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add tag' }).at(-1)!);

    await waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Planning'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('tags', undefined, 'tag-new'));
  });

  it('calls onSelect with view name when a nav item is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByTestId('sidebar-today'));
    expect(onSelect).toHaveBeenCalledWith('today');
  });

  it('shows counts next to nav items', () => {
    renderSidebar();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('highlights the currently selected item', () => {
    current = 'today';
    renderSidebar();
    const btn = screen.getByTestId('sidebar-today');
    expect(btn.classList.contains('font-semibold')).toBe(true);
  });

  it('renders project list when projects provided', () => {
    renderSidebar({
      projects: [
        { id: 'p1', name: 'Personal', color: 'indigo' },
        { id: 'p2', name: 'Work', color: 'red' },
      ],
    });
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('calls onSelect with projectId when a project is clicked', () => {
    renderSidebar({
      projects: [{ id: 'p1', name: 'Personal', color: 'indigo' }],
    });
    fireEvent.click(screen.getByTestId('sidebar-project-p1'));
    expect(onSelect).toHaveBeenCalledWith('projects', 'p1');
  });

  it('renders sub-projects and creates a child from the template dialog', async () => {
    const onCreateProject = vi.fn().mockResolvedValue(undefined);
    renderSidebar({
      projects: [
        { id: 'p1', parentId: null, name: 'Work', color: 'indigo' },
        { id: 'p2', parentId: 'p1', name: 'Launch', color: 'ocean' },
      ],
      onCreateProject,
    });

    expect(screen.getByText('Launch')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sidebar-add-subproject-p1'));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Website' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledWith({
      name: 'Website',
      type: 'PERSONAL',
      color: 'indigo',
      parentId: 'p1',
      customColumns: undefined,
      areaId: null,
    }));
    await waitFor(() => expect(screen.queryByTestId('create-project-dialog')).not.toBeInTheDocument());
  });

  it('reparents a project by dragging it onto another project', async () => {
    const onMoveProject = vi.fn().mockResolvedValue(undefined);
    renderSidebar({
      projects: [
        { id: 'p1', parentId: null, name: 'Work', color: 'indigo', type: 'JOB' },
        { id: 'p2', parentId: null, name: 'Personal', color: 'jade', type: 'PERSONAL' },
      ],
      onMoveProject,
    });
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };
    fireEvent.dragStart(screen.getByTestId('sidebar-project-p2'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('sidebar-project-p1'));
    fireEvent.drop(screen.getByTestId('sidebar-project-p1'));
    await waitFor(() => expect(onMoveProject).toHaveBeenCalledWith('p2', 'p1'));
  });

  it('renders correct labels in English', () => {
    renderSidebar();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Countdown')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders correct labels in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    renderSidebar();
    expect(screen.getByText('Hôm nay')).toBeInTheDocument();
    expect(screen.getByText('Lịch')).toBeInTheDocument();
    expect(screen.getByText('Đếm ngày')).toBeInTheDocument();
    expect(screen.getByText('Tổng kết')).toBeInTheDocument();
    expect(screen.getAllByText('Dự án').length).toBeGreaterThan(0);
    expect(screen.getByText('Thẻ')).toBeInTheDocument();
    expect(screen.getByText('Cài đặt')).toBeInTheDocument();
  });
});
