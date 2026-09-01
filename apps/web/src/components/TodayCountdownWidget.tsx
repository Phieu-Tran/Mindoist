import { Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Countdown } from '@mindoist/shared/types';
import { Skeleton } from './ui/skeleton';

const dayMs = 86_400_000;

function remainingDays(targetDate: string) {
  const target = new Date(targetDate);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / dayMs);
}

interface TodayCountdownWidgetProps {
  countdowns: Countdown[];
  loading?: boolean;
}

export function TodayCountdownWidget({ countdowns, loading = false }: TodayCountdownWidgetProps) {
  const { t } = useTranslation('tasks');
  const visible = [...countdowns]
    .filter(item => !item.deletedAt)
    .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())
    .slice(0, 3);

  if (!loading && visible.length === 0) return null;

  return (
    <section className="mb-4 rounded-panel border border-border bg-card p-3" aria-labelledby="today-countdowns-title" data-testid="today-countdown-widget">
      <div className="mb-2 flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="today-countdowns-title" className="m-0 text-sm font-semibold">{t('sidebar.countdown')}</h2>
      </div>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-3" role="status" aria-label={t('list.loading')}>
          {[0, 1, 2].map(item => <Skeleton key={item} className="h-12 rounded-control" />)}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {visible.map(item => {
            const days = remainingDays(item.targetDate);
            return (
              <article key={item.id} className="rounded-control border border-border/70 bg-background px-3 py-2">
                <p className="m-0 truncate text-sm font-medium">{item.title}</p>
                <p className="m-0 mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {days === 0 ? t('calendar.today') : days > 0 ? `${days} ${t('calendar.daysShort')}` : t('calendar.past')}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
