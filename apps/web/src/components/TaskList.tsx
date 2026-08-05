import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { projectColorClass } from '@/lib/project-colors';
import { taskColorClass } from '@/lib/task-colors';
import { useTranslation } from 'react-i18next';
import { Repeat, AlertTriangle, CalendarDays, CalendarRange, Inbox, CheckCircle2, Plus, ListChecks, Trash2, X, RotateCcw, Tag as TagIcon } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { useCountdownLabel } from './DueCountdown';
import { cn } from '@/lib/utils';
import type { Project, Tag as TagType, Task } from '@mindoist/shared/types';
import type { SidebarView } from '../hooks/useApi';

interface Props {
  tasks: Task[];
  loading: boolean;
  error?: string | null;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onBulkComplete?: (tasks: Task[]) => void;
  onBulkDelete?: (tasks: Task[]) => void;
  onRetry?: () => void;
  onMakeSubtask?: (taskId: string, parentId: string) => void;
  onRestore?: (taskId: string) => void;
  view?: SidebarView;
  selectedTaskId?: string;
  tags?: TagType[];
  projects?: Project[];
}

const TASK_DRAG_TYPE = 'application/x-task-drag';

function toDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function isToday(key: string): boolean {
  return key === new Date().toISOString().slice(0, 10);
}

function isYesterday(key: string): boolean {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return key === d.toISOString().slice(0, 10);
}

function formatDateHeading(key: string, t: (k: string) => string): string {
  if (isToday(key)) return t('completedView.today');
  if (isYesterday(key)) return t('completedView.yesterday');
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function getDueMeta(task: Task, t: (k: string, opts?: any) => string): { label: string; className: string } | null {
  if (!task.dueDate) return null;
  const dueDate = task.dueDate.slice(0, 10);
  const dateKey = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const todayDate = new Date();
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);
  const today = dateKey(todayDate);
  const tomorrow = dateKey(tomorrowDate);

  // Date range display when startDate exists and differs from dueDate
  if (task.startDate) {
    const startDateStr = task.startDate.slice(0, 10);
    if (startDateStr !== dueDate) {
      const label = `${formatShortDate(startDateStr)} → ${formatShortDate(dueDate)}`;
      if (task.completedAt) return { label, className: 'text-muted-foreground' };
      if (dueDate < today) return { label, className: 'text-destructive font-medium' };
      return { label, className: 'text-muted-foreground' };
    }
  }

  if (task.completedAt) {
    return { label: dueDate, className: 'text-muted-foreground' };
  }
  if (dueDate < today) {
    return { label: t('meta.dueOverdue'), className: 'text-destructive font-medium' };
  }
  if (dueDate === today) {
    return { label: t('meta.dueToday'), className: 'text-primary font-medium' };
  }
  if (dueDate === tomorrow) {
    return { label: t('meta.dueTomorrow'), className: 'text-muted-foreground' };
  }
  return { label: dueDate, className: 'text-muted-foreground' };
}

function getPriorityLabel(priority: number | null): string | null {
  return priority != null && priority >= 1 && priority <= 4 ? `P${priority}` : null;
}

function getPriorityChipClass(priority: number | null): string | null {
  if (priority === 1) return 'chip-p1';
  if (priority === 2) return 'chip-p2';
  if (priority === 3) return 'chip-p3';
  if (priority === 4) return 'chip-p4';
  return null;
}

function getDueChipClass(dueClassName: string): string {
  if (dueClassName.includes('destructive')) return 'chip-overdue';
  if (dueClassName.includes('text-primary')) return 'chip-today';
  return 'chip-neutral';
}

interface SubtaskStat { done: number; total: number }

// Same "has anything to show" check drives both TaskMeta's render-nothing
// path and TaskRow's row-height class — kept as one function so they can
// never disagree (an empty meta div under a tall row, or vice versa).
function taskHasMetadata(task: Task, subtaskStat?: SubtaskStat): boolean {
  return Boolean(
    task.dueDate ||
    task.projectId ||
    task.tagIds.length > 0 ||
    (task.priority != null && task.priority >= 1 && task.priority <= 4) ||
    task.rrule ||
    (subtaskStat && subtaskStat.total > 0)
  );
}

