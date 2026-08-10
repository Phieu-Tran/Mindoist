import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, {
  Draggable,
  type DropArg,
  type EventResizeDoneArg,
} from '@fullcalendar/interaction';
import type { EventApi, EventInput, EventContentArg, DateSelectArg, EventDropArg, EventMountArg, DatesSetArg, DayHeaderContentArg } from '@fullcalendar/core';
import type { Countdown, Task, UpdateTaskRequest } from '@mindoist/shared/types';
import type { GCalEvent } from '../hooks/useApi';
import { isTaskColor, taskColorClass } from '@/lib/task-colors';
import { cn } from '@/lib/utils';
import { Progress } from './ui/progress';
import { CalendarHeader } from './CalendarHeader';
import { CalendarToolbar, type CalendarViewType } from './CalendarToolbar';
import { CalendarEventCard } from './CalendarEventCard';
import { CalendarDayCountdown } from './CalendarDayCountdown';
import { featureFlags } from '@/lib/feature-flags';
import {
  createTimeBlock,
  getCalendarProjection,
  updateTimeBlock,
} from '@/features/calendar/api';
import {
  calendarProjectionToEvents,
  taskRangeToEvent,
  type CalendarProjection,
  type DeadlineProjection,
} from '@/features/calendar/projection';
import './CalendarView.css';

