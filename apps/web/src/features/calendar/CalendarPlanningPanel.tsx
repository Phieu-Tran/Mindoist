import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Task, TimeBlock, UpdateTaskRequest, UpdateTimeBlockRequest } from '@mindoist/shared/types';
import { effectiveTaskColor } from '@/lib/task-colors';
import { cn } from '@/lib/utils';
import { PlanningCeremony } from '@/components/PlanningCeremony';
import { PersistentResizablePanel } from '@/components/PersistentResizablePanel';
import { dayKey } from './grid/time-grid';

interface Props {
  tasks: Task[];
  todayTasks: Task[];
  backlogTasks: Task[];
  projects: { id: string; name: string; color?: string | null }[];
  timeBlocks: TimeBlock[];
  workHoursPerDay: number;
  onSelectTask: (task: Task) => void;
  onUpdateTask: (id: string, request: UpdateTaskRequest) => Promise<unknown> | void;
  onUpdateTimeBlock: (id: string, request: UpdateTimeBlockRequest) => Promise<void> | void;
}

function colorClass(task: Task, projectColor?: string | null): string {
  const identityColor = effectiveTaskColor(task.color, projectColor);
  return identityColor
    ? `bg-[var(--task-color-bg)] task-color-${identityColor}`
    : 'bg-transparent';
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}:${String(rest).padStart(2, '0')}` : `${rest}m`;
}

function startDrag(task: Task, event: DragEvent<HTMLElement>) {
  event.dataTransfer.setData('application/x-panel-task', task.id);
  event.dataTransfer.setData('application/x-task-duration', String(task.estimateMin ?? 60));
  event.dataTransfer.effectAllowed = 'move';
}

export function CalendarPlanningPanel({ tasks, todayTasks, backlogTasks, projects, timeBlocks, workHoursPerDay, onSelectTask, onUpdateTask, onUpdateTimeBlock }: Props) {
  const { t } = useTranslation('tasks');
  const today = dayKey(new Date());
  const overdue = useMemo(() => tasks
    .filter(task => !task.completedAt && Boolean(task.deadline?.date && task.deadline.date < today))
    .sort((left, right) => (left.deadline?.date ?? '').localeCompare(right.deadline?.date ?? '')), [tasks, today]);
  const projectMap = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  const groups = useMemo(() => {
    const result = new Map<string, { label: string; tasks: Task[] }>();
    for (const task of backlogTasks) {
      const key = task.projectId ?? '__inbox__';
      const group = result.get(key) ?? { label: task.projectId ? projectMap.get(task.projectId)?.name ?? task.projectId : t('sidebar.inbox'), tasks: [] };
      group.tasks.push(task);
      result.set(key, group);
    }
    return [...result.entries()].sort(([left], [right]) => left === '__inbox__' ? -1 : right === '__inbox__' ? 1 : 0);
  }, [backlogTasks, projectMap, t]);
  const navigable = useMemo(() => [...todayTasks, ...overdue, ...groups.flatMap(([, group]) => group.tasks)], [groups, overdue, todayTasks]);
  const [focused, setFocused] = useState(-1);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'j') setFocused(value => Math.min(navigable.length - 1, value + 1));
      else if (event.key.toLowerCase() === 'k') setFocused(value => Math.max(0, value - 1));
      else if (event.key === 'Enter' && navigable[focused]) onSelectTask(navigable[focused]);
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [focused, navigable, onSelectTask]);

  const renderTask = (task: Task, index: number, extra = '') => (
    <button
      key={task.id}
      type="button"
      draggable
      data-calendar-backlog-task
      data-task-id={task.id}
      onDragStart={event => startDrag(task, event)}
      onClick={() => onSelectTask(task)}
      className={cn('mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60', colorClass(task, task.projectId ? projectMap.get(task.projectId)?.color : null), task.completedAt && 'line-through opacity-50', focused === index && 'bg-muted shadow-sm', extra)}
    >
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {task.estimateMin ? <small className="shrink-0 text-muted-foreground">{duration(task.estimateMin)}</small> : null}
    </button>
  );

  let backlogIndex = todayTasks.length + overdue.length;
  return (
    <PersistentResizablePanel className="calendar-panel flex shrink-0 flex-col overflow-hidden rounded-panel border border-border bg-card" label={t('calendar.planningPanel')} storageKey="mindoist:panel:calendar-plan-width" defaultWidth={280} minWidth={240} maxWidth={480}>
      <header className="shrink-0 px-3 pb-2 pt-3">
        <strong className="block text-sm text-foreground">{t('calendar.planningPanel')}</strong>
        <p className="m-0 mt-1 text-[0.68rem] leading-4 text-muted-foreground">{t('calendar.planningPanelHint')}</p>
      </header>
      <PlanningCeremony
        tasks={tasks}
        timeBlocks={timeBlocks}
        workHoursPerDay={workHoursPerDay}
        onUpdateTimeBlock={onUpdateTimeBlock}
        onMoveTomorrow={task => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return Promise.resolve(onUpdateTask(task.id, { deadline: { date: dayKey(tomorrow) } })).then(() => undefined);
        }}
        onMoveAllTomorrow={async tasksToMove => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          await Promise.all(tasksToMove.map(task => onUpdateTask(task.id, { deadline: { date: dayKey(tomorrow) } })));
        }}
      />
      <section className="mx-2 shrink-0 rounded-lg bg-muted/35 p-2">
        <header className="flex items-center justify-between px-1 pb-1"><strong>{t('calendar.panelToday')}</strong><span className="text-xs text-muted-foreground">{todayTasks.length}</span></header>
        <div className="max-h-[24vh] overflow-y-auto">
          {todayTasks.length ? todayTasks.map((task, index) => renderTask(task, index)) : <p className="py-2 text-center text-xs text-muted-foreground">{t('calendar.panelEmptyToday')}</p>}
        </div>
      </section>
      <section className="mt-2 shrink-0 px-2" data-testid="calendar-overdue-section">
        <header className="flex items-center justify-between px-1 pb-1"><strong className="text-destructive">{t('calendar.panelOverdue')}</strong><span className="text-xs text-destructive">{overdue.length}</span></header>
        <div className="max-h-[20vh] overflow-y-auto">
          {overdue.length ? overdue.map((task, index) => renderTask(task, todayTasks.length + index, 'bg-destructive/5 text-destructive')) : <p className="py-2 text-center text-xs text-muted-foreground">{t('calendar.panelEmptyOverdue')}</p>}
        </div>
      </section>
      <section className="min-h-0 flex-1 px-2 pb-2 pt-1">
        <header className="flex items-center justify-between px-1 pb-1"><strong>{t('calendar.panelBacklog')}</strong><span className="text-xs text-muted-foreground">{backlogTasks.length}</span></header>
        <div className="h-full overflow-y-auto">
          {groups.map(([id, group]) => {
            const start = backlogIndex;
            backlogIndex += group.tasks.length;
            return <div key={id}><h4 className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">{group.label}</h4>{group.tasks.map((task, index) => renderTask(task, start + index))}</div>;
          })}
          {!backlogTasks.length && <p className="py-3 text-center text-xs text-muted-foreground">{t('calendar.panelEmptyBacklog')}</p>}
        </div>
      </section>
    </PersistentResizablePanel>
  );
}