function TaskMeta({
  task,
  projectMap,
  tagMap,
  subtaskStat,
  t,
}: {
  task: Task;
  projectMap: ReadonlyMap<string, Project>;
  tagMap: ReadonlyMap<string, TagType>;
  subtaskStat?: SubtaskStat;
  t: (k: string, opts?: any) => string;
}) {
  const due = getDueMeta(task, t);
  const countdownDate = task.deadline?.date ?? task.dueDate;
  const countdownTime = task.deadline?.time ?? task.dueTime;
  const countdown = useCountdownLabel(countdownDate, countdownTime, task.completedAt);
  const priorityLabel = getPriorityLabel(task.priority);
  const priorityChipClass = getPriorityChipClass(task.priority);
  const project = task.projectId ? projectMap.get(task.projectId) : null;
  const taskTags = task.tagIds
    .map(id => tagMap.get(id))
    .filter((tag): tag is TagType => Boolean(tag));

  if (!taskHasMetadata(task, subtaskStat)) return null;

  return (
    <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
      {due && (
        // One chip carries both the due label and the live countdown
        // (e.g. "Today 14:00 · Due in 3h") instead of two separate badges —
        // testids on the inner spans stay distinct so both pieces remain
        // independently assertable.
        <span className={cn('chip shrink-0', getDueChipClass(due.className))}>
          <CalendarDays className="h-3 w-3" />
          <span data-testid={`task-due-${task.id}`}>
            {due.label}
            {countdownTime && !task.completedAt && ` ${countdownTime}`}
          </span>
          {countdown && (
            <>
              <span aria-hidden="true" className="opacity-60">·</span>
              <time
                dateTime={countdownDate ?? undefined}
                role="timer"
                aria-live="off"
                data-urgency={countdown.urgency}
                data-testid={`task-countdown-${task.id}`}
              >
                {countdown.label}
              </time>
            </>
          )}
        </span>
      )}
      {project && (
        <span data-testid={`task-project-${task.id}`} className="chip chip-neutral shrink-0">
          <span className={cn('w-1.5 h-1.5 rounded-full', projectColorClass(project.color))} />
          {project.name}
        </span>
      )}
      {taskTags.length > 0 && (
        <span
          data-testid={`task-tag-${task.id}`}
          className="chip chip-neutral min-w-0 max-w-28 shrink"
          title={taskTags.map(tag => `#${tag.name}`).join(', ')}
        >
          <TagIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">#{taskTags[0].name}</span>
          {taskTags.length > 1 && <span className="shrink-0">+{taskTags.length - 1}</span>}
        </span>
      )}
      {priorityLabel && priorityChipClass && (
        <span data-testid={`task-priority-${task.id}`} className={cn('chip shrink-0', priorityChipClass)}>
          {priorityLabel}
        </span>
      )}
      {task.rrule && (
        <span data-testid={`task-rrule-${task.id}`} className="chip chip-neutral shrink-0">
          <Repeat className="h-3 w-3" />
          {t('repeatBadge')}
        </span>
      )}
      {subtaskStat && subtaskStat.total > 0 && (
        <span data-testid={`task-subtasks-${task.id}`} className="chip chip-neutral shrink-0">
          <ListChecks className="h-3 w-3" />
          {t('meta.subtaskCount', { done: subtaskStat.done, total: subtaskStat.total })}
        </span>
      )}
    </div>
  );
}

