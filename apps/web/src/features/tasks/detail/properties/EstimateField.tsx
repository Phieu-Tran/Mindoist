import { Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePropertyMutation } from './use-property-mutation';
import type { PropertySave } from './types';

interface Props { taskId: string; value: number | ''; save: PropertySave; onChange: (value: number | '') => void }

export function EstimateField({ taskId, value, save, onChange }: Props) {
  const { t } = useTranslation('tasks');
  const { commit, error, saving } = usePropertyMutation(taskId, save);
  const persist = () => void commit({ estimateMin: value === '' ? null : Number(value) });
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-0.5 rounded-control bg-background/75 px-1.5 transition-colors focus-within:ring-2 focus-within:ring-ring xl:min-h-7" title={error ?? undefined}>
      <Timer className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input type="number" min={0} value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} onBlur={persist} onKeyDown={(event) => { if (event.key === 'Enter') persist(); }} disabled={saving} placeholder="—" aria-label={t('detail.duration', 'Duration')} className="w-7 bg-transparent text-right text-xs outline-none" data-testid="detail-duration-min" />
      <span className="text-xs text-muted-foreground">m</span>
    </div>
  );
}
