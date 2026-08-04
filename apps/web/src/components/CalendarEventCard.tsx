import { FileText, LockKeyhole } from 'lucide-react';
import type { EventContentArg } from '@fullcalendar/core';
import type { Task } from '@mindoist/shared/types';

// Custom eventContent renderer, used only for timed events in Week/Day
// view (see the eventContent callback in CalendarView) - month view and
// all-day bars keep FullCalendar's default rendering, which is already
// well-tuned for their compact single-line chips.
export function CalendarEventCard({ arg }: { arg: EventContentArg }) {
  const task = arg.event.extendedProps.task as Task | undefined;
  const hasNote = Boolean(task?.description);
  const googleReadOnly = arg.event.extendedProps.source === 'google';

  // A 30-min (or shorter) slot doesn't have room for a time row stacked
  // above a title row - both need to share one line, or the title clips
  // to nothing (the event box just isn't tall enough for two text rows).
  const start = arg.event.start;
  const end = arg.event.end;
  const durationMin = start && end ? (end.getTime() - start.getTime()) / 60000 : null;
  const compact = durationMin !== null && durationMin <= 30;

  return (
    <div className={compact ? 'calendar-event-card calendar-event-card-compact' : 'calendar-event-card'}>
      {compact ? (
        <span className="calendar-event-card-title">
          {arg.timeText && <span className="calendar-event-card-time">{arg.timeText} </span>}
          {arg.event.title}
        </span>
      ) : (
        <div className="calendar-event-card-text">
          {arg.timeText && <span className="calendar-event-card-time">{arg.timeText}</span>}
          <span className="calendar-event-card-title">{arg.event.title}</span>
        </div>
      )}
      {hasNote && <FileText className="calendar-event-card-icon" aria-hidden="true" />}
      {googleReadOnly && (
        <span className="inline-flex shrink-0 items-center text-current/70" title="Google Calendar · Read only">
          <LockKeyhole className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Google Calendar, read only</span>
        </span>
      )}
    </div>
  );
}