interface Props {
  tasks: Task[];
  todayTasks?: Task[];
  backlogTasks?: Task[];
  projects?: { id: string; name: string; color?: string | null }[];
  gcalEvents?: GCalEvent[];
  countdowns?: Countdown[];
  onSelectTask: (task: Task) => void;
  onCreateTask: (date: string, time?: string) => void;
  onUpdateTask: (id: string, req: UpdateTaskRequest) => Promise<unknown> | void;
  workHoursPerDay?: number;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function taskToEvent(task: Task): EventInput | null {
  const deadlineDate = task.deadline?.date ?? task.dueDate?.slice(0, 10);
  if (!deadlineDate) return null;

  const dateStr = deadlineDate;
  const dueTime = task.deadline?.time ?? task.dueTime;
  const hasTime = Boolean(dueTime);

  const priorityColor: Record<number, string> = {
    1: 'var(--color-p1)',
    2: 'var(--color-p2)',
    3: 'var(--color-p3)',
    4: 'var(--color-p4)',
  };
  const defaultColor = 'var(--muted-foreground)';
  const validPriority = task.priority != null && task.priority >= 1 && task.priority <= 4 ? task.priority : null;
  const customColor = isTaskColor(task.color) ? task.color : null;
  const priorityClass = validPriority
    ? `calendar-priority-event-p${validPriority}`
    : 'calendar-priority-event-none';
  const colorClass = taskColorClass(customColor);
  const eventColor = customColor ? 'var(--task-color-accent)' : validPriority ? priorityColor[validPriority] : defaultColor;
  const completedClass = task.completedAt ? ['calendar-task-event-completed'] : [];
  const visualClasses = customColor
    ? ['calendar-task-event', colorClass, ...completedClass]
    : ['calendar-task-event', priorityClass, colorClass, ...completedClass];
  const visualProps = customColor
    ? { colorClass }
    : { priorityClass, colorClass };

  let end: string | undefined;
  if (hasTime && task.durationMin && task.durationMin > 0) {
    const endDate = new Date(`${dateStr}T${dueTime}:00`);
    endDate.setMinutes(endDate.getMinutes() + task.durationMin);
    end = `${dateToLocalISO(endDate)}T${timeFromDate(endDate)}:00`;
  }

  return {
    id: `task-${task.id}`,
    title: task.title,
    start: hasTime ? `${dateStr}T${dueTime}:00` : dateStr,
    end,
    allDay: !hasTime,
    color: eventColor,
    classNames: visualClasses,
    extendedProps: { task, source: 'mindoist', ...visualProps },
  };
}

function countdownToEvent(countdown: Countdown): EventInput {
  const target = new Date(countdown.targetDate);
  // A countdown saved without a time is stored as exact UTC midnight -
  // checking UTC hours (not local) is what tells "no time set" apart from
  // a chosen time that happens to be local midnight.
  const hasTime = target.getUTCHours() !== 0 || target.getUTCMinutes() !== 0 || target.getUTCSeconds() !== 0;
  return {
    id: `countdown-${countdown.id}`,
    title: countdown.title,
    start: hasTime ? target : countdown.targetDate.slice(0, 10),
    allDay: !hasTime,
    classNames: ['calendar-task-event', taskColorClass(countdown.color)],
    editable: false,
    extendedProps: { source: 'countdown', countdown },
  };
}

function gcalToEvent(ev: GCalEvent): EventInput {
  const isAllDay = ev.start.length === 10;
  return {
    id: `gcal-${ev.id}`,
    title: ev.title,
    start: ev.start,
    end: ev.end || undefined,
    allDay: isAllDay,
    color: 'var(--muted-foreground)',
    borderColor: 'var(--border)',
    classNames: ['calendar-google-event'],
    editable: false,
    extendedProps: { source: 'google', readOnly: true, provider: 'google' },
  };
}

function dateToLocalISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calendarEventLabel(event: EventApi, t: TFunction): string | null {
  const task = event.extendedProps.task as Task | undefined;
  const deadline = event.extendedProps.deadline as DeadlineProjection | undefined;
  if (event.extendedProps.source === 'google') {
    const date = event.start
      ? `${dateToLocalISO(event.start)}${event.allDay ? '' : ` · ${timeFromDate(event.start)}`}`
      : '';
    return `${event.title} · ${t('calendar.google')} · ${t('calendar.readOnly')}${date ? ` · ${date}` : ''}`;
  }
  if (event.extendedProps.source !== 'mindoist' || (!task && !deadline)) return null;
  const kind = event.extendedProps.kind as string | undefined;
  const priorityValue = task?.priority ?? deadline?.priority;
  const priority = priorityValue != null && priorityValue >= 1 && priorityValue <= 4
    ? `P${priorityValue}`
    : '';
  const date = kind === 'taskRange'
    ? `${deadline?.startDate ?? task?.startDate?.slice(0, 10) ?? ''} – ${deadline?.date ?? task?.deadline?.date ?? task?.dueDate?.slice(0, 10) ?? ''}`
    : event.start
      ? `${dateToLocalISO(event.start)}${event.allDay ? '' : ` · ${timeFromDate(event.start)}`}`
      : '';
  const kindLabel = kind === 'timeBlock'
    ? t('calendar.plannedTime')
    : kind === 'taskRange'
      ? t('calendar.dateRange')
      : t('calendar.deadline');
  return kind
    ? `${task?.title ?? deadline?.title}${priority ? ` · ${priority}` : ''} · ${kindLabel} · ${date}`
    : `${task?.title ?? deadline?.title}${priority ? ` · ${priority}` : ''} · ${
        task?.dueDate?.slice(0, 10) ?? deadline?.date ?? ''
      }${task?.dueTime ? ` · ${task.dueTime}` : ''}`;
}

function refreshEventAccessibility(element: HTMLElement, event: EventApi, t: TFunction): void {
  const label = calendarEventLabel(event, t);
  if (!label) return;
  element.setAttribute('aria-label', label);
  element.setAttribute('title', label);
  const tooltip = element.querySelector<HTMLElement>('.calendar-event-tooltip');
  if (tooltip) tooltip.textContent = label;
}

function timeFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Tailwind's build-time scanner needs each arbitrary-value class to appear
// as a complete, static string somewhere in the source - a template
// literal like `border-l-[var(--color-p${priority})]` is invisible to it,
// so no CSS ever gets generated for it and the border silently falls back
// to the default. Spelling out all 4 variants here keeps them scannable.
const priorityBorderClass: Record<number, string> = {
  1: 'border-l-[var(--color-p1)]',
  2: 'border-l-[var(--color-p2)]',
  3: 'border-l-[var(--color-p3)]',
  4: 'border-l-[var(--color-p4)]',
};

function panelItemColorClass(task: Task): string {
  // `task-color-${task.color}` only defines --task-color-accent; without an
  // explicit border-l color every custom-colored task fell back to the same
  // default border, so the Today/Backlog panel never actually showed each
  // task's chosen color (unlike the priority branch below, which already
  // set its border color explicitly).
  if (isTaskColor(task.color)) return `border-l-4 border-l-[var(--task-color-accent)] task-color-${task.color}`;
  if (task.priority != null && task.priority >= 1 && task.priority <= 4) {
    return `border-l-4 ${priorityBorderClass[task.priority]}`;
  }
  return 'border-l-4 border-l-muted-foreground/30';
}

function formatDuration(min: number | null): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`;
}

// Auto-scroll Week/Day view to roughly the current time (an hour of
// context above "now") instead of a fixed 8am, computed once at mount -
// scrollTimeReset stays false below so navigating between weeks doesn't
// keep resetting the scroll position back to this.
function initialScrollTime(): string {
  const hour = Math.max(0, new Date().getHours() - 1);
  return `${String(hour).padStart(2, '0')}:00:00`;
}

// Centers the visible window on `currentDate` instead of FullCalendar's
// default of anchoring it at the start — Today should sit in the middle of
// a 3/5-day strip (Akiflow-style), not at the left edge.
function centeredRange(daysBefore: number, daysAfter: number) {
  return (currentDate: Date) => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - daysBefore);
    const end = new Date(currentDate);
    end.setDate(end.getDate() + daysAfter);
    return { start, end };
  };
}

// The 3- and 5-day grids are custom durations on top of FullCalendar's
// timeGrid; week and day are its built-ins at 7 and 1 day. Declared here so
// the URL param, localStorage value, and toolbar all agree on one set.
// `duration` is kept alongside `visibleRange` purely so prev/next still page
// by a full window (it drives `dateIncrement`); `visibleRange` is what
// actually centers the rendered days on the current date.
const CUSTOM_VIEWS = {
  timeGrid3Day: { type: 'timeGrid', duration: { days: 3 }, visibleRange: centeredRange(1, 2) },
  timeGrid5Day: { type: 'timeGrid', duration: { days: 5 }, visibleRange: centeredRange(2, 3) },
} as const;

const URL_PARAM_BY_VIEW: Record<CalendarViewType, string> = {
  dayGridMonth: 'month',
  timeGridWeek: 'week',
  timeGrid5Day: '5day',
  timeGrid3Day: '3day',
  timeGridDay: 'day',
};

const VIEW_BY_URL_PARAM: Record<string, CalendarViewType | undefined> = Object.fromEntries(
  Object.entries(URL_PARAM_BY_VIEW).map(([view, param]) => [param, view as CalendarViewType]),
);

function isCalendarViewType(value: string): value is CalendarViewType {
  return value in URL_PARAM_BY_VIEW;
}

export function CalendarView({ tasks, todayTasks = [], backlogTasks = [], projects = [], gcalEvents = [], countdowns = [], onSelectTask, onCreateTask, onUpdateTask, workHoursPerDay = 8 }: Props) {
  const { t } = useTranslation('tasks');
  const calendarRef = useRef<FullCalendar>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [projection, setProjection] = useState<CalendarProjection | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('plan') === '1' || (params.get('plan') === null && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches);
  });

  const togglePanel = useCallback(() => {
    setPanelOpen(prev => {
      const next = !prev;
      const url = new URL(window.location.href);
      if (next) url.searchParams.set('plan', '1');
      else url.searchParams.set('plan', '0');
      window.history.pushState({}, '', `${url.pathname}${url.search}`);
      return next;
    });
  }, []);

  // FullCalendar sizes its internal table on mount/window-resize, but toggling
  // the side panel changes this container's width via a sibling flex item
  // shrinking — no window resize event fires, so without this the day columns
  // keep their stale (wider) pixel widths and overflow past the now-narrower
  // card. requestAnimationFrame lets the panel's layout change land first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      calendarRef.current?.getApi().updateSize();
    });
    return () => cancelAnimationFrame(raf);
  }, [panelOpen]);

  useEffect(() => {
    if (!featureFlags.calendarV2 || !panelOpen || !panelRef.current) return;
    const draggable = new Draggable(panelRef.current, {
      itemSelector: '[data-calendar-backlog-task]',
      eventData: element => ({
        title: element.dataset.taskTitle || '',
        create: false,
      }),
    });
    return () => draggable.destroy();
  }, [panelOpen]);

  const projectMap = useMemo(
    () => new Map(projects.map(project => [project.id, project])),
    [projects],
  );
  const taskMap = useMemo(
    () => new Map(tasks.map(task => [task.id, task])),
    [tasks],
  );

  // Backlog grouped by project — tasks with no project ("Inbox") always first,
  // then one section per project (alphabetical). Groups carry a startIdx so
  // the flat keyboard-nav index below stays in sync with the grouped render.
  const backlogGroups = useMemo(() => {
    const map = new Map<string, { projectId: string | null; label: string; tasks: Task[] }>();
    for (const task of backlogTasks) {
      const key = task.projectId ?? '__inbox__';
      if (!map.has(key)) {
        const label = task.projectId
          ? projectMap.get(task.projectId)?.name ?? task.projectId
          : t('sidebar.inbox');
        map.set(key, { projectId: task.projectId, label, tasks: [] });
      }
      map.get(key)!.tasks.push(task);
    }
    const groups = Array.from(map.values()).sort((a, b) => {
      if (a.projectId === null) return -1;
      if (b.projectId === null) return 1;
      return a.label.localeCompare(b.label);
    });
    let cursor = 0;
    return groups.map(g => {
      const startIdx = cursor;
      cursor += g.tasks.length;
      return { ...g, startIdx };
    });
  }, [backlogTasks, projectMap, t]);

  const overdueTasks = useMemo(() => {
    const today = todayISO();
    return tasks
      .filter(task => {
        const deadlineDate = task.deadline?.date ?? task.dueDate?.slice(0, 10);
        return !task.completedAt && Boolean(deadlineDate && deadlineDate < today);
      })
      .sort((left, right) => {
        const leftDate = left.deadline?.date ?? left.dueDate?.slice(0, 10) ?? '';
        const rightDate = right.deadline?.date ?? right.dueDate?.slice(0, 10) ?? '';
        return leftDate.localeCompare(rightDate);
      });
  }, [tasks]);

  // B2.18 — keyboard navigation in panel (order must match the grouped render below)
  const panelTasks = useMemo(
    () => [...todayTasks, ...overdueTasks, ...backlogGroups.flatMap(g => g.tasks)],
    [todayTasks, overdueTasks, backlogGroups]
  );
  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    if (!panelOpen || panelTasks.length === 0) { setFocusedIndex(-1); return; }
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(panelTasks.length - 1, prev + 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < panelTasks.length) {
        e.preventDefault();
        onSelectTask(panelTasks[focusedIndex]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [panelOpen, panelTasks, focusedIndex, onSelectTask]);

  const loadProjection = useCallback(async (from: Date, to: Date) => {
    if (!featureFlags.calendarV2) return;
    setProjectionError(null);
    try {
      setProjection(await getCalendarProjection(from.toISOString(), to.toISOString()));
    } catch (cause) {
      setProjectionError(
        cause instanceof Error ? cause.message : t('calendar.projectionLoadFailed'),
      );
    }
  }, [t]);

  const countdownEvents = useMemo(
    () => countdowns.filter(c => c.showInCalendar).map(countdownToEvent),
    [countdowns],
  );

  const events = useMemo(() => {
    if (featureFlags.calendarV2 && projection) {
      const projected = calendarProjectionToEvents(projection, tasks, projects);
      // External provider events still arrive through the legacy Google read
      // path until R6 moves them behind CalendarProvider.
      return [...projected, ...gcalEvents.map(gcalToEvent), ...countdownEvents];
    }
    const taskEvents = tasks.flatMap<EventInput>(task => {
      const range = taskRangeToEvent(task, projects);
      const deadline = taskToEvent(task);
      if (!range) return deadline ? [deadline] : [];

      // Keep a timed deadline as a precise moment as well as the continuous
      // range. A date-only deadline is already expressed by the range edge.
      const dueTime = task.deadline?.time ?? task.dueTime;
      return dueTime && deadline ? [range, deadline] : [range];
    });
    const gcalMapped = gcalEvents.map(gcalToEvent);
    return [...taskEvents, ...gcalMapped, ...countdownEvents];
  }, [countdownEvents, gcalEvents, projection, projects, tasks]);

  // B2.17 — progress bar calculation (workHoursPerDay now a user setting, see Props)
  const plannedMinutes = useMemo(() => {
    return todayTasks.reduce((sum, task) => sum + (task.durationMin || 0), 0);
  }, [todayTasks]);
  const plannedPct = Math.round((plannedMinutes / (workHoursPerDay * 60)) * 100);
  const isOverPlanned = plannedPct > 100;

  const handleEventClick = useCallback((info: { event: { extendedProps: { task?: Task; source?: string } } }) => {
    if (info.event.extendedProps.source === 'mindoist' && info.event.extendedProps.task) {
      onSelectTask(info.event.extendedProps.task);
    }
  }, [onSelectTask]);

  const handleEventDrop = useCallback(async (info: EventDropArg) => {
    if (!info.event.start) return;
    const kind = info.event.extendedProps.kind as string | undefined;

    try {
      if (featureFlags.calendarV2 && kind === 'timeBlock') {
        const block = info.event.extendedProps.timeBlock;
        const previousDuration =
          new Date(block.endAt).getTime() - new Date(block.startAt).getTime();
        const end = info.event.end ?? new Date(info.event.start.getTime() + previousDuration);
        const updated = await updateTimeBlock(block.id, {
          startAt: info.event.start.toISOString(),
          endAt: end.toISOString(),
          timeZone: block.timeZone,
          allDay: info.event.allDay,
        });
        setProjection(previous => previous
          ? {
              ...previous,
              timeBlocks: previous.timeBlocks.map(candidate =>
                candidate.id === updated.id ? updated : candidate,
              ),
            }
          : previous);
        refreshEventAccessibility(info.el, info.event, t);
        return;
      }

      const task = info.event.extendedProps.task as Task | undefined;
      if (!task) return;
      const newDate = dateToLocalISO(info.event.start);
      const newTime = info.event.allDay ? null : timeFromDate(info.event.start);
      if (featureFlags.calendarV2 && kind === 'deadline') {
        const timeZone =
          task.deadline?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        await onUpdateTask(task.id, {
          deadline: {
            date: newDate,
            ...(newTime ? { time: newTime, timeZone } : {}),
          },
          dueDate: newDate,
          dueTime: newTime,
        });
        setProjection(previous => previous
          ? {
              ...previous,
              deadlines: previous.deadlines.map(deadline =>
                deadline.taskId === task.id
                  ? { ...deadline, date: newDate, time: newTime, timeZone: newTime ? timeZone : null }
                  : deadline,
              ),
            }
          : previous);
        refreshEventAccessibility(info.el, info.event, t);
        return;
      }
      await onUpdateTask(task.id, { dueDate: newDate, dueTime: newTime });
      refreshEventAccessibility(info.el, info.event, t);
    } catch {
      info.revert();
      setProjectionError(t('calendar.changeSaveFailed'));
    }
  }, [onUpdateTask, t]);

  const handleEventResize = useCallback(async (info: EventResizeDoneArg) => {
    if (!featureFlags.calendarV2 || info.event.extendedProps.kind !== 'timeBlock') return;
    const block = info.event.extendedProps.timeBlock;
    if (!info.event.start || !info.event.end) return;
    try {
      const updated = await updateTimeBlock(block.id, {
        startAt: info.event.start.toISOString(),
        endAt: info.event.end.toISOString(),
        timeZone: block.timeZone,
        allDay: info.event.allDay,
      });
      setProjection(previous => previous
        ? {
            ...previous,
            timeBlocks: previous.timeBlocks.map(candidate =>
              candidate.id === updated.id ? updated : candidate,
            ),
          }
        : previous);
      refreshEventAccessibility(info.el, info.event, t);
    } catch {
      info.revert();
      setProjectionError(t('calendar.resizeSaveFailed'));
    }
  }, [t]);

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    const dateStr = dateToLocalISO(info.start);
    const time = info.allDay ? undefined : timeFromDate(info.start);
    onCreateTask(dateStr, time);
  }, [onCreateTask]);

  const handlePanelDragStart = useCallback((task: Task, e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-panel-task', task.id);
    e.dataTransfer.effectAllowed = 'move';
    (e.target as HTMLElement).style.userSelect = 'none';
  }, []);

  const handlePanelDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.userSelect = '';
  }, []);

  const handlePanelDrop = useCallback((task: Task, e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/x-panel-task');
    if (!draggedId || draggedId !== task.id) return;
    // Drop from backlog onto today panel → set dueDate = today
    onUpdateTask(task.id, { dueDate: todayISO(), dueTime: null });
  }, [onUpdateTask]);

  const handleCalendarDrop = useCallback(async (info: DropArg) => {
    const taskId = info.draggedEl.dataset.taskId;
    if (!taskId) return;
    const task = taskMap.get(taskId);
    if (!task) return;

    if (featureFlags.calendarV2) {
      const durationMinutes = task.durationMin && task.durationMin > 0 ? task.durationMin : 30;
      const end = info.allDay
        ? new Date(info.date.getTime() + 24 * 60 * 60 * 1_000)
        : new Date(info.date.getTime() + durationMinutes * 60 * 1_000);
      try {
        const created = await createTimeBlock({
          taskId,
          startAt: info.date.toISOString(),
          endAt: end.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          allDay: info.allDay,
          source: 'MANUAL',
        });
        setProjection(previous => previous
          ? { ...previous, timeBlocks: [...previous.timeBlocks, created] }
          : previous);
      } catch {
        setProjectionError(t('calendar.plannedTimeCreateFailed'));
      }
      return;
    }

    const newDate = dateToLocalISO(info.date);
    const newTime = info.allDay ? null : timeFromDate(info.date);
    await onUpdateTask(taskId, { dueDate: newDate, dueTime: newTime });
  }, [onUpdateTask, taskMap, t]);

  const handleEventDidMount = useCallback((info: EventMountArg) => {
    const task = info.event.extendedProps.task as Task | undefined;
    if (info.event.extendedProps.source !== 'mindoist') return;

    const label = calendarEventLabel(info.event, t)!;
    if (typeof info.event.extendedProps.identityColor === 'string') {
      info.el.style.setProperty('--calendar-identity-color', info.event.extendedProps.identityColor);
    }

    info.el.classList.add('calendar-task-event');
    if (typeof info.event.extendedProps.priorityClass === 'string') {
      info.el.classList.add(info.event.extendedProps.priorityClass);
    }
    if (typeof info.event.extendedProps.colorClass === 'string') {
      info.el.classList.add(info.event.extendedProps.colorClass);
    }
    info.el.tabIndex = 0;
    refreshEventAccessibility(info.el, info.event, t);

    if (!info.el.querySelector('.calendar-event-tooltip')) {
      const tooltip = document.createElement('span');
      tooltip.className = 'calendar-event-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.textContent = label;
      info.el.appendChild(tooltip);
    }
  }, [t]);

  const initialView = useMemo(() => {
    const saved = localStorage.getItem('mindoist:calendar:view');
    const requested = new URLSearchParams(window.location.search).get('view');
    const fromUrl = requested ? VIEW_BY_URL_PARAM[requested] : undefined;
    return fromUrl || (saved && isCalendarViewType(saved) ? saved : 'dayGridMonth');
  }, []);
  const scrollTime = useMemo(() => initialScrollTime(), []);

  // Drives the custom CalendarToolbar (see render below) - FullCalendar's
  // own headerToolbar is disabled in favor of this so nav/today/title/view
  // switch layout, spacing, and the "today" disabled state can be fully
  // controlled instead of fighting FullCalendar's generated toolbar markup.
  const [toolbarView, setToolbarView] = useState<CalendarViewType>(initialView as CalendarViewType);
  const [toolbarTitle, setToolbarTitle] = useState('');
  const [todayDisabled, setTodayDisabled] = useState(false);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    void loadProjection(info.view.currentStart, info.view.currentEnd);
    localStorage.setItem('mindoist:calendar:view', info.view.type);
    const url = new URL(window.location.href);
    const nextView = URL_PARAM_BY_VIEW[info.view.type as CalendarViewType] ?? 'month';
    const previousView = url.searchParams.get('view');
    url.searchParams.set('view', nextView);
    if (!url.searchParams.has('plan')) url.searchParams.set('plan', panelOpen ? '1' : '0');
    const target = `${url.pathname}${url.search}`;
    if (previousView && previousView !== nextView) window.history.pushState({}, '', target);
    else window.history.replaceState({}, '', target);

    setToolbarView(info.view.type as CalendarViewType);
    setToolbarTitle(info.view.title);
    const now = new Date();
    setTodayDisabled(now >= info.view.currentStart && now < info.view.currentEnd);
  }, [loadProjection, panelOpen]);

  const handleToolbarPrev = useCallback(() => calendarRef.current?.getApi().prev(), []);
  const handleToolbarNext = useCallback(() => calendarRef.current?.getApi().next(), []);
  const handleToolbarToday = useCallback(() => calendarRef.current?.getApi().today(), []);
  const handleToolbarChangeView = useCallback((view: CalendarViewType) => calendarRef.current?.getApi().changeView(view), []);

  // Month cells are too tight for a second line, so the day countdown rides
  // only on the time-grid column headers (where Akiflow shows its meter).
  const renderDayHeaderContent = useCallback((arg: DayHeaderContentArg) => {
    if (!arg.view.type.startsWith('timeGrid')) return arg.text;
    return (
      <span className="calendar-day-header">
        <span className="calendar-day-header-text">{arg.text}</span>
        <CalendarDayCountdown date={arg.date} tasks={tasks} />
      </span>
    );
  }, [tasks]);

  const renderEventContent = useCallback((arg: EventContentArg) => {
    if (!arg.event.allDay && arg.view.type.startsWith('timeGrid')) {
      return <CalendarEventCard arg={arg} />;
    }
    // Returning undefined here does NOT fall back to FullCalendar's
    // default rendering (verified: .fc-event-main rendered completely
    // empty, no title text, for every month-view/all-day event - a
    // custom eventContent callback owns rendering entirely once set, for
    // every event it's called for). Reproducing the default markup
    // ourselves (same class names FullCalendar's own default content
    // uses) so the existing .fc-event-time/.fc-event-title CSS still
    // applies to month view and the all-day row.
    return (
      <>
        {arg.timeText && <div className="fc-event-time">{arg.timeText}</div>}
        <div className="fc-event-title-container">
          <div className="fc-event-title fc-sticky">{arg.event.title}</div>
        </div>
      </>
    );
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setPanelOpen(params.get('plan') === '1');
      const requested = params.get('view');
      const nextView = (requested ? VIEW_BY_URL_PARAM[requested] : undefined) ?? 'dayGridMonth';
      const api = calendarRef.current?.getApi();
      if (api && api.view.type !== nextView) api.changeView(nextView);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className={cn('calendar-layout flex h-full min-h-0 gap-3', panelOpen && 'calendar-layout-plan-open')}>
      {/* B2.16 — Today / Backlog side panel */}
      {panelOpen && (
        <div
          ref={panelRef}
          className="calendar-panel flex w-[280px] shrink-0 flex-col overflow-hidden rounded-panel border border-border bg-card"
          onDragOver={e => e.preventDefault()}
        >
          {/* Today group — sized to its own content (capped), not stretched to
              fill the panel, so an empty/short Today doesn't starve Backlog
              of space below it. */}
          <div className="flex shrink-0 flex-col">
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-sm font-semibold">{t('calendar.panelToday')}</span>
              <span className="text-xs text-muted-foreground">{todayTasks.length}</span>
            </div>
            {/* B2.17 — progress bar */}
            <div className="px-3 pb-2">
              <Progress
                value={plannedMinutes}
                max={workHoursPerDay * 60}
                className={cn('h-1.5', isOverPlanned && '[&>div]:bg-destructive')}
              />
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                {formatDuration(plannedMinutes) || '0'} / {workHoursPerDay}h ({plannedPct}%)
                {isOverPlanned && ` — ${t('calendar.overPlanned')}`}
              </span>
            </div>
            <div className="max-h-[30vh] overflow-y-auto px-2 pb-2">
              {todayTasks.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t('calendar.panelEmptyToday')}</p>
              ) : (
                todayTasks.map((task, idx) => (
                  <div
                    key={task.id}
                    data-calendar-backlog-task
                    data-task-id={task.id}
                    data-task-title={task.title}
                    draggable
                    onDragStart={e => handlePanelDragStart(task, e)}
                    onDragEnd={handlePanelDragEnd}
                    onClick={() => onSelectTask(task)}
                    className={cn(
                      'mb-0.5 cursor-pointer truncate rounded px-2 py-1.5 text-sm hover:bg-muted/60 transition-colors',
                      panelItemColorClass(task),
                      task.completedAt && 'line-through opacity-50',
                      focusedIndex === idx && 'bg-muted ring-1 ring-ring'
                    )}
                  >
                    <span className="truncate">{task.title}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {task.dueTime || t('calendar.noTime')}
                      {task.durationMin ? ` · ${formatDuration(task.durationMin)}` : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            className="flex shrink-0 flex-col border-t border-border/70"
            data-testid="calendar-overdue-section"
          >
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <span className="text-sm font-semibold text-destructive">
                {t('calendar.panelOverdue')}
              </span>
              <span className="rounded-full bg-destructive/10 px-1.5 text-xs font-medium text-destructive">
                {overdueTasks.length}
              </span>
            </div>
            <div className="max-h-[24vh] overflow-y-auto px-2 pb-2">
              {overdueTasks.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                  {t('calendar.panelEmptyOverdue')}
                </p>
              ) : (
                overdueTasks.map((task, idx) => {
                  const deadlineDate = task.deadline?.date ?? task.dueDate?.slice(0, 10) ?? '';
                  const [, month, day] = deadlineDate.split('-');
                  return (
                    <div
                      key={task.id}
                      data-calendar-backlog-task
                      data-task-id={task.id}
                      data-task-title={task.title}
                      data-testid={`calendar-overdue-task-${task.id}`}
                      draggable
                      onDragStart={e => handlePanelDragStart(task, e)}
                      onDragEnd={handlePanelDragEnd}
                      onClick={() => onSelectTask(task)}
                      className={cn(
                        'mb-0.5 flex cursor-pointer items-center gap-2 rounded border-l-4 border-l-destructive/70 px-2 py-1.5 text-sm transition-colors hover:bg-destructive/5',
                        focusedIndex === todayTasks.length + idx && 'bg-destructive/5 ring-1 ring-ring'
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      <span className="shrink-0 text-[10px] font-medium text-destructive/80">
                        {day}/{month}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Backlog group — takes whatever vertical space Today didn't use */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-border/70">
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-sm font-semibold">{t('calendar.panelBacklog')}</span>
              <span className="text-xs text-muted-foreground">{backlogTasks.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {backlogTasks.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t('calendar.panelEmptyBacklog')}</p>
              ) : (
                backlogGroups.map(group => (
                  <div key={group.projectId ?? '__inbox__'} className="mb-1.5">
                    <div className="px-1 pb-0.5 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground/60">
                      {group.label}
                    </div>
                    {group.tasks.map((task, i) => {
                      const globalIdx = todayTasks.length + overdueTasks.length + group.startIdx + i;
                      return (
                        <div
                          key={task.id}
                          data-calendar-backlog-task
                          data-task-id={task.id}
                          data-task-title={task.title}
                          draggable
                          onDragStart={e => handlePanelDragStart(task, e)}
                          onDragEnd={handlePanelDragEnd}
                          onClick={() => onSelectTask(task)}
                          className={cn(
                            'mb-0.5 cursor-pointer truncate rounded px-2 py-1.5 text-sm hover:bg-muted/60 transition-colors',
                            panelItemColorClass(task),
                            focusedIndex === globalIdx && 'bg-muted ring-1 ring-ring'
                          )}
                        >
                          <span className="truncate">{task.title}</span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar area */}
      <div className="calendar-canvas flex min-w-0 flex-1 flex-col">
        <div className="calendar-view">
          <CalendarHeader panelOpen={panelOpen} togglePanel={togglePanel} hasGcalEvents={gcalEvents.length > 0} />
          <span className="sr-only">{t('calendar.timelineHint')}</span>
          <CalendarToolbar
            title={toolbarTitle}
            view={toolbarView}
            todayDisabled={todayDisabled}
            onPrev={handleToolbarPrev}
            onNext={handleToolbarNext}
            onToday={handleToolbarToday}
            onChangeView={handleToolbarChangeView}
          />
          {projectionError && (
            <div
              role="alert"
              className="mb-2 flex items-center justify-between rounded-control bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span>{projectionError}</span>
              <button
                type="button"
                className="font-medium underline-offset-2 hover:underline"
                onClick={() => setProjectionError(null)}
              >
                Dismiss
              </button>
            </div>
          )}
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={initialView}
            views={CUSTOM_VIEWS}
            dayHeaderContent={renderDayHeaderContent}
            headerToolbar={false}
            events={events}
            editable={true}
            droppable={featureFlags.calendarV2}
            selectable={true}
            selectMirror={true}
            slotEventOverlap={true}
            eventMaxStack={4}
            moreLinkClick="popover"
            dayMaxEvents={3}
            eventContent={renderEventContent}
            eventClick={handleEventClick}
            eventDidMount={handleEventDidMount}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            drop={handleCalendarDrop}
            select={handleDateSelect}
            datesSet={handleDatesSet}
            height="100%"
            slotMinTime="06:00:00"
            slotMaxTime="23:00:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            scrollTime={scrollTime}
            scrollTimeReset={false}
            defaultTimedEventDuration="00:30:00"
            allDayText={t('calendar.allDay')}
            nowIndicator={true}
          />
        </div>
      </div>
    </div>
  );
}
