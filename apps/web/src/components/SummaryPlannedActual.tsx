import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TimeBlock } from '@mindoist/shared/types';
import { getCalendarProjection } from '@/features/calendar/api';
import { Button } from './ui/button';

interface Props {
  from: string;
  to: string;
  taskIds: string[];
  timeBlocks?: TimeBlock[];
}

export interface PlannedActualStats {
  plannedMin: number;
  actualMin: number;
  varianceMin: number;
  completedBlocks: number;
  slippedBlocks: number;
  totalBlocks: number;
}

export function summarizeTimeBlocks(blocks: TimeBlock[], now = new Date()): PlannedActualStats {
  const plannedMin = blocks.reduce((total, block) => (
    total + Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000))
  ), 0);
  const actualMin = blocks.reduce((total, block) => total + Math.max(0, block.actualMin ?? 0), 0);
  return {
    plannedMin,
    actualMin,
    varianceMin: actualMin - plannedMin,
    completedBlocks: blocks.filter(block => block.completedAt).length,
    slippedBlocks: blocks.filter(block => !block.completedAt && new Date(block.endAt) < now).length,
    totalBlocks: blocks.length,
  };
}

function formatMinutes(minutes: number) {
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function SummaryPlannedActual({ from, to, taskIds, timeBlocks }: Props) {
  const { t } = useTranslation('tasks');
  const [loadedBlocks, setLoadedBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(timeBlocks === undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (timeBlocks !== undefined) return;
    setLoading(true);
    setError(null);
    try {
      setLoadedBlocks((await getCalendarProjection(from, to)).timeBlocks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('summary.plannedActualLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [from, t, timeBlocks, to]);

  useEffect(() => { void load(); }, [load]);

  const taskIdSet = useMemo(() => new Set(taskIds), [taskIds]);
  const filteredBlocks = useMemo(
    () => (timeBlocks ?? loadedBlocks).filter(block => taskIdSet.has(block.taskId)),
    [loadedBlocks, taskIdSet, timeBlocks],
  );
  const stats = useMemo(() => summarizeTimeBlocks(filteredBlocks), [filteredBlocks]);
  const progress = stats.plannedMin > 0 ? Math.min(100, Math.round((stats.actualMin / stats.plannedMin) * 100)) : 0;
  const variancePrefix = stats.varianceMin > 0 ? '+' : stats.varianceMin < 0 ? '−' : '';

  return (
    <article data-testid="summary-planned-actual" className="summary-panel col-span-full" aria-busy={loading}>
      <div className="summary-panel-heading">
        <div>
          <h3 className="flex items-center gap-2"><Clock3 className="size-4 text-primary" aria-hidden="true" />{t('summary.plannedActual')}</h3>
          <p>{t('summary.plannedActualDescription')}</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('summary.blocksCompleted', { completed: stats.completedBlocks, total: stats.totalBlocks })}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-muted/55 p-3"><span className="text-xs text-muted-foreground">{t('summary.plannedTime')}</span><strong data-testid="summary-planned-minutes" className="mt-1 block text-xl tabular-nums">{formatMinutes(stats.plannedMin)}</strong></div>
        <div className="rounded-lg bg-primary/8 p-3"><span className="text-xs text-muted-foreground">{t('summary.actualTime')}</span><strong data-testid="summary-actual-minutes" className="mt-1 block text-xl tabular-nums text-primary">{formatMinutes(stats.actualMin)}</strong></div>
        <div className="rounded-lg bg-muted/55 p-3"><span className="text-xs text-muted-foreground">{t('summary.variance')}</span><strong data-testid="summary-variance-minutes" className="mt-1 block text-xl tabular-nums">{variancePrefix}{formatMinutes(stats.varianceMin)}</strong></div>
        <div className="rounded-lg bg-warning/10 p-3"><span className="text-xs text-muted-foreground">{t('summary.slippedBlocks')}</span><strong data-testid="summary-slipped-blocks" className="mt-1 block text-xl tabular-nums text-warning-foreground">{stats.slippedBlocks}</strong></div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={t('summary.actualProgress', { progress })} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-center justify-between gap-3 text-xs text-destructive">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => { void load(); }}><RotateCcw className="mr-1 size-3" aria-hidden="true" />{t('calendar.retry')}</Button>
        </div>
      )}
    </article>
  );
}
