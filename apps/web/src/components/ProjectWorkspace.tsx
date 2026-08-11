import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarSync, Check, CheckCircle2, GripVertical, LayoutDashboard, List, MoreHorizontal, Pencil, Plus, RotateCcw, Tag as TagIcon, Trash2, X } from 'lucide-react';
import type { Project, ProjectColumn, Tag as TagType, Task } from '@mindoist/shared/types';
import { useProjectColumns } from '../hooks/useApi';
import { cn } from '@/lib/utils';
import { projectColorClass } from '@/lib/project-colors';
import { DueCountdown } from './DueCountdown';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { useDialogA11y } from './ui/dialog';
import './ProjectWorkspace.css';

interface Props {
  project: Project;
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectTask: (task: Task) => void;
  onMoveTask: (task: Task, column: ProjectColumn) => Promise<void>;
  onUpdateCalendarSync: (project: Project, enabled: boolean) => Promise<void>;
  onDeleteProject: (project: Project) => Promise<void>;
  tags?: TagType[];
}

export function ProjectWorkspace({
  project,
  tasks,
  loading,
  error,
  onRetry,
  onSelectTask,
  onMoveTask,
  onUpdateCalendarSync,
  onDeleteProject,
  tags = [],
}: Props) {
  const { t } = useTranslation('tasks');
  const {
    columns,
    loading: columnsLoading,
    error: columnsError,
    createColumn,
    updateColumn,
    deleteColumn,
    refetch: refetchColumns,
  } = useProjectColumns(project.id);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dragPreviewOrder, setDragPreviewOrder] = useState<string[] | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('slate');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [calendarSyncSaving, setCalendarSyncSaving] = useState(false);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const tagMap = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags]);
  const topLevelTasks = useMemo(() => tasks.filter(task => !task.parentId), [tasks]);
  const taskMap = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const columnMap = useMemo(() => new Map(columns.map(column => [column.id, column])), [columns]);
  const columnOptions = useMemo(
    () => columns.map(column => ({ value: column.id, label: column.name })),
    [columns],
  );
  const deleteProjectDialogRef = useDialogA11y<HTMLDivElement>({
    open: showDeleteProjectConfirm,
    onClose: () => {
      if (!deletingProject) setShowDeleteProjectConfirm(false);
    },
    closeOnEscape: !deletingProject,
  });
  const [viewMode, setViewMode] = useState<'board' | 'list'>(() => localStorage.getItem(`mindoist:project-view:${project.id}`) === 'board' ? 'board' : 'list');
  const changeViewMode = (mode: 'board' | 'list') => {
    setViewMode(mode);
    setOpenTaskMenuId(null);
    localStorage.setItem(`mindoist:project-view:${project.id}`, mode);
  };

  useEffect(() => {
    if (!openTaskMenuId) return;
    const handlePointerDown = (event: MouseEvent) => {
      const menu = (event.target as HTMLElement).closest('[data-project-task-menu]');
      if (menu?.getAttribute('data-project-task-menu') !== openTaskMenuId) setOpenTaskMenuId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenTaskMenuId(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openTaskMenuId]);

  const displayColumns = useMemo(() => {
    if (!dragPreviewOrder) return columns;
    const byId = new Map(columns.map(column => [column.id, column]));
    return dragPreviewOrder.map(id => byId.get(id)).filter((column): column is ProjectColumn => Boolean(column));
  }, [columns, dragPreviewOrder]);

  const tasksByColumn = useMemo(() => {
    const grouped = new Map(columns.map(column => [column.id, [] as Task[]]));
    if (!columns.length) return grouped;
    for (const task of tasks) {
      if (task.parentId) continue;
      const destination = task.projectColumnId && grouped.has(task.projectColumnId)
        ? task.projectColumnId
        : columns[0].id;
      grouped.get(destination)?.push(task);
    }
    // Open tasks first, completed ones pushed after - within each group the
    // existing (sortOrder-driven) order is preserved since Array#sort is
    // stable, so drag-and-drop reordering still behaves as expected.
    grouped.forEach(columnTasks => columnTasks.sort((a, b) => (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0)));
    return grouped;
  }, [columns, tasks]);

  const moveTask = async (task: Task, column: ProjectColumn) => {
    if (task.projectColumnId === column.id) return;
    setActionError('');
    try {
      await onMoveTask(task, column);
    } catch (moveError) {
      setActionError(moveError instanceof Error ? moveError.message : t('workspace.moveError'));
    }
  };

  const handleDrop = async (column: ProjectColumn) => {
    const task = draggedTaskId ? taskMap.get(draggedTaskId) : undefined;
    setDraggedTaskId(null);
    setDragOverColumnId(null);
    if (task) await moveTask(task, column);
  };

  const saveColumnName = async (column: ProjectColumn) => {
    const name = editingName.trim();
    if (!name || name === column.name) {
      setEditingColumnId(null);
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      await updateColumn(column.id, { name });
      setEditingColumnId(null);
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : t('workspace.columnError'));
    } finally {
      setBusy(false);
    }
  };

  const addColumn = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newColumnName.trim();
    if (!name) return;
    setBusy(true);
    setActionError('');
    try {
      await createColumn({ name, color: newColumnColor, sortOrder: columns.length });
      setNewColumnName('');
      setNewColumnColor('slate');
      setAddColumnOpen(false);
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : t('workspace.columnError'));
    } finally {
      setBusy(false);
    }
  };

  const removeColumn = async (columnId: string) => {
    setBusy(true);
    setActionError('');
    try {
      await deleteColumn(columnId);
      setDeleteColumnId(null);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : t('workspace.deleteError'));
    } finally {
      setBusy(false);
    }
  };

  const persistColumnOrder = async (order: string[]) => {
    const currentOrder = columns.map(c => c.id);
    if (order.length === currentOrder.length && order.every((id, idx) => id === currentOrder[idx])) return;
    setBusy(true);
    setActionError('');
    try {
      await Promise.all(
        order.map((id, idx) => updateColumn(id, { sortOrder: idx })),
      );
    } catch (reorderError) {
      setActionError(reorderError instanceof Error ? reorderError.message : t('workspace.columnError'));
    } finally {
      setBusy(false);
    }
  };

  const handleColumnDragStart = (columnId: string, event: React.DragEvent) => {
    setDraggedColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-column-drag', columnId);
  };

  const handleSectionDragOver = (column: ProjectColumn, event: React.DragEvent) => {
    event.preventDefault();
    setDragOverColumnId(column.id);
    if (draggedColumnId && draggedColumnId !== column.id) {
      // Live-reorder the board as the pointer crosses column boundaries —
      // matches the "does the column actually move while dragging" feedback
      // instead of only snapping into place on drop.
      setDragPreviewOrder(prev => {
        const base = prev ?? columns.map(c => c.id);
        const from = base.indexOf(draggedColumnId);
        const to = base.indexOf(column.id);
        if (from === -1 || to === -1 || from === to) return prev;
        const next = [...base];
        next.splice(from, 1);
        next.splice(to, 0, draggedColumnId);
        return next;
      });
    }
  };

  const handleSectionDrop = (column: ProjectColumn, event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes('application/x-column-drag')) {
      const finalOrder = dragPreviewOrder ?? columns.map(c => c.id);
      setDraggedColumnId(null);
      setDragOverColumnId(null);
      setDragPreviewOrder(null);
      void persistColumnOrder(finalOrder);
    } else {
      void handleDrop(column);
    }
  };

  const handleColumnDragEnd = () => {
    setDraggedColumnId(null);
    setDragOverColumnId(null);
    setDragPreviewOrder(null);
  };

  const handleDeleteProject = async () => {
    setDeletingProject(true);
    try {
      await onDeleteProject(project);
      setShowDeleteProjectConfirm(false);
    } catch {
      setActionError(t('workspace.deleteProjectError'));
    } finally {
      setDeletingProject(false);
    }
  };

  const handleToggleCalendarSync = async () => {
    setCalendarSyncSaving(true);
    setActionError('');
    try {
      await onUpdateCalendarSync(project, !project.calendarSyncEnabled);
    } catch {
      setActionError(t('workspace.calendarSyncError', { defaultValue: 'Unable to update calendar sync' }));
    } finally {
      setCalendarSyncSaving(false);
    }
  };

  if (loading || columnsLoading) {
    return <ProjectWorkspaceSkeleton label={t('workspace.loading')} />;
  }

  if (error || columnsError) {
    return (
      <div className="project-workspace-state" role="alert">
        <p>{error || columnsError}</p>
        <button type="button" onClick={() => { onRetry(); refetchColumns(); }}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('list.retry')}
        </button>
      </div>
    );
  }

  return (
    <section className="project-workspace" aria-labelledby="project-workspace-title">
      <header className="project-workspace-header">
        <div className="project-workspace-heading min-w-0">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', projectColorClass(project.color))} aria-hidden="true" />
          <h2 id="project-workspace-title">{project.name}</h2>
          <span className="project-workspace-task-count">{t('workspace.subtitle', { count: tasks.length })}</span>
        </div>
        <div className="project-workspace-header-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={calendarSyncSaving}
            data-testid="project-calendar-sync"
            aria-pressed={project.calendarSyncEnabled}
            aria-label={project.calendarSyncEnabled
              ? t('workspace.calendarSyncOn', { defaultValue: 'Calendar sync on' })
              : t('workspace.calendarSyncOff', { defaultValue: 'Calendar sync off' })}
            onClick={() => { void handleToggleCalendarSync(); }}
            className={cn('h-8 gap-1.5', project.calendarSyncEnabled && 'border-primary/40 bg-primary/10 text-primary')}
          >
            <CalendarSync className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">
              {project.calendarSyncEnabled
                ? t('workspace.calendarSyncOn', { defaultValue: 'Calendar sync on' })
                : t('workspace.calendarSyncOff', { defaultValue: 'Calendar sync off' })}
            </span>
          </Button>
          <div className="project-workspace-view-switch" role="group" aria-label={t('workspace.viewMode')}>
            <button type="button" className={cn(viewMode === 'board' && 'is-active')} onClick={() => changeViewMode('board')} aria-pressed={viewMode === 'board'}>
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
              {t('workspace.board')}
            </button>
            <button type="button" className={cn(viewMode === 'list' && 'is-active')} onClick={() => changeViewMode('list')} aria-pressed={viewMode === 'list'}>
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              {t('workspace.list')}
            </button>
          </div>
          <button type="button" className="project-workspace-add-column" onClick={() => setAddColumnOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('workspace.addColumn')}
          </button>
          <button
            type="button"
            className="project-workspace-delete"
            data-testid="project-workspace-delete"
            onClick={() => setShowDeleteProjectConfirm(true)}
            aria-label={t('workspace.deleteProject')}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {showDeleteProjectConfirm && (
        <div
          className="frosted-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => !deletingProject && setShowDeleteProjectConfirm(false)}
        >
          <div
            ref={deleteProjectDialogRef}
            className="frosted-surface bg-card rounded-xl border border-border p-6 w-[90vw] max-w-sm shadow-lg"
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-project-confirm-title"
            aria-describedby="delete-project-confirm-description"
          >
            <h3 id="delete-project-confirm-title" className="font-semibold text-base mb-2">{t('workspace.deleteProject')}</h3>
            <p id="delete-project-confirm-description" className="text-sm text-muted-foreground mb-4">
              {t('workspace.deleteProjectConfirm', { name: project.name })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" disabled={deletingProject} onClick={() => setShowDeleteProjectConfirm(false)}>
                {t('workspace.cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="project-workspace-delete-confirm"
                disabled={deletingProject}
                onClick={() => { void handleDeleteProject(); }}
              >
                {t('workspace.deleteProject')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {actionError && <p className="project-workspace-error" role="alert">{actionError}</p>}

      {viewMode === 'list' ? (
        <div className="project-workspace-list" data-testid="project-list">
          {topLevelTasks.length === 0 ? (
            <div className="project-column-empty">{t('list.emptyProject')}</div>
          ) : topLevelTasks.map(task => {
            const currentColumn = (task.projectColumnId ? columnMap.get(task.projectColumnId) : undefined) || columns[0];
            const taskTags = task.tagIds
              .map(id => tagMap.get(id))
              .filter((tag): tag is TagType => Boolean(tag));
            return (
              <article key={task.id} className={cn('project-workspace-list-row', task.completedAt && 'is-completed')}>
                <button type="button" title={task.title} onClick={() => onSelectTask(task)}>{task.title}</button>
                {task.priority != null ? (
                  <span className={`project-task-priority priority-${task.priority}`}>P{task.priority}</span>
                ) : <span />}
                {taskTags.length > 0 ? (
                  <span className="project-task-tag" title={taskTags.map(tag => `#${tag.name}`).join(', ')}>
                    <TagIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>#{taskTags[0].name}</span>
                    {taskTags.length > 1 && <b>+{taskTags.length - 1}</b>}
                  </span>
                ) : <span />}
                {task.dueDate ? (
                  <DueCountdown dueDate={task.dueDate} dueTime={task.dueTime} completedAt={task.completedAt} compact />
                ) : <span />}
                {currentColumn && (
                  <Select
                    value={currentColumn.id}
                    options={columnOptions}
                    onChange={val => {
                      const destination = columnMap.get(val);
                      if (destination) void moveTask(task, destination);
                    }}
                    aria-label={t('workspace.moveTask', { title: task.title })}
                    size="sm"
                  />
                )}
              </article>
            );
          })}
        </div>
      ) : (
      <div className="project-board" data-testid="project-board">
        {displayColumns.map(column => {
          const columnTasks = tasksByColumn.get(column.id) || [];
          return (
            <section
              key={column.id}
              className={cn(
                'project-column',
                dragOverColumnId === column.id && 'project-column-drag-over',
                draggedColumnId === column.id && 'is-dragging',
              )}
              aria-labelledby={`project-column-${column.id}`}
              onDragOver={event => handleSectionDragOver(column, event)}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverColumnId(null);
              }}
              onDrop={event => handleSectionDrop(column, event)}
              onDragEnd={handleColumnDragEnd}
              data-testid={`project-column-${column.id}`}
            >
              <div className="project-column-header">
                {editingColumnId !== column.id && (
                  <button
                    type="button"
                    className="project-column-drag-handle"
                    draggable
                    onDragStart={event => handleColumnDragStart(column.id, event)}
                    onDragEnd={handleColumnDragEnd}
                    aria-label={t('workspace.reorderColumn', { name: column.name })}
                    data-testid={`project-column-drag-handle-${column.id}`}
                  >
                    <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  {editingColumnId === column.id ? (
                    <form
                      onSubmit={event => { event.preventDefault(); void saveColumnName(column); }}
                      className="project-column-rename"
                    >
                      <input
                        value={editingName}
                        onChange={event => setEditingName(event.target.value)}
                        maxLength={80}
                        autoFocus
                        aria-label={t('workspace.columnName')}
                      />
                      <button type="submit" disabled={busy} aria-label={t('workspace.saveColumn')}>
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingColumnId(null)} aria-label={t('projects.cancel')}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="project-column-title-row">
                      <span className={cn('project-column-status', `column-color-${column.color}`, column.isDone && 'project-column-status-done')} aria-hidden="true" />
                      <h3 id={`project-column-${column.id}`}>{column.name}</h3>
                      <span className="project-column-count">{columnTasks.length}</span>
                    </div>
                  )}
                </div>
                {editingColumnId !== column.id && (
                  <div className="project-column-actions">
                    <button
                      type="button"
                      onClick={() => void updateColumn(column.id, { isDone: !column.isDone })}
                      aria-label={column.isDone ? t('workspace.unmarkDone') : t('workspace.markDone')}
                      className={cn(column.isDone && 'is-active')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingColumnId(column.id); setEditingName(column.name); }}
                      aria-label={t('workspace.renameColumn', { name: column.name })}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteColumnId(column.id)}
                      aria-label={t('workspace.deleteColumn', { name: column.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {deleteColumnId === column.id && (
                <div className="project-column-confirm" role="alert">
                  <p>{t('workspace.deleteConfirm', { name: column.name })}</p>
                  <div>
                    <button type="button" onClick={() => setDeleteColumnId(null)}>{t('projects.cancel')}</button>
                    <button type="button" className="is-danger" disabled={busy} onClick={() => void removeColumn(column.id)}>
                      {t('workspace.delete')}
                    </button>
                  </div>
                </div>
              )}

              <div className="project-column-cards">
                {columnTasks.length === 0 ? (
                  <div className="project-column-empty">{t('workspace.emptyColumn')}</div>
                ) : columnTasks.map(task => {
                  const taskTags = task.tagIds
                    .map(id => tagMap.get(id))
                    .filter((tag): tag is TagType => Boolean(tag));
                  const hasMeta = task.priority != null || Boolean(task.dueDate) || taskTags.length > 0;
                  return (
                    <article
                      key={task.id}
                      className={cn('project-task-card', task.completedAt && 'is-completed', draggedTaskId === task.id && 'is-dragging')}
                      draggable
                      onDragStart={event => {
                        setDraggedTaskId(task.id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', task.id);
                      }}
                      onDragEnd={() => { setDraggedTaskId(null); setDragOverColumnId(null); }}
                      data-testid={`project-task-${task.id}`}
                    >
                      <div className="project-task-card-main">
                        <GripVertical className="project-task-grip" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => onSelectTask(task)}
                          className="project-task-title"
                          title={task.title}
                        >
                          {task.title}
                        </button>
                        <div className="project-task-menu" data-project-task-menu={task.id}>
                          <button
                            type="button"
                            aria-label={t('workspace.moveTask', { title: task.title })}
                            aria-haspopup="menu"
                            aria-expanded={openTaskMenuId === task.id}
                            onClick={event => {
                              event.stopPropagation();
                              setOpenTaskMenuId(current => current === task.id ? null : task.id);
                            }}
                            onPointerDown={event => event.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          {openTaskMenuId === task.id && <div role="menu">
                            <span>{t('workspace.moveTo')}</span>
                            {columns.map(destination => (
                              <button
                                key={destination.id}
                                type="button"
                                role="menuitem"
                                disabled={destination.id === column.id}
                                onClick={() => {
                                  void moveTask(task, destination);
                                  setOpenTaskMenuId(null);
                                }}
                              >
                                {destination.id === column.id && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                                <span>{destination.name}</span>
                              </button>
                            ))}
                          </div>}
                        </div>
                      </div>
                      {hasMeta && (
                        <div className="project-task-meta">
                          {task.dueDate && (
                            <DueCountdown
                              dueDate={task.dueDate}
                              dueTime={task.dueTime}
                              completedAt={task.completedAt}
                              compact
                            />
                          )}
                          {task.priority != null && (
                            <span className={`project-task-priority priority-${task.priority}`}>P{task.priority}</span>
                          )}
                          {taskTags.length > 0 && (
                            <span
                              className="project-task-tag"
                              title={taskTags.map(tag => `#${tag.name}`).join(', ')}
                              data-testid={`project-task-tag-${task.id}`}
                            >
                              <TagIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span>#{taskTags[0].name}</span>
                              {taskTags.length > 1 && <b>+{taskTags.length - 1}</b>}
                            </span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        {addColumnOpen && (
          <section className="project-column project-column-add" aria-label={t('workspace.addColumn')}>
            <form onSubmit={addColumn}>
              <label htmlFor="project-new-column">{t('workspace.newColumn')}</label>
              <input
                id="project-new-column"
                value={newColumnName}
                onChange={event => setNewColumnName(event.target.value)}
                placeholder={t('workspace.columnName')}
                maxLength={80}
                autoFocus
              />
              <label htmlFor="project-new-column-color">{t('workspace.columnColor')}</label>
              <Select
                value={newColumnColor}
                options={['slate', 'ocean', 'jade', 'amber', 'rose', 'indigo'].map(c => ({
                  value: c,
                  label: t(`workspace.columnColors.${c}`),
                }))}
                onChange={setNewColumnColor}
              />
              <div>
                <button type="button" onClick={() => setAddColumnOpen(false)}>{t('projects.cancel')}</button>
                <button type="submit" disabled={!newColumnName.trim() || busy}>{t('workspace.add')}</button>
              </div>
            </form>
          </section>
        )}
      </div>
      )}

      <p className="project-workspace-hint">{t('workspace.dragHint')}</p>
    </section>
  );
}

function ProjectWorkspaceSkeleton({ label }: { label: string }) {
  return (
    <div className="project-workspace-skeleton" aria-label={label} role="status">
      <div className="project-workspace-skeleton-title" />
      <div className="project-workspace-skeleton-board">
        {[0, 1, 2].map(item => <div key={item} />)}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
