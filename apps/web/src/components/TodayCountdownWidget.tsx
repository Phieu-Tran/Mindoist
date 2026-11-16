import { CalendarDays } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Countdown } from '@mindoist/shared/types';
import { Skeleton } from './ui/skeleton';
import { taskColorClass } from '@/lib/task-colors';

const dayMs = 86_400_000;

function countdownTarget(targetDate: string) {
  const target = new Date(targetDate);
  // Existing countdowns encode date-only values as UTC midnight.
  const allDay = target.getUTCHours() === 0 && target.getUTCMinutes() === 0 && target.getUTCSeconds() === 0;
  return { at: allDay ? new Date(`${targetDate.slice(0, 10)}T23:59:59.999`).getTime() : target.getTime(), allDay };
}

interface TodayCountdownWidgetProps {
  countdowns: Countdown[];
  loading?: boolean;
}

export function TodayCountdownWidget({ countdowns, loading = false }: TodayCountdownWidgetProps) {
  const { t } = useTranslation('tasks');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!countdowns.length) return;
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [countdowns.length]);
  const sorted = useMemo(() => countdowns.filter(item => !item.deletedAt)
    .map(item => ({ item, ...countdownTarget(item.targetDate) }))
    .filter(({ at }) => Number.isFinite(at))
    .sort((a, b) => a.at - b.at), [countdowns]);
  const visible = sorted.filter(({ at }) => at >= now)
    .slice(0, 3);

  if (!loading && visible.length === 0) return null;

  return (
    <section className="mb-3 rounded-panel border border-border bg-card p-2" aria-labelledby="today-countdowns-title" data-testid="today-countdown-widget">
      {/* A glanceable strip, not a hero: the heading stays for assistive tech
          and the cards are one compact line each, so today's tasks start
          above the fold. */}
      <h2 id="today-countdowns-title" className="sr-only">{t('sidebar.countdown')}</h2>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-3" role="status" aria-label={t('list.loading')}>
          {[0, 1, 2].map(item => <Skeleton key={item} className="h-11 rounded-control" />)}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {visible.map(({ item, at, allDay }) => {
            const target = new Date(at);
            const today = new Date(now);
            const days = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / dayMs);
            const minutes = Math.max(1, Math.ceil((at - now) / 60_000));
            const label = days > 0 ? `${days} ${t('calendar.daysShort')}` : allDay ? t('calendar.today')
              : t('dueCountdown.remaining', { duration: minutes >= 60 ? t('dueCountdown.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 }) : t('dueCountdown.minutes', { minutes }) });
            return (
              <article key={item.id} className={`countdown-card flex min-w-0 items-center gap-2.5 rounded-control border border-border/70 bg-background p-1.5 ${taskColorClass(item.color)}`}>
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-chip bg-muted text-[var(--task-color-accent)]" aria-hidden="true">
                  <CalendarDays className="h-4 w-4" />
                  {item.imageUrl && <img key={item.imageUrl} src={item.imageUrl} alt="" width={36} height={36} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.hidden = true; }} />}
                </div>
                <p className="m-0 min-w-0 flex-1 truncate text-sm font-medium" title={item.title}>{item.title}</p>
                <p className="m-0 shrink-0 pr-1.5 text-sm font-semibold tabular-nums text-primary">{label}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
