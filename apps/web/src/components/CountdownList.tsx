import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Gift, Trash2, Pencil, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DatePicker, TimePicker } from './ui/date-picker';
import { Switch } from './ui/switch';
import { cn } from '@/lib/utils';
import { TASK_COLOR_OPTIONS, taskColorClass } from '@/lib/task-colors';
import type { Countdown, CreateCountdownRequest, UpdateCountdownRequest } from '@mindoist/shared/types';

interface Props {
  countdowns: Countdown[];
  loading: boolean;
  error: string | null;
  onCreate: (req: CreateCountdownRequest) => Promise<unknown>;
  onUpdate: (id: string, req: UpdateCountdownRequest) => Promise<void>;
  onDelete: (id: string) => void;
}

// A countdown created before time-of-day existed (or one saved without a
// time) is stored as an exact UTC midnight instant. Checking UTC hours -
// not local ones - is what tells "no time was ever set" apart from "the
// user picked a time that happens to be local midnight", matching the
// same heuristic the reminder worker already uses server-side.
function splitTargetDate(iso: string): { date: string; time: string } {
  const stored = new Date(iso);
  const hasTime = stored.getUTCHours() !== 0 || stored.getUTCMinutes() !== 0 || stored.getUTCSeconds() !== 0;
  if (!hasTime) {
    return { date: iso.slice(0, 10), time: '' };
  }
  const y = stored.getFullYear();
  const m = String(stored.getMonth() + 1).padStart(2, '0');
  const d = String(stored.getDate()).padStart(2, '0');
  const hh = String(stored.getHours()).padStart(2, '0');
  const mm = String(stored.getMinutes()).padStart(2, '0');
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

function daysUntil(targetDate: string): number {
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(targetDate);
  const targetKey = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetKey.getTime() - todayKey.getTime()) / 86_400_000);
}