function TaskRow({
  task,
  projectMap,
  tagMap,
  subtaskStat,
  onToggle,
  onSelect,
  onSelectForBulk,
  isAnimating,
  isSelected,
  isBulkEnabled,
  isBulkActive,
  isBulkSelected,
  t,
  index,
  onMakeSubtask,
  isDragOver,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd,
  onRestore,
  deferOffscreen,
}: {
  task: Task;
  projectMap: ReadonlyMap<string, Project>;
  tagMap: ReadonlyMap<string, TagType>;
  subtaskStat?: SubtaskStat;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onSelectForBulk?: (task: Task) => void;
  isAnimating: boolean;
  isSelected: boolean;
  isBulkEnabled: boolean;
  isBulkActive: boolean;
  isBulkSelected: boolean;
  t: (k: string, opts?: any) => string;
  index: number;
  onMakeSubtask?: (taskId: string, parentId: string) => void;
  isDragOver: boolean;
  onRowDragStart: (task: Task, event: React.DragEvent) => void;
  onRowDragOver: (task: Task, event: React.DragEvent) => void;
  onRowDragLeave: () => void;
  onRowDrop: (task: Task, event: React.DragEvent) => void;
  onRowDragEnd: () => void;
  onRestore?: (taskId: string) => void;
  deferOffscreen: boolean;
}) {
  const hasMeta = taskHasMetadata(task, subtaskStat);
  // Once bulk selection is active, the left slot takes over as the
  // bulk-select checkbox (replacing complete) so there is only ever one
  // checkbox per row — the old layout showed complete (left) AND a
  // fully-opaque bulk checkbox (right) at the same time once bulk mode
  // was active, which read as two unrelated checkboxes on two ends.
  const showBulkOnLeft = isBulkEnabled && isBulkActive && !onRestore;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.015, 0.12) }}
      style={deferOffscreen ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 3.5rem' } : undefined}
    >
    <div
      data-testid={`task-${task.id}`}
      draggable={Boolean(onMakeSubtask)}
      onDragStart={event => onRowDragStart(task, event)}
      onDragOver={event => onRowDragOver(task, event)}
      onDragLeave={onRowDragLeave}
      onDrop={event => onRowDrop(task, event)}
      onDragEnd={onRowDragEnd}
      className={cn(
        "group relative grid grid-cols-[2.75rem_minmax(0,1fr)] px-1 transition-colors",
        hasMeta ? "min-h-14" : "min-h-9",
        "hover:bg-card hover:shadow-sm focus-within:bg-card focus-within:shadow-sm",
        task.color && "bg-[var(--task-color-bg)] border-l-[3px] border-l-[var(--task-color-border)]",
        taskColorClass(task.color),
        // Selection must not be expressed as a `bg-*` when the task carries a
        // color: `cn()` runs tailwind-merge, which treats bg-[var(--task-color-bg)]
        // and bg-sidebar-accent/80 as the same conflict group and keeps only the
        // last one — so a selected rose task silently lost its tint. Colored rows
        // therefore signal selection with a stronger ring only, leaving the tint
        // intact; uncolored rows keep the original background treatment.
        isSelected && (task.color
          ? "ring-2 ring-inset ring-primary/50"
          : "bg-sidebar-accent/80 ring-1 ring-inset ring-primary/25"),
        isAnimating && "task-completing",
        isDragOver && "ring-2 ring-inset ring-primary bg-primary/5"
      )}
    >
      {isBulkEnabled && !isBulkActive && !onRestore && (
        <Checkbox
          data-testid={`task-select-${task.id}`}
          checked={isBulkSelected}
          onCheckedChange={() => onSelectForBulk?.(task)}
          aria-label={t('list.selectTask', { title: task.title })}
          className="absolute right-2 top-2.5 z-10 h-4 w-4 rounded-chip border-muted-foreground/45 bg-background/80 shadow-none opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 group-focus-within:opacity-100"
        />
      )}
      <div className="flex items-start justify-center pt-2.5">
        {onRestore ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid={`task-restore-${task.id}`}
            onClick={(e) => { e.stopPropagation(); onRestore(task.id); }}
            aria-label={t('list.restoreTask')}
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground hover:text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : showBulkOnLeft ? (
          <Checkbox
            data-testid={`task-select-${task.id}`}
            checked={isBulkSelected}
            onCheckedChange={() => onSelectForBulk?.(task)}
            aria-label={t('list.selectTask', { title: task.title })}
            className="mt-0.5 shrink-0"
          />
        ) : (
          <Checkbox
            data-testid={`task-toggle-${task.id}`}
            checked={!!task.completedAt}
            onCheckedChange={() => onToggle(task)}
            aria-label={t('list.toggleComplete', { title: task.title })}
            className="mt-0.5 shrink-0"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => onSelect(task)}
        className={cn(
          "min-w-0 rounded-md py-2.5 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isBulkEnabled && "pr-9"
        )}
      >
        <span
          data-testid={`task-title-${task.id}`}
          className={cn(
            "block truncate text-sm font-medium leading-5 transition-colors",
            task.completedAt ? "line-through text-muted-foreground" : "text-foreground group-hover:text-primary"
          )}
        >
          {task.title}
        </span>
        <TaskMeta task={task} projectMap={projectMap} tagMap={tagMap} subtaskStat={subtaskStat} t={t} />
      </button>
    </div>
    </motion.div>
  );
}

