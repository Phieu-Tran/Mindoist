import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Task, TimeBlock, UpdateTimeBlockRequest } from '@mindoist/shared/types';
import { cn } from '@/lib/utils';

type Mode = 'plan' | 'focus' | 'shutdown';

interface Props {
  tasks: Task[];
  timeBlocks: TimeBlock[];
  workHoursPerDay: number;
  onUpdateTimeBlock?: (id: string, request: UpdateTimeBlockRequest) => Promise<void> | void;
  onMoveTomorrow?: (task: Task) => Promise<void> | void;
  onMoveAllTomorrow?: (tasks: Task[]) => Promise<void> | void;
}

const dateKey = (value: Date) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
const blockMinutes = (block: TimeBlock) => Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000));
const hours = (minutes: number) => `${Math.round(minutes / 6) / 10}h`;
const timerText = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function PlanningCeremony({ tasks, timeBlocks, workHoursPerDay, onUpdateTimeBlock, onMoveTomorrow, onMoveAllTomorrow }: Props) {
  const { t } = useTranslation('tasks');
  const [mode, setMode] = useState<Mode>('plan');
  const [now, setNow] = useState(() => Date.now());
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const today = dateKey(new Date(now));
  const todayBlocks = useMemo(() => timeBlocks.filter(block => dateKey(new Date(block.startAt)) === today), [timeBlocks, today]);
  const taskMap = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const planned = useMemo(() => todayBlocks.reduce((sum, block) => sum + blockMinutes(block), 0), [todayBlocks]);
  const actual = useMemo(() => todayBlocks.reduce((sum, block) => sum + (block.actualMin ?? 0), 0), [todayBlocks]);
  const scheduledTaskIds = useMemo(() => new Set(todayBlocks.map(block => block.taskId).filter(Boolean)), [todayBlocks]);
  const unscheduled = useMemo(() => tasks.filter(task => (
    !task.completedAt && !task.deletedAt && !task.parentId && !scheduledTaskIds.has(task.id)
  )), [scheduledTaskIds, tasks]);
  const focusBlock = useMemo(() => todayBlocks.find(block => !block.completedAt && new Date(block.startAt).getTime() <= now && new Date(block.endAt).getTime() > now)
    ?? todayBlocks.find(block => !block.completedAt && new Date(block.startAt).getTime() > now), [now, todayBlocks]);
  const incompleteScheduledTaskIds = useMemo(() => new Set(todayBlocks
    .filter(block => !block.completedAt)
    .map(block => block.taskId)
    .filter((taskId): taskId is string => Boolean(taskId))), [todayBlocks]);
  const slipped = useMemo(() => tasks.filter(task => !task.completedAt && !task.deletedAt && !task.parentId && (
    Boolean(task.deadline?.date && task.deadline.date <= today) || incompleteScheduledTaskIds.has(task.id)
  )), [incompleteScheduledTaskIds, tasks, today]);
  const capacity = Math.max(1, workHoursPerDay * 60);
  const overbooked = planned > capacity;

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsedSeconds(value => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    setRunning(false);
    setElapsedSeconds(0);
  }, [focusBlock?.id]);

  const persistedActual = focusBlock ? (focusBlock.actualMin ?? 0) + Math.floor(elapsedSeconds / 60) : 0;
  const persistFocus = async (complete = false) => {
    if (!focusBlock || !onUpdateTimeBlock) return;
    const actualMin = (focusBlock.actualMin ?? 0) + Math.ceil(elapsedSeconds / 60);
    await onUpdateTimeBlock(focusBlock.id, { actualMin, ...(complete ? { completedAt: new Date().toISOString() } : {}) });
    setRunning(false);
    setElapsedSeconds(0);
  };

  return (
    <section className="px-3 pb-3" data-testid="planning-ceremony">
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-0.5" role="tablist" aria-label={t('calendar.ceremony.label')}>
        {(['plan', 'focus', 'shutdown'] as const).map(item => (
          <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)} className={cn('rounded-md px-1 py-1.5 text-[0.68rem] font-medium', mode === item && 'bg-background text-foreground shadow-sm')}>
            {t(`calendar.ceremony.tabs.${item}`)}
          </button>
        ))}
      </div>

      {mode === 'plan' && (
        <div className="space-y-1.5 text-xs text-muted-foreground" data-testid="ceremony-plan">
          <div className="flex items-center justify-between"><span>{t('calendar.ceremony.timeBlocked')}</span><strong className={cn('text-foreground', overbooked && 'text-destructive')}>{hours(planned)} / {workHoursPerDay}h</strong></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full bg-primary', overbooked && 'bg-destructive')} style={{ width: `${Math.min(100, planned / capacity * 100)}%` }} /></div>
          <div className="flex items-center justify-between"><span>{t('calendar.ceremony.remainingCapacity')}</span><span>{hours(Math.max(0, capacity - planned))}</span></div>
          <div className="flex items-center justify-between"><span>{t('calendar.ceremony.unscheduled')}</span><span>{unscheduled.length} · {hours(unscheduled.reduce((sum, task) => sum + (task.estimateMin ?? 0), 0))}</span></div>
          {overbooked && <p role="alert" className="m-0 rounded bg-destructive/10 px-2 py-1 text-destructive">{t('calendar.ceremony.overcommitted', { duration: hours(planned - capacity) })}</p>}
        </div>
      )}

      {mode === 'focus' && (
        <div className="space-y-2 text-xs" data-testid="ceremony-focus">
          {focusBlock ? <>
            <div><span className="text-muted-foreground">{new Date(focusBlock.startAt).getTime() <= now ? t('calendar.ceremony.currentBlock') : t('calendar.ceremony.nextBlock')}</span><strong className="mt-0.5 block truncate">{focusBlock.taskId ? taskMap.get(focusBlock.taskId)?.title ?? t('calendar.ceremony.scheduledTask') : t('calendar.ceremony.focusBlock')}</strong></div>
            <div className="flex items-center justify-between"><span className="font-mono text-lg tabular-nums">{timerText(elapsedSeconds)}</span><span className="text-muted-foreground">{t('calendar.ceremony.actualMinutes', { count: persistedActual })}</span></div>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" className="rounded-control border border-border px-2 py-1.5 hover:bg-muted" onClick={() => running ? void persistFocus() : setRunning(true)}>{running ? t('calendar.ceremony.pause') : t('calendar.ceremony.start')}</button>
              <button type="button" className="rounded-control bg-primary px-2 py-1.5 text-primary-foreground" onClick={() => void persistFocus(true)}>{t('calendar.ceremony.complete')}</button>
            </div>
          </> : <p className="m-0 text-muted-foreground">{t('calendar.ceremony.noFocusBlock')}</p>}
        </div>
      )}

      {mode === 'shutdown' && (
        <div className="space-y-1.5 text-xs text-muted-foreground" data-testid="ceremony-shutdown">
          <div className="flex items-center justify-between"><span>{t('calendar.ceremony.plannedActual')}</span><strong className="text-foreground">{hours(planned)} / {hours(actual)}</strong></div>
          <div className="flex items-center justify-between"><span>{t('calendar.ceremony.slippedTasks')}</span><span>{slipped.length}</span></div>
          {slipped.length > 1 && <button type="button" onClick={() => void onMoveAllTomorrow?.(slipped)} className="w-full rounded-control bg-primary px-2 py-1.5 font-medium text-primary-foreground">{t('calendar.ceremony.moveAllTomorrow')}</button>}
          {slipped.slice(0, 4).map(task => <button key={task.id} type="button" onClick={() => void onMoveTomorrow?.(task)} className="block w-full truncate rounded px-1.5 py-1 text-left hover:bg-muted">{t('calendar.ceremony.moveTomorrow', { title: task.title })}</button>)}
          {!slipped.length && <p className="m-0 rounded bg-primary/10 px-2 py-1 text-foreground">{t('calendar.ceremony.cleanShutdown')}</p>}
        </div>
      )}
    </section>
  );
}
