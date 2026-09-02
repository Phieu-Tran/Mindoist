import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Countdown, Task, UpdateTaskRequest } from '@mindoist/shared/types';
import type { GCalEvent } from '../hooks/useApi';
import { cn } from '@/lib/utils';
import { CalendarHeader } from './CalendarHeader';
import { CalendarToolbar, type CalendarViewType } from './CalendarToolbar';
import { CalendarGridView } from '@/features/calendar/grid';
import { dayKey, monthDates, threeDayDates, weekDates, workWeekDates } from '@/features/calendar/grid/time-grid';
import { createTimeBlock, updateTimeBlock } from '@/features/calendar/api';
import type { CalendarProjection } from '@/features/calendar/projection';
import { useCalendarProjection } from '@/features/calendar/use-calendar-projection';
import { CALENDAR_PROJECTION_REFRESH_EVENT } from '@/features/calendar/calendar-refresh';
import { CalendarPlanningPanel } from '@/features/calendar/CalendarPlanningPanel';
import './CalendarView.css';

export interface CalendarTaskSlot {
  title?: string;
  projectId?: string;
  color?: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  startAt?: string;
  endAt?: string;
  allDay: boolean;
}

interface Props {
  tasks: Task[];
  todayTasks?: Task[];
  backlogTasks?: Task[];
  projects?: { id: string; name: string; color?: string | null }[];
  gcalEvents?: GCalEvent[];
  countdowns?: Countdown[];
  onSelectTask: (task: Task) => void;
  onCreateTask: (slot: CalendarTaskSlot) => Promise<void> | void;
  onUpdateTask: (id: string, req: UpdateTaskRequest) => Promise<unknown> | void;
  workHoursPerDay?: number;
  onNavigateSearch?: (search: { view: 'day' | '3day' | '5day' | 'week' | 'month'; date: string; plan: boolean }, replace: boolean) => void;
}

const URL_PARAM_BY_VIEW: Record<CalendarViewType, string> = {
  dayGridMonth: 'month',
  timeGridWeek: 'week',
  timeGrid5Day: '5day',
  timeGrid3Day: '3day',
  timeGridDay: 'day',
};

const VIEW_BY_URL_PARAM: Record<string, CalendarViewType> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  '5day': 'timeGrid5Day',
  '3day': 'timeGrid3Day',
  day: 'timeGridDay',
};

function dateFromSearch(value: string | null): Date {
  const fallback = new Date();
  fallback.setHours(0, 0, 0, 0);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  return Number.isNaN(result.getTime()) ? fallback : result;
}

function viewDates(view: CalendarViewType, anchor: Date): Date[] {
  if (view === 'dayGridMonth') return monthDates(anchor);
  if (view === 'timeGridWeek') return weekDates(anchor);
  if (view === 'timeGrid5Day') return workWeekDates(anchor);
  if (view === 'timeGrid3Day') return threeDayDates(anchor);
  return [new Date(anchor)];
}

