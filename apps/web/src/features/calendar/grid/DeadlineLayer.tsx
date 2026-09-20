import { useMemo, type CSSProperties } from 'react';
import type { Task } from '@mindoist/shared/types';
import type { CalendarItem } from './types';
import { layoutTimedItems } from './layout';
import { CALENDAR_SLOT_HEIGHT, SLOT_MINUTES } from './time-grid';

const CARD_HEIGHT = 44;

interface Props {
  deadlines: Extract<CalendarItem, { kind: 'deadline' }>[];
  tasksById: Map<string, Task>;
  startHour: number;
  endHour: number;
  onSelectTask: (task: Task) => void;
}

export function DeadlineLayer({ deadlines, tasksById, startHour, endHour, onSelectTask }: Props) {
  const positioned = useMemo(() => layoutTimedItems(deadlines.flatMap(deadline => {
    const [hour, minute] = (deadline.time ?? '23:59').split(':').map(Number);
    if (hour * 60 + minute < startHour * 60 || hour * 60 + minute > endHour * 60) return [];
    const start = new Date(2000, 0, 1, hour, minute);
    // Reserve the rendered card's height so nearby deadlines cannot cover each other.
    const end = new Date(start.getTime() + CARD_HEIGHT / CALENDAR_SLOT_HEIGHT * SLOT_MINUTES * 60_000);
    return [{ id: deadline.id, start, end, deadline }];
  }), { startHour, slotHeight: CALENDAR_SLOT_HEIGHT, minHeight: CARD_HEIGHT }), [deadlines, startHour, endHour]);
  return (
    <div className="mindoist-deadline-layer" aria-label="Deadlines">
      {positioned.map(({ item: { deadline }, top, column, columnCount }) => {
        const task = tasksById.get(deadline.taskId);
        return (
          <button
            key={deadline.id}
            type="button"
            className={`mindoist-deadline-marker${deadline.completed ? ' calendar-task-event-completed' : ''}`}
            style={{ top, height: CARD_HEIGHT, left: `calc(${column / columnCount * 100}% + 3px)`, width: `calc(${100 / columnCount}% - 6px)`, '--calendar-identity-color': deadline.identityColor } as CSSProperties}
            aria-label={`${deadline.title}, deadline ${deadline.time}`}
            title={`${deadline.title} · ${deadline.time}`}
            draggable
            onDragStart={event => {
              event.dataTransfer.setData('application/x-calendar-deadline', deadline.taskId);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => task && onSelectTask(task)}
          >
            <span aria-hidden="true" />
            <strong>{deadline.title}</strong>
            <small>{deadline.time}</small>
          </button>
        );
      })}
    </div>
  );
}
