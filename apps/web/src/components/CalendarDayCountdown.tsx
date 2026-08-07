import { Hourglass } from 'lucide-react';
import type { Task } from '@mindoist/shared/types';
import { useCountdownLabel } from './DueCountdown';

interface Props {
  /** The day column this chip sits under. */
  date: Date;
  tasks: Task[];
}

function localISODate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function deadlineOf(task: Task): { date: string; time: string | null } | null {
  const date = task.deadline?.date ?? task.dueDate?.slice(0, 10);
  if (!date) return null;
  return { date, time: task.deadline?.time ?? task.dueTime ?? null };
}

/** Deadlines with no clock time land at end of day, same as <DueCountdown>. */
function timestampOf(date: string, time: string | null): number {
  return new Date(`${date}T${(time ?? '23:59').slice(0, 5)}:00`).getTime();
}

/**
 * Akiflow puts a small meter under each day column header. Ours counts down
 * to the next deadline still ahead on that day rather than summing the day's
 * planned time — the question being answered is "how long have I got", so the
 * number deliberately runs past midnight when the deadline is far away.
 */
export function CalendarDayCountdown({ date, tasks }: Props) {
  const iso = localISODate(date);
  // Re-derived on each render; the countdown hook below re-renders this
  // component every 30s, which is also what keeps this selection current.
  const now = Date.now();

  let next: { task: Task; deadline: { date: string; time: string | null }; at: number } | null = null;
  for (const task of tasks) {
    if (task.completedAt) continue;
    const deadline = deadlineOf(task);
    if (!deadline || deadline.date !== iso) continue;
    const at = timestampOf(deadline.date, deadline.time);
    if (Number.isNaN(at) || at < now) continue;
    if (!next || at < next.at) next = { task, deadline, at };
  }

  const countdown = useCountdownLabel(next?.deadline.date ?? null, next?.deadline.time ?? null);
  if (!next || !countdown) return null;

  return (
    <span
      className="calendar-day-countdown"
      data-urgency={countdown.urgency}
      data-testid={`calendar-day-countdown-${iso}`}
      title={next.task.title}
    >
      <Hourglass className="h-3 w-3 shrink-0" aria-hidden="true" />
      {countdown.label}
    </span>
  );
}