export function CountdownList({ countdowns, loading, error, onCreate, onUpdate, onDelete }: Props) {
  const { t, i18n } = useTranslation('tasks');

  // Sorting purely by targetDate puts an already-past countdown ahead of
  // every upcoming one just because its date is numerically smaller -
  // upcoming (soonest first) always belongs before past (most recently
  // passed first), regardless of how the API ordered them.
  const sortedCountdowns = useMemo(() => {
    const upcoming: Countdown[] = [];
    const past: Countdown[] = [];
    for (const countdown of countdowns) {
      (daysUntil(countdown.targetDate) < 0 ? past : upcoming).push(countdown);
    }
    upcoming.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    past.sort((a, b) => b.targetDate.localeCompare(a.targetDate));
    return [...upcoming, ...past];
  }, [countdowns]);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [color, setColor] = useState<string>('indigo');
  const [imageUrl, setImageUrl] = useState('');
  const [reminderDaysBefore, setReminderDaysBefore] = useState<string>('');
  const [showInCalendar, setShowInCalendar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setTargetDate('');
    setTargetTime('');
    setColor('indigo');
    setImageUrl('');
    setReminderDaysBefore('');
    setShowInCalendar(false);
    setEditingId(null);
    setFormOpen(false);
  };

  const startCreate = () => {
    if (formOpen && !editingId) {
      resetForm();
      return;
    }
    setTitle('');
    setTargetDate('');
    setTargetTime('');
    setColor('indigo');
    setImageUrl('');
    setReminderDaysBefore('');
    setShowInCalendar(false);
    setEditingId(null);
    setFormOpen(true);
  };

  const startEdit = (countdown: Countdown) => {
    const { date, time } = splitTargetDate(countdown.targetDate);
    setTitle(countdown.title);
    setTargetDate(date);
    setTargetTime(time);
    setColor(countdown.color || 'indigo');
    setImageUrl(countdown.imageUrl || '');
    setReminderDaysBefore(countdown.reminderDaysBefore != null ? String(countdown.reminderDaysBefore) : '');
    setShowInCalendar(countdown.showInCalendar);
    setEditingId(countdown.id);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;
    setSaving(true);
    try {
      const request = {
        title: title.trim(),
        targetDate: targetTime ? new Date(`${targetDate}T${targetTime}:00`).toISOString() : targetDate,
        color,
        imageUrl: imageUrl.trim() || undefined,
        reminderDaysBefore: reminderDaysBefore === '' ? null : Number(reminderDaysBefore),
        showInCalendar,
      };
      if (editingId) await onUpdate(editingId, request);
      else await onCreate(request);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div role="status" className="flex items-center justify-center py-12 text-sm text-muted-foreground">{t('countdown.loading')}</div>;
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted-foreground">{countdowns.length ? t('countdown.compactHint') : t('countdown.compactEmptyHint')}</p>
        <Button size="sm" onClick={startCreate} data-testid="countdown-add-toggle">
          <Plus className="mr-1 h-4 w-4" />
          {t('countdown.add')}
        </Button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          data-testid="countdown-form"
          className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 text-sm font-semibold">
              {editingId ? t('countdown.edit') : t('countdown.add')}
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              {t('countdown.cancel')}
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="countdown-title" className="mb-1 block text-xs font-medium text-muted-foreground">{t('countdown.title')}</label>
              <Input
                id="countdown-title"
                data-testid="countdown-title-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('countdown.titlePlaceholder')}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('countdown.date')}</label>
              <DatePicker
                value={targetDate}
                onChange={setTargetDate}
                testId="countdown-date-input"
                className="w-36"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('countdown.time')}</label>
              <TimePicker
                value={targetTime}
                onChange={setTargetTime}
                testId="countdown-time-input"
                ariaLabel={t('countdown.time')}
                className="w-28"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('countdown.color')}</label>
              <div className="flex flex-wrap gap-1">
                {TASK_COLOR_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={t(option.labelKey)}
                    aria-pressed={color === option.value}
                    onClick={() => setColor(option.value)}
                    className={cn(
                      'task-color-swatch flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      taskColorClass(option.value)
                    )}
                  >
                    {color === option.value && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('countdown.imageUrl')}</label>
              <Input
                data-testid="countdown-image-input"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder={t('countdown.imageUrlPlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="countdown-reminder" className="mb-1 block text-xs font-medium text-muted-foreground">{t('countdown.reminder')}</label>
              <select
                id="countdown-reminder"
                data-testid="countdown-reminder-select"
                value={reminderDaysBefore}
                onChange={e => setReminderDaysBefore(e.target.value)}
                className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('countdown.reminderNone')}</option>
                <option value="1">{t('countdown.reminderDays', { count: 1 })}</option>
                <option value="3">{t('countdown.reminderDays', { count: 3 })}</option>
                <option value="7">{t('countdown.reminderDays', { count: 7 })}</option>
              </select>
            </div>
            <Button type="submit" size="sm" disabled={saving || !title.trim() || !targetDate} data-testid="countdown-submit">
              {saving ? '…' : editingId ? t('countdown.update') : t('countdown.save')}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="m-0 text-sm font-medium">{t('countdown.showInCalendar')}</p>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">{t('countdown.showInCalendarHint')}</p>
            </div>
            <Switch
              checked={showInCalendar}
              onCheckedChange={setShowInCalendar}
              aria-label={t('countdown.showInCalendar')}
              data-testid="countdown-show-in-calendar"
            />
          </div>
        </form>
      )}

      {countdowns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 py-16 text-center">
          <Gift className="mb-3 h-10 w-10 text-muted-foreground/35" />
          <p className="text-sm text-muted-foreground">{t('countdown.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="countdown-grid">
          {sortedCountdowns.map(countdown => {
            const days = daysUntil(countdown.targetDate);
            const isPast = days < 0;
            const hasImage = Boolean(countdown.imageUrl);
            return (
              <div
                key={countdown.id}
                data-testid={`countdown-card-${countdown.id}`}
                className={cn(
                  'group relative flex min-h-44 flex-col justify-between overflow-hidden rounded-xl border',
                  taskColorClass(countdown.color),
                  hasImage ? 'countdown-card-image' : 'countdown-card-flat',
                )}
              >
                {hasImage && (
                  <>
                    <img
                      src={countdown.imageUrl!}
                      alt={countdown.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  </>
                )}
                <div className="absolute right-2 top-2 z-20 flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(countdown)}
                    aria-label={t('countdown.edit')}
                    className={cn(
                      'flex min-h-11 min-w-11 items-center justify-center rounded-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100',
                      hasImage ? 'hover:bg-white/20' : 'hover:bg-black/10',
                    )}
                  >
                    <Pencil className={cn('h-3.5 w-3.5', hasImage ? 'text-white' : '')} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(countdown.id)}
                    aria-label={t('countdown.delete')}
                    className={cn(
                      'flex min-h-11 min-w-11 items-center justify-center rounded-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100',
                      hasImage ? 'hover:bg-white/20' : 'hover:bg-black/10',
                    )}
                  >
                    <Trash2 className={cn('h-3.5 w-3.5', hasImage ? 'text-white' : '')} />
                  </button>
                </div>
                <div className="relative z-10 p-4">
                  <div className="mb-1">
                    <span className={cn('text-3xl font-semibold tabular-nums', hasImage && 'text-white')}>
                      {Math.abs(days)}
                    </span>
                    <span className={cn('ml-1 text-sm font-medium', hasImage ? 'text-white/80' : 'opacity-80')}>
                      {isPast ? t('countdown.daysAgo') : t('countdown.daysLeft')}
                    </span>
                  </div>
                </div>
                <div className={cn('relative z-10 p-4 pt-0', hasImage && 'text-white', isPast && 'opacity-60')}>
                  <p className={cn('truncate text-base font-semibold', hasImage && 'text-white', isPast && 'line-through')}>
                    {countdown.title}
                  </p>
                  <p className={cn('text-xs', hasImage ? 'text-white/70' : 'opacity-70')}>
                    {new Date(countdown.targetDate).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
