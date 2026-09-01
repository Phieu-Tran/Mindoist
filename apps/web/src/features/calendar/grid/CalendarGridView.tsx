import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GCalEvent } from '@/hooks/useApi';
import type { Countdown, Task } from '@mindoist/shared/types';
import { TASK_COLOR_OPTIONS } from '@/lib/task-colors';
import { calendarProjectionToItems, type CalendarProjection } from '../projection';
import { layoutTimedItems } from './layout';
import { CALENDAR_SLOT_HEIGHT, dayKey, snapMinutes, threeDayDates, weekDates, workWeekDates } from './time-grid';
import type { CalendarItem, PositionedBlock } from './types';
import { TimeGrid } from './TimeGrid';
import { DeadlineLayer } from './DeadlineLayer';
import { MonthGrid } from './MonthGrid';

export type GridCalendarView = 'dayGridMonth' | 'timeGridDay' | 'timeGrid3Day' | 'timeGrid5Day' | 'timeGridWeek';

interface Props {
  anchorDate: Date;
  projection: CalendarProjection | null;
  tasks: Task[];
  projects?: { id: string; name: string; color?: string | null }[];
  gcalEvents?: GCalEvent[];
  countdowns?: Countdown[];
  onSelectTask: (task: Task) => void;
  onCreateTask: (slot: { title?: string; projectId?: string; color?: string; date: string; startAt?: string; endAt?: string; startTime?: string; endTime?: string; allDay: boolean }) => Promise<void> | void;
  onTaskDrop?: (taskId: string, day: Date, startMinutes: number, allDay: boolean) => void;
  onBlockMove?: (blockId: string, day: Date, startMinutes: number) => void;
  onBlockResize?: (blockId: string, endMinutes: number) => void;
  onMoveDeadline?: (taskId: string, date: string, time: string | null) => void;
  view?: GridCalendarView;
}

interface CalendarDraft {
  date: string;
  startMinutes: number;
  endMinutes: number;
  slot: ReturnType<typeof createSlot>;
}

function formatTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function layoutForDay(day: Date, items: CalendarItem[]): PositionedBlock[] {
  const key = dayKey(day);
  const timed = items.filter((item): item is Extract<CalendarItem, { kind: 'block' | 'external' }> =>
    (item.kind === 'block' || item.kind === 'external') && !item.allDay && dayKey(item.start) === key,
  );
  return layoutTimedItems(timed, { startHour: 6, slotHeight: CALENDAR_SLOT_HEIGHT, minHeight: 28 });
}

function externalItems(events: GCalEvent[], existing: CalendarItem[]): CalendarItem[] {
  const known = new Set(existing.filter(item => item.kind === 'external').map(item => item.event?.providerEventId ?? item.id));
  return events
    .filter(event => !known.has(event.id))
    .map(event => ({
      kind: 'external' as const,
      id: `google-${event.id}`,
      provider: 'google',
      start: new Date(event.start),
      end: event.end ? new Date(event.end) : new Date(event.start),
      allDay: event.start.length === 10,
      title: event.title,
    }));
}

function countdownItems(countdowns: Countdown[]): CalendarItem[] {
  return countdowns.filter(countdown => countdown.showInCalendar).map(countdown => {
    const target = new Date(countdown.targetDate);
    const allDay = target.getUTCHours() === 0 && target.getUTCMinutes() === 0 && target.getUTCSeconds() === 0;
    if (allDay) {
      const [year, month, day] = countdown.targetDate.slice(0, 10).split('-').map(Number);
      target.setFullYear(year, month - 1, day);
      target.setHours(0, 0, 0, 0);
    }
    return { kind: 'external' as const, id: `countdown-${countdown.id}`, provider: 'countdown', start: target, end: target, allDay, title: countdown.title };
  });
}

function createSlot(day: Date, startMinutes: number, endMinutes: number) {
  const start = new Date(day);
  const startSnap = snapMinutes(startMinutes);
  const endSnap = Math.max(startSnap + 15, snapMinutes(endMinutes));
  start.setHours(0, startSnap, 0, 0);
  const end = new Date(day);
  end.setHours(0, endSnap, 0, 0);
  return { date: dayKey(start), startAt: start.toISOString(), endAt: end.toISOString(), startTime: formatTime(start), endTime: formatTime(end), allDay: false };
}

