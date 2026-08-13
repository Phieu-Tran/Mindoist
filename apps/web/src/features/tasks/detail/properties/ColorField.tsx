import { useCallback, useState } from 'react';
import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TASK_COLOR_OPTIONS, taskColorClass } from '@/lib/task-colors';
import { cn } from '@/lib/utils';
import { useDismissiblePopover } from './use-dismissible-popover';
import { usePropertyMutation } from './use-property-mutation';
import type { PropertySave } from './types';

interface Props { taskId: string; value: string; save: PropertySave; onChange: (value: string) => void; onPreview?: (value: string) => void }

export function ColorField({ taskId, value, save, onChange, onPreview }: Props) {
  const { t } = useTranslation('tasks');
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissiblePopover(open, close);
  const { commit, error } = usePropertyMutation(taskId, save);
  const select = (next: string) => {
    onChange(next);
    onPreview?.(next);
    setOpen(false);
    void commit({ color: next || null });
  };
  const label = value ? t(TASK_COLOR_OPTIONS.find((option) => option.value === value)?.labelKey ?? 'detail.noColor') : t('detail.noColor');
  return (
    <div ref={ref} className="relative shrink-0" title={error ?? undefined}>
      <button type="button" data-testid="detail-color" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-11 items-center gap-1.5 rounded-md border-0 bg-background/75 px-2 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:h-7">
        <span data-testid="detail-color-dot" className={cn('h-3 w-3 rounded-full', value ? ['task-color-swatch', taskColorClass(value)] : 'bg-muted-foreground/35')} aria-hidden="true" />
        <span>{t('detail.color')}</span>
      </button>
      {open && (
        <div role="dialog" aria-label={t('detail.color')} className="absolute right-0 top-full z-50 mt-1 rounded-xl border-0 bg-popover p-2.5 shadow-xl">
          <p className="mb-2 px-0.5 text-[0.68rem] font-semibold text-foreground">{t('detail.color')}</p>
          <div role="listbox" aria-label={t('detail.color')} className="mindoist-detail-color-grid grid gap-2">
            <button type="button" role="option" aria-label={t('detail.noColor')} aria-selected={!value} onClick={() => select('')} className="mindoist-detail-color-option flex items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{!value ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}</button>
            {TASK_COLOR_OPTIONS.map((option) => <button key={option.value} type="button" role="option" data-testid={`detail-color-${option.value}`} aria-label={t(option.labelKey)} aria-selected={value === option.value} onClick={() => select(option.value)} className={cn('mindoist-detail-color-option task-color-swatch flex items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', taskColorClass(option.value))}>{value === option.value && <Check className="h-3.5 w-3.5 text-white" />}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
