import type { DragEvent } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ChecklistItem {
  id: string;
  title: string;
  completedAt: string | null;
  sortOrder: number;
}

export interface ChecklistSectionProps {
  checklistItems: ChecklistItem[];
  newChecklistItem: string;
  addingChecklistItem: boolean;
  onNewChecklistChange: (value: string) => void;
  onAddChecklist: () => void;
  onToggleChecklist: (item: ChecklistItem) => void;
  onDeleteChecklist: (id: string) => void;
  onChecklistDragStart: (item: ChecklistItem, event: DragEvent) => void;
  onChecklistDragOver: (item: ChecklistItem, event: DragEvent) => void;
  onChecklistDrop: (item: ChecklistItem, event: DragEvent) => void;
}

export function ChecklistSection(props: ChecklistSectionProps) {
  const { t } = useTranslation('tasks');
  return (
    <div data-testid="detail-checklist" className="flex flex-col gap-2 rounded-xl bg-muted/25 p-3">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('detail.checklist')}
        {props.checklistItems.length > 0 && ` · ${props.checklistItems.filter((item) => item.completedAt).length}/${props.checklistItems.length}`}
      </span>
      {props.checklistItems.map((item) => (
        <div
          key={item.id}
          draggable
          onDragStart={(event) => props.onChecklistDragStart(item, event)}
          onDragOver={(event) => props.onChecklistDragOver(item, event)}
          onDrop={(event) => props.onChecklistDrop(item, event)}
          className="group flex min-h-11 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50"
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
          <Checkbox checked={!!item.completedAt} onCheckedChange={() => props.onToggleChecklist(item)} className="h-4 w-4 shrink-0" />
          <span className={cn('flex-1 text-sm', item.completedAt && 'line-through text-muted-foreground')}>{item.title}</span>
          <button type="button" onClick={() => props.onDeleteChecklist(item.id)} aria-label={t('detail.deleteChecklistItem')} title={t('detail.deleteChecklistItem')} className="shrink-0 rounded-control p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          data-testid="checklist-input"
          value={props.newChecklistItem}
          onChange={(event) => props.onNewChecklistChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              props.onAddChecklist();
            }
          }}
          placeholder={t('detail.addChecklistItem')}
          disabled={props.addingChecklistItem}
          className="h-9 flex-1 border-transparent bg-background/80 text-sm focus-visible:border-ring"
        />
      </div>
    </div>
  );
}