export function CalendarGridView({
  anchorDate,
  projection,
  tasks,
  projects = [],
  gcalEvents = [],
  countdowns = [],
  onSelectTask,
  onCreateTask,
  onTaskDrop,
  onBlockMove,
  onBlockResize,
  onMoveDeadline,
  view = 'timeGrid5Day',
}: Props) {
  const { t } = useTranslation('tasks');
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const days = useMemo(() => {
    if (view === 'timeGridDay') return [new Date(anchorDate)];
    if (view === 'timeGrid3Day') return threeDayDates(anchorDate);
    if (view === 'timeGridWeek') return weekDates(anchorDate);
    return workWeekDates(anchorDate);
  }, [anchorDate, view]);
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const items = useMemo(() => {
    const projected = projection ? calendarProjectionToItems(projection, tasks, projects) : [];
    return [...projected, ...externalItems(gcalEvents, projected), ...countdownItems(countdowns)];
  }, [countdowns, gcalEvents, projection, projects, tasks]);
  const today = dayKey(new Date());

  if (view === 'dayGridMonth') {
    return (
      <MonthGrid
        anchorDate={anchorDate}
        items={items}
        tasksById={tasksById}
        onSelectTask={onSelectTask}
        onCreateAllDay={date => onCreateTask({ date, allDay: true })}
        onTaskDrop={onTaskDrop}
        onMoveDeadline={onMoveDeadline}
      />
    );
  }

  return (
    <div
      className="mindoist-calendar-grid"
      data-calendar-engine="grid"
      style={{
        '--grid-days': days.length,
        '--calendar-grid-min-width': `${Math.max(42, 4.25 + days.length * 9.5)}rem`,
      } as CSSProperties}
    >
      <div className="mindoist-calendar-grid-header" aria-hidden="true">
        <div className="mindoist-calendar-grid-corner" />
        {days.map(day => {
          const key = dayKey(day);
          return (
            <div key={key} className={`mindoist-calendar-grid-day-header${key === today ? ' is-today' : ''}${day.getDay() === 0 || day.getDay() === 6 ? ' is-weekend' : ''}`}>
              <span>{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <strong>{day.getDate()}</strong>
            </div>
          );
        })}
      </div>
      <div className="mindoist-calendar-all-day-row">
        <div className="mindoist-calendar-all-day-label">{t('calendar.allDay')}</div>
        {days.map(day => {
          const key = dayKey(day);
          const allDayItems = items.filter(item => (
            item.kind === 'deadline' ? item.allDay && item.date === key
              : item.kind === 'range' ? item.startDate <= key && item.endDate >= key
                : item.allDay && dayKey(item.start) === key
          ));
          return <div key={key} className={`mindoist-calendar-grid-all-day${key === today ? ' is-today' : ''}`}>{allDayItems.slice(0, 3).map(item => {
            const task = item.kind === 'external' ? undefined : tasksById.get(item.taskId);
            const identityColor = item.kind === 'external' ? 'var(--calendar-external-accent)' : item.identityColor;
            const className = `mindoist-calendar-grid-chip is-${item.kind}${item.kind !== 'external' && item.completed ? ' calendar-task-event-completed' : ''}`;
            const style = { '--calendar-identity-color': identityColor } as CSSProperties;
            return task
              ? <button key={item.id} type="button" className={className} style={style} onClick={() => onSelectTask(task)}>{item.title}</button>
              : <span key={item.id} className={className} style={style}>{item.title}</span>;
          })}</div>;
        })}
      </div>
      <div className="mindoist-calendar-time-body">
        <div className="mindoist-calendar-hours" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => <span key={index}>{String(index + 6).padStart(2, '0')}:00</span>)}
        </div>
        <div className="mindoist-calendar-grid-columns">
          {days.map(day => {
            const key = dayKey(day);
            const blocks = layoutForDay(day, items);
            const deadlines = items.filter((item): item is Extract<CalendarItem, { kind: 'deadline' }> => item.kind === 'deadline' && !item.allDay && item.date === key);
            return (
              <section key={key} className={`mindoist-calendar-grid-column${key === today ? ' is-today' : ''}`}>
                <TimeGrid
                  day={day}
                  blocks={blocks}
                  startHour={6}
                  endHour={23}
                  draft={draft?.date === key ? {
                    start: draft.startMinutes,
                    end: draft.endMinutes,
                    timeLabel: `${draft.slot.startTime} – ${draft.slot.endTime}`,
                  } : null}
                  draftInputLabel={t('calendar.quickCreateLabel')}
                  draftPlaceholder={t('calendar.quickCreatePlaceholder')}
                  draftSaveLabel={t('calendar.quickCreateSave')}
                  draftCancelLabel={t('calendar.quickCreateCancel')}
                  draftErrorMessage={t('calendar.quickCreateError')}
                  draftProjectLabel={t('calendar.quickCreateProject')}
                  draftNoProjectLabel={t('calendar.quickCreateNoProject')}
                  draftProjects={projects}
                  draftColorLabel={t('calendar.quickCreateColor')}
                  draftInheritColorLabel={t('calendar.quickCreateInheritColor')}
                  draftColors={TASK_COLOR_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))}
                  onEmptySelect={(selectedDay, startMinutes, endMinutes) => {
                    const start = snapMinutes(startMinutes);
                    const end = Math.max(start + 15, snapMinutes(endMinutes));
                    const slot = createSlot(selectedDay, start, end);
                    setDraft({ date: slot.date, startMinutes: start, endMinutes: end, slot });
                  }}
                  onDraftCancel={() => setDraft(null)}
                  onDraftSubmit={async (title, projectId, color) => {
                    if (!draft) return;
                    await onCreateTask({ ...draft.slot, title, projectId, color });
                    setDraft(null);
                  }}
                  onTaskDrop={(taskId, selectedDay, startMinutes) => onTaskDrop?.(taskId, selectedDay, startMinutes, false)}
                  onBlockMove={onBlockMove}
                  onBlockResize={onBlockResize}
                  renderBlock={block => {
                    const task = block.item.kind === 'block' ? tasksById.get(block.item.taskId) : undefined;
                    return <button type="button" className="mindoist-calendar-grid-block-button" onClick={() => task && onSelectTask(task)} title={block.item.title}><span>{block.item.title}</span><small>{formatTime(block.item.start)} – {formatTime(block.item.end)}</small></button>;
                  }}
                />
                <DeadlineLayer deadlines={deadlines} tasksById={tasksById} startHour={6} endHour={23} onSelectTask={onSelectTask} />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
