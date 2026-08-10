import { useEffect, useMemo, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Urgency = 'overdue' | 'critical' | 'soon' | 'upcoming' | 'later';

interface Props {
  dueDate: string | null;
  dueTime?: string | null;
  completedAt?: string | null;
  compact?: boolean;
  testId?: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function dueTimestamp(dueDate: string, dueTime?: string | null) {
  const date = dueDate.slice(0, 10);
  const time = dueTime?.slice(0, 5) || '23:59';
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getUrgency(remainingMs: number): Urgency {
  if (remainingMs < 0) return 'overdue';
  if (remainingMs <= HOUR_MS) return 'critical';
  if (remainingMs <= DAY_MS) return 'soon';
  if (remainingMs <= 7 * DAY_MS) return 'upcoming';
  return 'later';
}

/**
 * Shared countdown-label logic behind both the inspector's live pill
 * (<DueCountdown>) and the merged due+countdown chip in TaskList — one
 * ticking source of truth instead of two copies of the same math.
 */
export function useCountdownLabel(
  dueDate: string | null,
  dueTime?: string | null,
  completedAt?: string | null,
): { label: string; urgency: Urgency } | null {
  const { t } = useTranslation('tasks');
  const [now, setNow] = useState(() => Date.now());
  const target = useMemo(() => (dueDate ? dueTimestamp(dueDate, dueTime) : null), [dueDate, dueTime]);

  useEffect(() => {
    if (target === null || completedAt) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, [completedAt, target]);

  if (target === null || completedAt) return null;

  const remainingMs = target - now;
  const overdue = remainingMs < 0;
  const absoluteMs = Math.abs(remainingMs);
  const totalMinutes = Math.max(1, Math.ceil(absoluteMs / MINUTE_MS));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const urgency = getUrgency(remainingMs);

  const duration = days > 0
    ? t('dueCountdown.daysHours', { days, hours })
    : hours > 0
      ? t('dueCountdown.hoursMinutes', { hours, minutes })
      : t('dueCountdown.minutes', { minutes: totalMinutes });
  const label = overdue
    ? t('dueCountdown.overdue', { duration })
    : t('dueCountdown.remaining', { duration });

  return { label, urgency };
}

export function DueCountdown({ dueDate, dueTime, completedAt, compact = false, testId }: Props) {
  const countdown = useCountdownLabel(dueDate, dueTime, completedAt);
  const target = useMemo(() => (dueDate ? dueTimestamp(dueDate, dueTime) : null), [dueDate, dueTime]);

  if (!countdown || target === null) return null;
  const { label, urgency } = countdown;

  return (
    <time
      dateTime={new Date(target).toISOString()}
      role="timer"
      aria-live="polite"
      data-urgency={urgency}
      data-testid={testId}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 font-medium tabular-nums',
        !compact && 'w-fit rounded-md bg-muted px-2 py-1 text-xs',
        compact && 'text-[11px]',
        urgency === 'overdue' && 'text-destructive',
        urgency === 'critical' && 'text-destructive',
        urgency === 'soon' && 'text-[var(--color-p2)]',
        urgency === 'upcoming' && 'text-primary',
        urgency === 'later' && 'text-muted-foreground',
      )}
    >
      {!compact && <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </time>
  );
}
