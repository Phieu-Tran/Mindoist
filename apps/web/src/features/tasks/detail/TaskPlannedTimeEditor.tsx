import { useMemo, useState } from 'react';
import { Check, Clock3, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TimeBlock } from '@mindoist/shared/types';
import { cn } from '@/lib/utils';
import { useTimeBlocks } from '@/features/calendar/use-time-blocks';
import { requestCalendarProjectionRefresh } from '@/features/calendar/calendar-refresh';

interface Props {
  taskId: string;
  defaultDate?: string;
  onChanged?: () => void;
}

interface TimeBlockDraft {
  date: string;
  startTime: string;
  endTime: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function draftFromBlock(block: TimeBlock): TimeBlockDraft {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);
  return {
    date: localDate(start),
    startTime: localTime(start),
    endTime: localTime(end),
  };
}

function newDraft(defaultDate?: string): TimeBlockDraft {
  const now = new Date();
  const roundedMinutes = Math.ceil(now.getMinutes() / 30) * 30;
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(roundedMinutes);
  const end = new Date(start.getTime() + 60 * 60 * 1_000);
  return {
    date: defaultDate || localDate(start),
    startTime: localTime(start),
    endTime: localTime(end),
  };
}

function displayDate(value: Date): string {
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
}

export function TaskPlannedTimeEditor({ taskId, defaultDate, onChanged }: Props) {
  const { t } = useTranslation('tasks');
  const { timeBlocks, loading, error: loadError, create, update, remove } = useTimeBlocks(taskId);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<TimeBlockDraft>(() => newDraft(defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sortedBlocks = useMemo(
    () => [...timeBlocks].sort((left, right) => left.startAt.localeCompare(right.startAt)),
    [timeBlocks],
  );

  const beginCreate = () => {
    setDraft(newDraft(defaultDate));
    setEditingId('new');
    setError('');
  };

  const beginEdit = (block: TimeBlock) => {
    setDraft(draftFromBlock(block));
    setEditingId(block.id);
    setError('');
  };

  const notifyChanged = () => {
    requestCalendarProjectionRefresh();
    onChanged?.();
  };

  const save = async () => {
    const start = new Date(`${draft.date}T${draft.startTime}:00`);
    const end = new Date(`${draft.date}T${draft.endTime}:00`);
    if (!draft.date || !draft.startTime || !draft.endTime || end <= start) {
      setError(t('detail.plannedTimeInvalid'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const input = {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        allDay: false,
      };
      if (editingId === 'new') await create({ ...input, source: 'MANUAL' });
      else if (editingId) await update(editingId, input);
      setEditingId(null);
      notifyChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('detail.plannedTimeSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (block: TimeBlock) => {
    setSaving(true);
    setError('');
    try {
      await remove(block.id);
      if (editingId === block.id) setEditingId(null);
      notifyChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('detail.plannedTimeSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label={t('detail.plannedTime')}
      data-property-registry="planned-time"
      className="rounded-control border border-border/70 bg-muted/15 px-2 py-1.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="mr-auto flex min-h-8 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('detail.plannedTime')}</span>
        </div>

        {!loading && sortedBlocks.map(block => {
          const start = new Date(block.startAt);
          const end = new Date(block.endAt);
          const label = `${displayDate(start)} · ${localTime(start)} → ${localTime(end)}`;
          return (
            <div
              key={block.id}
              className="group flex min-h-9 items-center rounded-control border border-border/70 bg-background text-xs"
            >
              <button
                type="button"
                onClick={() => beginEdit(block)}
                aria-label={t('detail.editPlannedTime', { range: label })}
                className="flex min-h-9 items-center gap-1.5 px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="tabular-nums">{label}</span>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-60" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void removeBlock(block)}
                disabled={saving}
                aria-label={t('detail.removePlannedTime', { range: label })}
                className="flex min-h-9 w-8 items-center justify-center border-l border-border/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}

        {!loading && editingId !== 'new' && (
          <button
            type="button"
            onClick={beginCreate}
            className="flex min-h-9 items-center gap-1 rounded-control border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('detail.addPlannedTime')}
          </button>
        )}
        {loading && <span className="text-xs text-muted-foreground">{t('detail.plannedTimeLoading')}</span>}
      </div>

      {editingId && (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-1.5 border-t border-border/60 pt-2">
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            <span>{t('detail.plannedDate')}</span>
            <input
              type="date"
              value={draft.date}
              onChange={event => setDraft(current => ({ ...current, date: event.target.value }))}
              className="min-h-9 min-w-0 rounded-control border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            <span>{t('detail.plannedStart')}</span>
            <input
              type="time"
              value={draft.startTime}
              onChange={event => setDraft(current => ({ ...current, startTime: event.target.value }))}
              className="min-h-9 w-[5.6rem] rounded-control border border-input bg-background px-2 text-xs tabular-nums text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            <span>{t('detail.plannedEnd')}</span>
            <input
              type="time"
              value={draft.endTime}
              onChange={event => setDraft(current => ({ ...current, endTime: event.target.value }))}
              className="min-h-9 w-[5.6rem] rounded-control border border-input bg-background px-2 text-xs tabular-nums text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="col-span-3 flex items-center justify-between gap-2">
            <span className="min-h-4 text-[11px] text-destructive" role={error ? 'alert' : undefined}>{error}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { setEditingId(null); setError(''); }}
                disabled={saving}
                aria-label={t('detail.cancelPlannedTime')}
                className="flex min-h-9 w-9 items-center justify-center rounded-control text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                aria-label={t('detail.savePlannedTime')}
                className={cn(
                  'flex min-h-9 items-center gap-1 rounded-control bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                )}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t('detail.savePlannedTime')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!editingId && (error || loadError) && (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {error || t('detail.plannedTimeLoadError')}
        </p>
      )}
    </section>
  );
}