function BulkActionBar({
  selectedCount,
  canComplete,
  canSelectVisible,
  onSelectVisible,
  onComplete,
  onDelete,
  onClear,
  t,
}: {
  selectedCount: number;
  canComplete: boolean;
  canSelectVisible: boolean;
  onSelectVisible: () => void;
  onComplete?: () => void;
  onDelete?: () => void;
  onClear: () => void;
  t: (k: string, opts?: any) => string;
}) {
  if (selectedCount === 0) return null;

  return (
    <div data-testid="bulk-action-bar" className="mb-2 flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-2 py-1.5 text-xs text-muted-foreground">
      <span data-testid="bulk-selected-count" className="mr-auto font-medium text-foreground">
        {t('list.selectedCount', { count: selectedCount })}
      </span>
      {canSelectVisible && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="bulk-select-visible"
          onClick={onSelectVisible}
          className="h-8 gap-1.5 px-2 text-xs"
        >
          <ListChecks className="h-3.5 w-3.5" />
          {t('list.selectVisible')}
        </Button>
      )}
      {onComplete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="bulk-complete"
          disabled={!canComplete}
          onClick={onComplete}
          className="h-8 gap-1.5 px-2 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('list.bulkComplete')}
        </Button>
      )}
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="bulk-delete"
          onClick={onDelete}
          className="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('list.bulkDelete')}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-testid="bulk-clear"
        aria-label={t('list.clearSelection')}
        onClick={onClear}
        className="h-8 w-8"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function EmptyState({ view, t }: { view: SidebarView; t: (k: string) => string }) {
  const emptyKeyMap: Record<SidebarView, string> = {
    summary: 'list.emptySearch',
    all: 'list.emptyInbox',
    inbox: 'list.emptyInbox',
    today: 'list.emptyToday',
    next7: 'list.emptyNext7',
    overdue: 'list.emptyOverdue',
    completed: 'list.emptyCompleted',
    trashed: 'list.emptyTrashed',
    projects: 'list.emptyProject',
    tags: 'list.emptyTag',
    notes: 'list.emptySearch',
    calendar: 'list.emptySearch',
    countdown: 'list.emptySearch',
    import: 'list.emptySearch',
    settings: 'list.emptySearch',
    export: 'list.emptySearch',
    admin: 'list.emptySearch',
  };

  const iconMap: Record<SidebarView, React.ComponentType<{ className?: string }>> = {
    summary: Inbox,
    all: Inbox,
    inbox: Inbox,
    today: CalendarDays,
    next7: CalendarRange,
    overdue: AlertTriangle,
    completed: CheckCircle2,
    trashed: Trash2,
    projects: Inbox,
    tags: Inbox,
    notes: Inbox,
    calendar: CalendarDays,
    countdown: Inbox,
    import: Inbox,
    settings: Inbox,
    export: Inbox,
    admin: Inbox,
  };

  const Icon = iconMap[view];

  return (
    <div data-testid="empty-message" className="mx-auto mt-12 flex max-w-sm flex-col items-center rounded-lg border border-dashed border-border/80 px-6 py-8 text-center">
      <Icon className="mb-3 h-10 w-10 text-muted-foreground/35" />
      <p className="text-sm text-muted-foreground">{t(emptyKeyMap[view])}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div data-testid="task-list-loading" className="flex-1">
      <div className="flex flex-col gap-0.5">
        <Skeleton className="h-14 w-full rounded-none border-b border-border/70" />
        <Skeleton className="h-14 w-full rounded-none border-b border-border/70" />
        <Skeleton className="h-14 w-3/4 rounded-none border-b border-border/70" />
        <Skeleton className="h-14 w-full rounded-none border-b border-border/70" />
      </div>
    </div>
  );
}

