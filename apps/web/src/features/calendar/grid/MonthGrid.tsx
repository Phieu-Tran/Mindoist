import type { CSSProperties } from 'react';
import type { Task } from '@mindoist/shared/types';
import type { CalendarItem } from './types';
import { dayKey, monthDates } from './time-grid';

interface Props {
  anchorDate: Date;
  items: CalendarItem[];
  tasksById: Map<string, Task>;
  onSelectTask: (task: Task) => void;
  onCreateAllDay: (date: string) => void;
  onTaskDrop?: (taskId: string, day: Date, startMinutes: number, allDay: boolean) => void;
  onMoveDeadline?: (taskId: string, date: string, time: string | null) => void;
}

function itemAppearsOn(item: CalendarItem, key: string): boolean {
  if (item.kind === 'deadline') return item.date === key;
  if (item.kind === 'range') return item.startDate <= key && item.endDate >= key;
  if (item.kind === 'block') return item.allDay && dayKey(item.start) === key;
  return item.allDay && dayKey(item.start) === key;
}

export function MonthGrid({ anchorDate, items, tasksById, onSelectTask, onCreateAllDay, onTaskDrop, onMoveDeadline }: Props) {
  const dates = monthDates(anchorDate);
  const today = dayKey(new Date());
  return (
    <div className="mindoist-month-grid" role="grid" aria-label={anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
      {dates.slice(0, 7).map(date => (
        <div key={`header-${dayKey(date)}`} className="mindoist-month-weekday" role="columnheader">
          {date.toLocaleDateString(undefined, { weekday: 'short' })}
        </div>
      ))}
      {dates.map(date => {
        const key = dayKey(date);
        const dayItems = items.filter(item => itemAppearsOn(item, key)).slice(0, 4);
        const hidden = Math.max(0, items.filter(item => itemAppearsOn(item, key)).length - dayItems.length);
        return (
          <div
            key={key}
            className={`mindoist-month-day${date.getMonth() !== anchorDate.getMonth() ? ' is-outside' : ''}${key === today ? ' is-today' : ''}`}
            role="gridcell"
            tabIndex={0}
            aria-label={date.toLocaleDateString()}
            onDoubleClick={() => onCreateAllDay(key)}
            onKeyDown={event => {
              if (event.key === 'Enter') onCreateAllDay(key);
            }}
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData('application/x-panel-task');
              const deadlineTaskId = event.dataTransfer.getData('application/x-calendar-deadline');
              if (taskId) onTaskDrop?.(taskId, date, 9 * 60, true);
              else if (deadlineTaskId) onMoveDeadline?.(deadlineTaskId, key, null);
            }}
          >
            <span className="mindoist-month-day-number">{date.getDate()}</span>
            <div className="mindoist-month-events">
              {dayItems.map(item => {
                const taskId = item.kind === 'external' ? null : item.taskId;
                const task = taskId ? tasksById.get(taskId) : undefined;
                const label = item.title;
                const kind = item.kind;
                const identity = item.kind === 'external' ? 'var(--calendar-external-accent)' : item.identityColor;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`mindoist-month-event is-${kind}${item.kind !== 'external' && item.completed ? ' calendar-task-event-completed' : ''}`}
                    style={{ '--calendar-identity-color': identity } as CSSProperties}
                    onClick={() => task && onSelectTask(task)}
                    title={label}
                    draggable={kind === 'deadline'}
                    onDragStart={event => {
                      if (kind === 'deadline' && taskId) event.dataTransfer.setData('application/x-calendar-deadline', taskId);
                    }}
                  >
                    {kind === 'deadline' && <span className="mindoist-month-deadline-shape" aria-hidden="true" />}
                    <span>{label}</span>
                  </button>
                );
              })}
              {hidden > 0 && <span className="mindoist-month-more">+{hidden} more</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
