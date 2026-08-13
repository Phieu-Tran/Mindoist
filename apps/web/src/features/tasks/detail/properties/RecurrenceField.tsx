import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildRrule, type RecurrencePreset } from '@mindoist/shared/recurrence/utils';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDismissiblePopover } from './use-dismissible-popover';
import { usePropertyMutation } from './use-property-mutation';
import type { PropertySave, TaskPropertyDraft } from './types';

interface Props {
  taskId: string;
  value: Pick<TaskPropertyDraft, 'recurrencePreset' | 'customRrule' | 'recurrenceBasis' | 'recurringResetMode'>;
  save: PropertySave;
  onChange: (
    key: 'recurrencePreset' | 'customRrule' | 'recurrenceBasis' | 'recurringResetMode',
    value: RecurrencePreset | string | 'DUE_DATE' | 'COMPLETION_DATE' | 'RESET' | 'KEEP',
  ) => void;
}

const optionValues: RecurrencePreset[] = [null, 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom'];

export function RecurrenceField({ taskId, value, save, onChange }: Props) {
  const { t } = useTranslation('tasks');
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissiblePopover(open, close, menuRef);
  const { commit, error } = usePropertyMutation(taskId, save);
  const labels = [t('detail.noRecurrence'), t('detail.repeatDaily', 'Daily'), t('detail.repeatWeekdays', 'Weekdays'), t('detail.repeatWeekly', 'Weekly'), t('detail.repeatBiweekly', 'Every 2 weeks'), t('detail.repeatMonthly', 'Monthly'), t('detail.repeatYearly', 'Yearly'), t('detail.repeatCustom', 'Custom RRULE')];
  const select = (preset: RecurrencePreset) => {
    onChange('recurrencePreset', preset);
    setOpen(false);
    void commit({ rrule: buildRrule(preset, value.customRrule) || null });
  };
  const setBasis = (basis: 'DUE_DATE' | 'COMPLETION_DATE') => {
    onChange('recurrenceBasis', basis);
    void commit({ recurrenceBasis: basis });
  };
  const setResetMode = (mode: 'RESET' | 'KEEP') => {
    onChange('recurringResetMode', mode);
    void commit({ recurringResetMode: mode });
  };
  const toggleMenu = () => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const menuWidth = 176;
        const menuHeight = 292;
        const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
        const below = rect.bottom + 4;
        const top = below + menuHeight <= window.innerHeight - 8
          ? below
          : Math.max(8, rect.top - menuHeight - 4);
        setMenuPosition({ left, top });
      }
    }
    setOpen((current) => !current);
  };
  return (
    <div className="grid gap-1" title={error ?? undefined}>
      <div ref={ref} className="relative shrink-0">
        <button ref={triggerRef} type="button" onClick={toggleMenu} aria-haspopup="listbox" aria-expanded={open} aria-label={t('detail.recurrence')} data-testid="detail-recurrence-select" data-value={value.recurrencePreset || ''} title={value.recurrencePreset ? `${t('detail.recurrence')}: ${value.recurrencePreset}` : t('detail.noRecurrence')} className={cn('flex h-11 w-11 items-center justify-center rounded-control bg-background/75 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:h-7 xl:w-7', value.recurrencePreset && 'text-primary')}><Repeat className="h-3.5 w-3.5" aria-hidden="true" /></button>
        {open && createPortal(<div ref={menuRef} role="listbox" aria-label={t('detail.recurrence')} style={menuPosition} className="frosted-surface fixed z-[100] max-h-[calc(100vh-1rem)] w-44 overflow-y-auto rounded-panel border border-border bg-card p-1 shadow-lg">{optionValues.map((preset, index) => {
          const selected = value.recurrencePreset === preset;
          return <button key={preset || 'none'} type="button" role="option" aria-selected={selected} onClick={() => select(preset)} className={cn('flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected && 'bg-muted font-medium')}><Check className={cn('h-3 w-3 shrink-0', !selected && 'opacity-0')} aria-hidden="true" /><span className="truncate">{labels[index]}</span></button>;
        })}</div>, document.body)}
      </div>
      {value.recurrencePreset === 'custom' && <div className="flex items-center gap-2"><label className="w-16 shrink-0 text-xs text-muted-foreground">{t('detail.customRrule', 'RRULE')}</label><Input value={value.customRrule} onChange={(event) => onChange('customRrule', event.target.value)} onBlur={() => void commit({ rrule: value.customRrule || null })} placeholder="FREQ=DAILY;INTERVAL=3" spellCheck={false} className="h-11 flex-1 border-border/70 bg-background font-mono text-xs xl:h-7" data-testid="detail-custom-rrule" /></div>}
      {value.recurrencePreset && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5"><label className="text-xs text-muted-foreground">{t('detail.basis', 'Basis')}</label><div className="flex gap-1"><button type="button" data-testid="detail-basis-due" onClick={() => setBasis('DUE_DATE')} className={cn('min-h-11 rounded-control px-2 py-0.5 text-xs transition-colors xl:min-h-7', value.recurrenceBasis === 'DUE_DATE' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{t('detail.basisDueDate', 'Due date')}</button><button type="button" data-testid="detail-basis-completion" onClick={() => setBasis('COMPLETION_DATE')} className={cn('min-h-11 rounded-control px-2 py-0.5 text-xs transition-colors xl:min-h-7', value.recurrenceBasis === 'COMPLETION_DATE' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{t('detail.basisCompletion', 'Completion')}</button></div></div>
        <div className="flex items-center gap-1.5"><label className="text-xs text-muted-foreground">{t('detail.resetMode', 'Sub-tasks')}</label><div className="flex gap-1"><button type="button" data-testid="detail-reset-reset" onClick={() => setResetMode('RESET')} className={cn('min-h-11 rounded-control px-2 py-0.5 text-xs transition-colors xl:min-h-7', value.recurringResetMode === 'RESET' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{t('detail.resetModeReset', 'Reset')}</button><button type="button" data-testid="detail-reset-keep" onClick={() => setResetMode('KEEP')} className={cn('min-h-11 rounded-control px-2 py-0.5 text-xs transition-colors xl:min-h-7', value.recurringResetMode === 'KEEP' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{t('detail.resetModeKeep', 'Keep')}</button></div></div>
      </div>}
    </div>
  );
}