function viewTitle(view: CalendarViewType, anchor: Date, dates: Date[]): string {
  if (view === 'dayGridMonth') return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (dates.length === 1) return dates[0].toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const first = dates[0];
  const last = dates.at(-1)!;
  return `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function moveAnchor(anchor: Date, view: CalendarViewType, direction: -1 | 1): Date {
  const next = new Date(anchor);
  if (view === 'dayGridMonth') next.setMonth(next.getMonth() + direction, 1);
  else next.setDate(next.getDate() + direction * (view === 'timeGridWeek' || view === 'timeGrid5Day' ? 7 : view === 'timeGrid3Day' ? 3 : 1));
  return next;
}

export function CalendarView({
  tasks,
  todayTasks = [],
  backlogTasks = [],
  projects = [],
  gcalEvents = [],
  countdowns = [],
  onSelectTask,
  onCreateTask,
  onUpdateTask,
  workHoursPerDay = 8,
  onNavigateSearch,
}: Props) {
  const { t } = useTranslation('tasks');
  const initialSearch = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState<CalendarViewType>(() => VIEW_BY_URL_PARAM[initialSearch.get('view') ?? ''] ?? 'timeGridWeek');
  const [anchorDate, setAnchorDate] = useState(() => dateFromSearch(initialSearch.get('date')));
  const [panelOpen, setPanelOpen] = useState(() => initialSearch.get('plan') === '1' || initialSearch.get('plan') === 'true');
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const dates = useMemo(() => viewDates(view, anchorDate), [anchorDate, view]);
  const taskMap = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const projectionRange = useMemo(() => {
    const from = dates[0];
    const to = new Date(dates.at(-1)!);
    to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [dates]);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { projection, error: projectionLoadError, refetch: refetchProjection, setProjection } = useCalendarProjection(
    projectionRange.from,
    projectionRange.to,
    timeZone,
  );

  const writeSearch = useCallback((nextView: CalendarViewType, nextDate: Date, nextPanel: boolean, push = true) => {
    const search = { view: URL_PARAM_BY_VIEW[nextView] as 'day' | '3day' | '5day' | 'week' | 'month', date: dayKey(nextDate), plan: nextPanel };
    if (onNavigateSearch) {
      onNavigateSearch(search, !push);
      localStorage.setItem('mindoist:calendar:view', nextView);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('view', search.view);
    url.searchParams.set('date', search.date);
    url.searchParams.set('plan', String(search.plan));
    url.searchParams.delete('engine');
    window.history[push ? 'pushState' : 'replaceState']({}, '', `${url.pathname}${url.search}`);
    localStorage.setItem('mindoist:calendar:view', nextView);
  }, [onNavigateSearch]);

  const loadProjection = useCallback(async () => {
    setProjectionError(null);
    const result = await refetchProjection();
    if (result.error) setProjectionError(result.error instanceof Error ? result.error.message : t('calendar.projectionLoadFailed'));
  }, [refetchProjection, t]);

  useEffect(() => {
    window.addEventListener(CALENDAR_PROJECTION_REFRESH_EVENT, loadProjection);
    return () => window.removeEventListener(CALENDAR_PROJECTION_REFRESH_EVENT, loadProjection);
  }, [loadProjection]);
  useEffect(() => {
    const onPopState = () => {
      const search = new URLSearchParams(window.location.search);
      setView(VIEW_BY_URL_PARAM[search.get('view') ?? ''] ?? 'timeGridWeek');
      setAnchorDate(dateFromSearch(search.get('date')));
      setPanelOpen(search.get('plan') === 'true' || search.get('plan') === '1');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const replaceBlock = useCallback((block: CalendarProjection['timeBlocks'][number]) => {
    setProjection(current => current ? { ...current, timeBlocks: current.timeBlocks.map(candidate => candidate.id === block.id ? block : candidate) } : current);
  }, []);

  const handleTaskDrop = useCallback(async (taskId: string, day: Date, startMinutes: number, allDay: boolean) => {
    const task = taskMap.get(taskId);
    if (!task) return;
    const start = new Date(day);
    start.setHours(allDay ? 0 : Math.floor(startMinutes / 60), allDay ? 0 : startMinutes % 60, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + (allDay ? 24 * 60 : task.estimateMin && task.estimateMin > 0 ? task.estimateMin : 30));
    const now = new Date().toISOString();
    const optimisticId = `optimistic-${taskId}-${Date.now()}`;
    const optimistic: CalendarProjection['timeBlocks'][number] = {
      id: optimisticId,
      userId: task.userId,
      taskId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      allDay,
      source: 'MANUAL',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    setProjectionError(null);
    setProjection(current => current ? { ...current, timeBlocks: [...current.timeBlocks, optimistic] } : current);
    try {
      const created = await createTimeBlock({ taskId, startAt: optimistic.startAt, endAt: optimistic.endAt, timeZone: optimistic.timeZone, allDay, source: 'MANUAL' });
      setProjection(current => current ? { ...current, timeBlocks: current.timeBlocks.map(block => block.id === optimisticId ? created : block) } : current);
    } catch {
      setProjection(current => current ? { ...current, timeBlocks: current.timeBlocks.filter(block => block.id !== optimisticId) } : current);
      setProjectionError(t('calendar.plannedTimeCreateFailed'));
    }
  }, [t, taskMap]);

  const handleBlockMove = useCallback(async (blockId: string, day: Date, startMinutes: number) => {
    const block = projection?.timeBlocks.find(candidate => candidate.id === blockId);
    if (!block) return;
    const duration = new Date(block.endAt).getTime() - new Date(block.startAt).getTime();
    const start = new Date(day);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const optimistic = { ...block, startAt: start.toISOString(), endAt: new Date(start.getTime() + duration).toISOString(), timeZone: block.timeZone, allDay: false, updatedAt: new Date().toISOString() };
    setProjectionError(null);
    replaceBlock(optimistic);
    try {
      replaceBlock(await updateTimeBlock(blockId, { startAt: optimistic.startAt, endAt: optimistic.endAt, timeZone: block.timeZone, allDay: false }));
    } catch {
      replaceBlock(block);
      setProjectionError(t('calendar.changeSaveFailed'));
    }
  }, [projection?.timeBlocks, replaceBlock, t]);

  const handleBlockResize = useCallback(async (blockId: string, endMinutes: number) => {
    const block = projection?.timeBlocks.find(candidate => candidate.id === blockId);
    if (!block) return;
    const start = new Date(block.startAt);
    const end = new Date(start);
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
    if (end <= start) end.setMinutes(start.getMinutes() + 15);
    const optimistic = { ...block, endAt: end.toISOString(), allDay: false, updatedAt: new Date().toISOString() };
    setProjectionError(null);
    replaceBlock(optimistic);
    try {
      replaceBlock(await updateTimeBlock(blockId, { startAt: block.startAt, endAt: optimistic.endAt, timeZone: block.timeZone, allDay: false }));
    } catch {
      replaceBlock(block);
      setProjectionError(t('calendar.resizeSaveFailed'));
    }
  }, [projection?.timeBlocks, replaceBlock, t]);

  const handleBlockProgress = useCallback(async (blockId: string, request: Parameters<typeof updateTimeBlock>[1]) => {
    const block = projection?.timeBlocks.find(candidate => candidate.id === blockId);
    if (!block) return;
    const optimistic = { ...block, ...request, updatedAt: new Date().toISOString() };
    setProjectionError(null);
    replaceBlock(optimistic);
    try {
      replaceBlock(await updateTimeBlock(blockId, request));
    } catch {
      replaceBlock(block);
      setProjectionError(t('calendar.changeSaveFailed'));
    }
  }, [projection?.timeBlocks, replaceBlock, t]);

  const handleMoveDeadline = useCallback(async (taskId: string, date: string, time: string | null) => {
    const task = taskMap.get(taskId);
    if (!task) return;
    const deadlineTime = time ?? task.deadline?.time;
    await onUpdateTask(taskId, { deadline: { date, ...(deadlineTime ? { time: deadlineTime, timeZone: task.deadline?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC' } : {}) } });
    setProjection(current => current ? { ...current, deadlines: current.deadlines.map(deadline => deadline.taskId === taskId ? { ...deadline, date, time: deadlineTime ?? null } : deadline) } : current);
  }, [onUpdateTask, taskMap]);

  const changeView = useCallback((nextView: CalendarViewType) => {
    setView(nextView);
    writeSearch(nextView, anchorDate, panelOpen);
  }, [anchorDate, panelOpen, writeSearch]);
  const navigate = useCallback((direction: -1 | 1) => {
    const next = moveAnchor(anchorDate, view, direction);
    setAnchorDate(next);
    writeSearch(view, next, panelOpen);
  }, [anchorDate, panelOpen, view, writeSearch]);
  const goToday = useCallback(() => {
    const next = new Date();
    setAnchorDate(next);
    writeSearch(view, next, panelOpen);
  }, [panelOpen, view, writeSearch]);
  const togglePanel = useCallback(() => {
    setPanelOpen(current => {
      writeSearch(view, anchorDate, !current);
      return !current;
    });
  }, [anchorDate, view, writeSearch]);

  return (
    <div className={cn('calendar-layout flex h-full min-h-0 gap-3', panelOpen && 'calendar-layout-plan-open')}>
      {panelOpen && <CalendarPlanningPanel tasks={tasks} todayTasks={todayTasks} backlogTasks={backlogTasks} projects={projects} timeBlocks={projection?.timeBlocks ?? []} workHoursPerDay={workHoursPerDay} onSelectTask={onSelectTask} onUpdateTask={onUpdateTask} onUpdateTimeBlock={handleBlockProgress} />}
      <div className="calendar-canvas flex min-w-0 flex-1 flex-col">
        <div className="calendar-view">
          <CalendarHeader panelOpen={panelOpen} togglePanel={togglePanel} hasGcalEvents={gcalEvents.length > 0} />
          <span className="sr-only">{t('calendar.timelineHint')}</span>
          <CalendarToolbar
            title={viewTitle(view, anchorDate, dates)}
            view={view}
            todayDisabled={dates.some(date => dayKey(date) === dayKey(new Date()))}
            onPrev={() => navigate(-1)}
            onNext={() => navigate(1)}
            onToday={goToday}
            onChangeView={changeView}
          />
          {(projectionError || projectionLoadError) && <div role="alert" className="mb-2 flex items-center justify-between rounded-control bg-destructive/10 px-3 py-2 text-xs text-destructive"><span>{projectionError || (projectionLoadError instanceof Error ? projectionLoadError.message : t('calendar.projectionLoadFailed'))}</span><button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => { setProjectionError(null); void loadProjection(); }}>{t('calendar.retry')}</button></div>}
          <CalendarGridView
            anchorDate={anchorDate}
            projection={projection}
            tasks={tasks}
            projects={projects}
            gcalEvents={gcalEvents}
            countdowns={countdowns}
            view={view}
            onSelectTask={onSelectTask}
            onCreateTask={onCreateTask}
            onTaskDrop={handleTaskDrop}
            onBlockMove={handleBlockMove}
            onBlockResize={handleBlockResize}
            onMoveDeadline={handleMoveDeadline}
          />
        </div>
      </div>
    </div>
  );
}
