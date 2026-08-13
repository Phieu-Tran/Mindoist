import type { RefObject } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTimeDisplay } from './formatters';

export interface TaskReminder {
  id: string;
  remindAt: string;
  type: string;
  isSent: boolean;
}

interface Props {
  reminders: TaskReminder[];
  reminderMenuOpen: boolean;
  customReminderTime: string;
  reminderMenuRef: RefObject<HTMLDivElement | null>;
  onDelete: (id: string) => void;
  onToggleMenu: () => void;
  onAdd: (offsetMs: number) => void;
  onCustomTimeChange: (value: string) => void;
  onAddCustom: () => void;
}

export function TaskRemindersSection({ reminders, reminderMenuOpen, customReminderTime, reminderMenuRef, onDelete, onToggleMenu, onAdd, onCustomTimeChange, onAddCustom }: Props) {
  const { t } = useTranslation('tasks');
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-muted/25 p-3" data-testid="detail-reminders">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">{t('detail.reminders')}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {reminders.map(reminder => (
          <div key={reminder.id} className="group flex items-center gap-1 rounded-full bg-background/80 py-1 pl-2 pr-1 text-xs">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{formatDateTimeDisplay(new Date(reminder.remindAt))}</span>
            <button type="button" onClick={() => onDelete(reminder.id)} aria-label={t('detail.deleteReminder')} className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={t('detail.deleteReminder')}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {reminders.length === 0 && <span className="text-xs text-muted-foreground/60">{t('detail.noReminders')}</span>}
        <div className="relative" ref={reminderMenuRef}>
          <button type="button" onClick={onToggleMenu} className="flex min-h-11 items-center gap-1 rounded-full bg-background/75 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-8">
            <Plus className="h-3.5 w-3.5" />{t('detail.addReminder')}
          </button>
          {reminderMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-panel border border-border bg-card py-1 shadow-lg">
              {([[5, 'reminder5m'], [15, 'reminder15m'], [30, 'reminder30m'], [60, 'reminder1h'], [24 * 60, 'reminder1d']] as const).map(([minutes, label]) => (
                <button key={label} type="button" className="min-h-11 w-full px-3 py-1.5 text-left text-sm hover:bg-muted xl:min-h-8" onClick={() => onAdd(minutes * 60_000)}>{t(`detail.${label}`)}</button>
              ))}
              <div className="border-t border-border/50 px-3 py-1.5">
                <input type="datetime-local" value={customReminderTime} onChange={event => onCustomTimeChange(event.target.value)} className="w-full rounded border border-border/70 bg-background px-2 py-1 text-xs" />
                <button type="button" onClick={onAddCustom} disabled={!customReminderTime} className="mt-1 min-h-11 w-full rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 xl:min-h-8">{t('detail.reminderCustom')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