export function TaskList({ tasks, loading, error, onToggle, onSelect, onBulkComplete, onBulkDelete, onRetry, onMakeSubtask, onRestore, view, selectedTaskId, tags = [], projects = [] }: Props) {
  const { t } = useTranslation('tasks');
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const tagMap = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags]);
  const projectMap = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);

  const subtaskStats = useMemo(() => {
    const map = new Map<string, SubtaskStat>();
    for (const task of tasks) {
      if (!task.parentId) continue;
      const stat = map.get(task.parentId) || { done: 0, total: 0 };
      stat.total += 1;
      if (task.completedAt) stat.done += 1;
      map.set(task.parentId, stat);
    }
    return map;
  }, [tasks]);

  const handleRowDragStart = useCallback((task: Task, event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
    setDraggedTaskId(task.id);
  }, []);

  const handleRowDragOver = useCallback((task: Task, event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
    // Cannot drop onto a subtask (only 1 level of nesting allowed)
    if (task.parentId) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.preventDefault();
    if (draggedTaskId && draggedTaskId !== task.id) setDragOverTaskId(task.id);
  }, [draggedTaskId]);

  const handleRowDragLeave = useCallback(() => setDragOverTaskId(null), []);

  const handleRowDrop = useCallback((task: Task, event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
    event.preventDefault();
    const draggedId = event.dataTransfer.getData(TASK_DRAG_TYPE) || draggedTaskId;
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    if (task.parentId) return;
    if (draggedId && draggedId !== task.id) onMakeSubtask?.(draggedId, task.id);
  }, [draggedTaskId, onMakeSubtask]);

  const handleRowDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  }, []);

  useEffect(() => {
    const newCompleted = new Set<string>();
    tasks.forEach(t => {
      if (t.completedAt && !prevCompletedRef.current.has(t.id)) {
        newCompleted.add(t.id);
      }
    });
    prevCompletedRef.current = new Set(tasks.filter(t => t.completedAt).map(t => t.id));

    if (newCompleted.size > 0) {
      setAnimatingIds(prev => new Set([...prev, ...newCompleted]));
      const timer = setTimeout(() => {
        setAnimatingIds(prev => {
          const next = new Set(prev);
          newCompleted.forEach(id => next.delete(id));
          return next;
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [tasks]);

  const displayTasks = useMemo(() => {
    // Sub-tasks are managed from their parent's detail panel, not as rows in the main list.
    const topLevel = tasks.filter(task => !task.parentId);
    if (view === 'inbox') return topLevel.filter(task => !task.projectId && !task.dueDate && !task.completedAt && !task.deletedAt);
    if (view === 'today') {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return topLevel.filter(task => {
        const start = task.startDate?.slice(0, 10);
        const due = task.dueDate?.slice(0, 10);
        if (!start && !due) return true;
        if (due && due <= today) return true;
        return Boolean(start && start <= today && (!due || due >= today));
      });
    }
    if (view !== 'completed') return topLevel;
    return [...topLevel].sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [tasks, view]);

  const bulkEnabled = Boolean(onBulkComplete || onBulkDelete);

  useEffect(() => {
    setBulkSelectedIds(prev => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(displayTasks.map(task => task.id));
      const next = new Set(Array.from(prev).filter(id => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [displayTasks]);

  const selectedBulkTasks = useMemo(
    () => displayTasks.filter(task => bulkSelectedIds.has(task.id)),
    [bulkSelectedIds, displayTasks],
  );

  const incompleteBulkTasks = useMemo(
    () => selectedBulkTasks.filter(task => !task.completedAt),
    [selectedBulkTasks],
  );

  const toggleBulkSelection = useCallback((task: Task) => {
    setBulkSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }, []);

  const clearBulkSelection = useCallback(() => setBulkSelectedIds(new Set()), []);

  const handleSelectVisible = useCallback(() => {
    setBulkSelectedIds(new Set(displayTasks.map(task => task.id)));
  }, [displayTasks]);

  const handleBulkComplete = useCallback(() => {
    if (incompleteBulkTasks.length === 0) return;
    onBulkComplete?.(incompleteBulkTasks);
    clearBulkSelection();
  }, [clearBulkSelection, incompleteBulkTasks, onBulkComplete]);

  const handleBulkDelete = useCallback(() => {
    if (selectedBulkTasks.length === 0) return;
    onBulkDelete?.(selectedBulkTasks);
    clearBulkSelection();
  }, [clearBulkSelection, onBulkDelete, selectedBulkTasks]);

  const groupedTasks = useMemo(() => {
    if (view !== 'completed' && view !== 'next7' && view !== 'today') return null;
    const day = new Date();
    const today = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const groups = new Map<string, Task[]>();
    for (const task of displayTasks) {
      let key: string;
      if (view === 'completed') {
        key = task.completedAt ? toDayKey(task.completedAt) : 'unknown';
      } else if (view === 'today') {
        const start = task.startDate?.slice(0, 10);
        const due = task.dueDate?.slice(0, 10);
        key = !start && !due ? 'anytime' : due && due < today ? 'overdue' : 'today';
      } else {
        key = task.dueDate?.slice(0, 10) || 'no-date';
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    }
    return groups;
  }, [displayTasks, view]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div data-testid="task-list" className="flex-1">
      {error && (
        <div
          data-testid="error-banner"
          role="alert"
          className="mb-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between"
        >
          <span>{error}</span>
          {onRetry && (
            <Button variant="outline" size="sm" data-testid="retry-btn" onClick={onRetry} className="h-7 text-xs">
              {t('list.retry')}
            </Button>
          )}
        </div>
      )}

      {displayTasks.length === 0 && !error && <EmptyState view={view || 'inbox'} t={t} />}

      {bulkEnabled && selectedBulkTasks.length > 0 && !error && (
        <BulkActionBar
          selectedCount={selectedBulkTasks.length}
          canComplete={incompleteBulkTasks.length > 0}
          canSelectVisible={selectedBulkTasks.length < displayTasks.length}
          onSelectVisible={handleSelectVisible}
          onComplete={onBulkComplete ? handleBulkComplete : undefined}
          onDelete={onBulkDelete ? handleBulkDelete : undefined}
          onClear={clearBulkSelection}
          t={t}
        />
      )}

      {(view === 'completed' || view === 'today') && groupedTasks ? (
        Array.from(groupedTasks.entries()).map(([dayKey, dayTasks]) => (
          <div key={dayKey} data-testid={`completed-group-${dayKey}`}>
            <h4 className="px-1 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {view === 'today' ? t(`myDay.${dayKey}`) : formatDateHeading(dayKey, t)}
            </h4>
            <div className="flex flex-col gap-0.5">
              {dayTasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectMap={projectMap}
                  tagMap={tagMap}
                  subtaskStat={subtaskStats.get(task.id)}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onSelectForBulk={toggleBulkSelection}
                  isAnimating={animatingIds.has(task.id)}
                  isSelected={selectedTaskId === task.id}
                  isBulkEnabled={bulkEnabled}
                  isBulkActive={selectedBulkTasks.length > 0}
                  isBulkSelected={bulkSelectedIds.has(task.id)}
                  t={t}
                  index={index}
                  onMakeSubtask={onMakeSubtask}
                  isDragOver={dragOverTaskId === task.id}
                  onRowDragStart={handleRowDragStart}
                  onRowDragOver={handleRowDragOver}
                  onRowDragLeave={handleRowDragLeave}
                  onRowDrop={handleRowDrop}
                  onRowDragEnd={handleRowDragEnd}
                  onRestore={onRestore}
                  deferOffscreen={displayTasks.length > 50}
                />
              ))}
            </div>
          </div>
        ))
      ) : groupedTasks ? (
        Array.from(groupedTasks.entries()).map(([dayKey, dayTasks]) => (
          <div key={dayKey} data-testid={`group-${dayKey}`}>
            <h4 className="px-1 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formatDateHeading(dayKey, t)}
            </h4>
            <div className="flex flex-col gap-0.5">
              {dayTasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectMap={projectMap}
                  tagMap={tagMap}
                  subtaskStat={subtaskStats.get(task.id)}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onSelectForBulk={toggleBulkSelection}
                  isAnimating={animatingIds.has(task.id)}
                  isSelected={selectedTaskId === task.id}
                  isBulkEnabled={bulkEnabled}
                  isBulkActive={selectedBulkTasks.length > 0}
                  isBulkSelected={bulkSelectedIds.has(task.id)}
                  t={t}
                  index={index}
                  onMakeSubtask={onMakeSubtask}
                  isDragOver={dragOverTaskId === task.id}
                  onRowDragStart={handleRowDragStart}
                  onRowDragOver={handleRowDragOver}
                  onRowDragLeave={handleRowDragLeave}
                  onRowDrop={handleRowDrop}
                  onRowDragEnd={handleRowDragEnd}
                  onRestore={onRestore}
                  deferOffscreen={displayTasks.length > 50}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="flex flex-col gap-0.5">
          {displayTasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              projectMap={projectMap}
              tagMap={tagMap}
              subtaskStat={subtaskStats.get(task.id)}
              onToggle={onToggle}
              onSelect={onSelect}
              onSelectForBulk={toggleBulkSelection}
              isAnimating={animatingIds.has(task.id)}
              isSelected={selectedTaskId === task.id}
              isBulkEnabled={bulkEnabled}
              isBulkActive={selectedBulkTasks.length > 0}
              isBulkSelected={bulkSelectedIds.has(task.id)}
              t={t}
              index={index}
              onMakeSubtask={onMakeSubtask}
              isDragOver={dragOverTaskId === task.id}
              onRowDragStart={handleRowDragStart}
              onRowDragOver={handleRowDragOver}
              onRowDragLeave={handleRowDragLeave}
              onRowDrop={handleRowDrop}
              onRowDragEnd={handleRowDragEnd}
              onRestore={onRestore}
              deferOffscreen={displayTasks.length > 50}
            />
          ))}
        </div>
      )}
    </div>
  );
}
