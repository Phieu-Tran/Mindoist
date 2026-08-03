import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import type { Project, Task, Tag as TagType, UpdateTaskRequest } from '@mindoist/shared/types';
import { Button } from './ui/button';
import { TaskInspectorBoundary as TaskInspector } from './TaskInspectorBoundary';
import { cn } from '@/lib/utils';
import { taskColorClass } from '@/lib/task-colors';

interface Props {
  tasks: Task[];
  selectedTask: Task | null;
  projects: Project[];
  tags: TagType[];
  onSave: (id: string, req: UpdateTaskRequest) => Promise<void> | void;
  onAutosave?: (id: string, req: UpdateTaskRequest) => Promise<void> | void;
  onCompletePomodoro: (id: string) => Promise<Task>;
  onClose: () => void;
  onDelete: (id: string) => void;
  onDeleteWithUndo?: (task: Task) => Promise<void>;
  onSelectTask: (task: Task) => void;
  onTasksChanged?: () => void;
  pomodoroWorkMinutes?: number;
  pomodoroBreakMinutes?: number;
}

function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function atNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

export function TaskSideRail({
  tasks,
  selectedTask,
  projects,
  tags,
  onSave,
  onAutosave,
  onCompletePomodoro,
  onClose,
  onDelete,
  onDeleteWithUndo,
  onSelectTask,
  onTasksChanged,
  pomodoroWorkMinutes,
  pomodoroBreakMinutes,
}: Props) {
  const { t, i18n } = useTranslation('tasks');
  const today = atNoon(new Date());
  const todayKey = dayKey(today);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [selectedKey, setSelectedKey] = useState(() => selectedTask?.dueDate?.slice(0, 10) || todayKey);
  const [railExpanded, setRailExpanded] = useState(false);

  const tasksByDay = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    tasks.forEach(task => {
      if (!task.dueDate || task.parentId) return;
      const key = task.dueDate.slice(0, 10);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(task);
    });
    grouped.forEach(dayTasks => dayTasks.sort((a, b) => (
      (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59') || a.title.localeCompare(b.title)
    )));
    return grouped;
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const start = new Date(visibleMonth);
    const mondayOffset = (visibleMonth.getDay() + 6) % 7;
    start.setDate(1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2026, 6, 20 + index, 12);
    return date.toLocaleDateString(i18n.language, { weekday: 'short' });
  }), [i18n.language]);

  const selectedTasks = tasksByDay.get(selectedKey) || [];
  const selectedTaskDate = selectedTask?.dueDate ? selectedTask.dueDate.slice(0, 10) : null;
  const selectedTaskDateLabel = selectedTaskDate
    ? new Date(`${selectedTaskDate}T12:00:00`).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' })
    : null;

  useEffect(() => {
    // Always resync to the newly-selected task's due date — falling back to
    // today when it has none — so the mini calendar can't keep showing a
    // stale day (and its agenda list) left over from whatever was selected
    // before. Bailing out early when dueDate was empty used to leave the
    // previous day's agenda on screen, contradicting the "no tasks" label.
    const key = selectedTask?.dueDate ? selectedTask.dueDate.slice(0, 10) : todayKey;
    const date = new Date(`${key}T12:00:00`);
    setSelectedKey(key);
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  }, [selectedTask?.id, selectedTask?.dueDate, todayKey]);

  useEffect(() => {
    setRailExpanded(false);
  }, [selectedTask?.id]);

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1, 12);
    setVisibleMonth(next);
    setSelectedKey(dayKey(next));
  };

  const calendarGrid = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 data-testid="rail-calendar-month" className="m-0 text-sm font-semibold">
            {visibleMonth.toLocaleDateString(i18n.language, { month: 'long' })}
            {' '}
            <span className="ml-1 text-primary">{visibleMonth.getFullYear()}</span>
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => moveMonth(-1)} aria-label={t('summary.previousMonth')} className="h-7 w-7">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => moveMonth(1)} aria-label={t('summary.nextMonth')} className="h-7 w-7">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-[0.62rem] font-semibold uppercase text-muted-foreground" aria-hidden="true">
        {weekdays.map(weekday => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-y-1" role="grid" aria-label={t('summary.calendarOverview')}>
        {calendarDays.map(date => {
          const key = dayKey(date);
          const dayTasks = tasksByDay.get(key) || [];
          const outside = date.getMonth() !== visibleMonth.getMonth();
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              data-testid={`rail-calendar-day-${key}`}
              aria-label={t('summary.calendarDay', { date: date.toLocaleDateString(i18n.language), count: dayTasks.length })}
              onClick={() => setSelectedKey(key)}
              className={cn(
                'mx-auto flex h-7 w-7 flex-col items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                outside && 'text-muted-foreground/45',
                key === todayKey && 'bg-primary text-primary-foreground',
                key === selectedKey && key !== todayKey && 'bg-sidebar-accent text-primary'
              )}
            >
              <span>{date.getDate()}</span>
              {dayTasks.length > 0 && (
                <span className="mt-0.5 flex max-w-7 gap-0.5" aria-hidden="true">
                  {dayTasks.slice(0, 3).map(task => (
                    <span key={task.id} className={cn('task-color-dot h-1 w-1 rounded-full', taskColorClass(task.color))} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 max-h-24 overflow-y-auto border-t border-border/70 pt-2">
        {selectedTasks.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t('summary.noTasksForDate')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selectedTasks.slice(0, 4).map(task => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask(task)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn('task-color-dot h-2 w-2 rounded-full', taskColorClass(task.color))} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.dueTime && <span className="text-xs text-muted-foreground">{task.dueTime}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // A detail rail is progressive disclosure, not a permanent dashboard
  // column. Keeping it out of the layout until a row is selected returns the
  // list its usable width and prevents a misleading empty inspector.
  if (!selectedTask) return null;

  return (
    <aside
      data-testid="task-side-rail"
      className="hidden xl:flex sticky top-0 h-[calc(100vh-2rem)] w-[24rem] shrink-0 flex-col overflow-hidden pl-4"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-border bg-card">
      <AnimatePresence mode="wait">
        {selectedTask ? (
          <TaskInspector
            key={selectedTask.id}
            rail
            task={selectedTask}
            projects={projects}
            tags={tags}
            onSave={onSave}
            onAutosave={onAutosave}
            onCompletePomodoro={onCompletePomodoro}
            onClose={onClose}
            onDelete={onDelete}
            onDeleteWithUndo={onDeleteWithUndo}
            onSelectTask={onSelectTask}
            onTasksChanged={onTasksChanged}
            pomodoroWorkMinutes={pomodoroWorkMinutes}
            pomodoroBreakMinutes={pomodoroBreakMinutes}
          />
        ) : (
          <div
            key="rail-empty"
            data-testid="rail-empty-state"
            className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <ListChecks className="h-8 w-8 text-muted-foreground/35" aria-hidden="true" />
            <p className="m-0 text-sm font-medium text-foreground/80">{t('summary.railEmptyTitle')}</p>
            <p className="m-0 text-xs text-muted-foreground">{t('summary.railEmptyHint')}</p>
          </div>
        )}
      </AnimatePresence>

      <section
        data-testid="rail-calendar"
        className="shrink-0 border-t border-border bg-sidebar/70 px-3 py-2.5"
      >
        {selectedTask ? (
          <>
            <button
              type="button"
              data-testid="rail-calendar-compact"
              onClick={() => setRailExpanded(v => !v)}
              aria-expanded={railExpanded}
              className="flex w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {railExpanded ? (
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t('sidebar.calendar')}</span>
              ) : (
                <div className="min-w-0 flex-1">
                  <h3 data-testid="rail-calendar-month" className="m-0 truncate text-sm font-semibold">
                    {visibleMonth.toLocaleDateString(i18n.language, { month: 'long' })}
                    {' '}
                    <span className="text-primary">{visibleMonth.getFullYear()}</span>
                  </h3>
                  <p className="m-0 truncate text-xs text-muted-foreground">
                    {selectedTaskDateLabel || t('summary.noTasksForDate')}
                  </p>
                </div>
              )}
              {railExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
            </button>
            {railExpanded && <div className="mt-2 border-t border-border/70 pt-2">{calendarGrid}</div>}
          </>
        ) : (
          calendarGrid
        )}
      </section>
      </div>
    </aside>
  );
}
