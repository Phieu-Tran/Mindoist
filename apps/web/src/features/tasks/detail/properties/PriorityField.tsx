import { useCallback, useState } from 'react';
import { ChevronDown, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDismissiblePopover } from './use-dismissible-popover';
import { usePropertyMutation } from './use-property-mutation';
import type { PropertySave } from './types';

interface Props { taskId: string; value: number | null; save: PropertySave; onChange: (value: number | null) => void }

export function PriorityField({ taskId, value, save, onChange }: Props) {
  const { t } = useTranslation('tasks');
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissiblePopover(open, close);
  const { commit, error } = usePropertyMutation(taskId, save);
  const select = (next: number | null) => {
    onChange(next);
    setOpen(false);
    void commit({ priority: next });
  };
  return (
    <div ref={ref} className="relative shrink-0" title={error ?? undefined}>
      <button type="button" data-testid="detail-priority" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} title={value != null ? t(`calendar.priority${value}`) : t('detail.noPriority')} style={value != null ? { color: `var(--color-p${value})` } : undefined} className={cn('flex min-h-11 items-center gap-1.5 rounded-control bg-background/75 px-2 text-xs font-medium transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-7', value == null && 'font-normal text-muted-foreground')}>
        <Flag className="h-3 w-3 shrink-0" aria-hidden="true" /><span>{value != null ? `P${value}` : '—'}</span><ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="frosted-surface absolute left-0 z-50 mt-1 w-full min-w-[11rem] rounded-panel border border-border bg-card p-1 shadow-lg" role="listbox" aria-label={t('detail.priority')}>
          <button type="button" role="option" aria-selected={value == null} onClick={() => select(null)} className={cn('flex min-h-11 w-full items-center rounded-control px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted xl:min-h-8', value == null && 'bg-muted font-medium')}>{t('detail.noPriority')}</button>
          {[1, 2, 3, 4].map((priority) => <button key={priority} type="button" role="option" data-testid={`detail-priority-${priority}`} aria-selected={value === priority} onClick={() => select(priority)} style={{ color: `var(--color-p${priority})` }} className={cn('flex min-h-11 w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted xl:min-h-8', value === priority && 'bg-muted')}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--color-p${priority})` }} />{t(`calendar.priority${priority}`)}</button>)}
        </div>
      )}
    </div>
  );
}
