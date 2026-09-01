import type { CSSProperties } from 'react';
import type { Task } from '@mindoist/shared/types';
import type { CalendarItem } from './types';

interface Props {
  deadlines: Extract<CalendarItem, { kind: 'deadline' }>[];
  tasksById: Map<string, Task>;
  startHour: number;
  endHour: number;
  onSelectTask: (task: Task) => void;
}

export function DeadlineLayer({ deadlines, tasksById, startHour, endHour, onSelectTask }: Props) {
  return (
    <div className="mindoist-deadline-layer" aria-label="Deadlines">
      {deadlines.map(deadline => {
        const [hour, minute] = (deadline.time ?? '23:59').split(':').map(Number);
        const top = ((hour * 60 + minute - startHour * 60) / ((endHour - startHour) * 60)) * 100;
        if (top < 0 || top > 100) return null;
        const task = tasksById.get(deadline.taskId);
        return (
          <button
            key={deadline.id}
            type="button"
            className={`mindoist-deadline-marker${deadline.completed ? ' calendar-task-event-completed' : ''}`}
            style={{ top: `${top}%`, '--calendar-identity-color': deadline.identityColor } as CSSProperties}
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
