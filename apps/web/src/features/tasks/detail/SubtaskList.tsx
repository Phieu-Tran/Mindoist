import type { DragEvent, KeyboardEvent } from 'react';
import { CornerDownRight, CornerUpLeft, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@mindoist/shared/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SubtaskListProps {
  task: Task;
  subtasks: Task[];
  newSubtask: string;
  addingSubtask: boolean;
  editingSubtaskId: string | null;
  editingTitle: string;
  draggedSubtaskId: string | null;
  dragOverSubtaskId: string | null;
  onNewSubtaskChange: (value: string) => void;
  onAddSubtask: () => void;
  onToggleSubtask: (task: Task) => void;
  onEditSubtask: (task: Task) => void;
  onSaveSubtask: (task: Task) => void;
  onSelectTask?: (task: Task) => void;
  onPromoteSubtask: (task: Task) => void;
  onDemoteSubtask: (task: Task) => void;
  onDeleteSubtask: (task: Task) => void;
  onSubtaskDragStart: (task: Task, event: DragEvent) => void;
  onSubtaskDragOver: (task: Task, event: DragEvent) => void;
  onSubtaskDrop: (task: Task, event: DragEvent) => void;
  onDragLeave: () => void;
  onDragEnd: () => void;
  onEditingTitleChange: (value: string) => void;
  onEditingCancel: () => void;
}

export function SubtaskList(props: SubtaskListProps) {
  const { t } = useTranslation('tasks');
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, subtask: Task) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onSaveSubtask(subtask);
    }
    if (event.key === 'Escape') props.onEditingCancel();
  };

  return (
    <div data-testid="detail-subtasks" className="flex flex-col gap-2 rounded-xl bg-muted/25 p-3">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('detail.subtasks')}
        {props.subtasks.length > 0 && ` · ${props.subtasks.filter((item) => item.completedAt).length}/${props.subtasks.length}`}
      </span>
      {props.subtasks.map((subtask) => (
        <div
          key={subtask.id}
          data-testid={`subtask-${subtask.id}`}
          draggable
          onDragStart={(event) => props.onSubtaskDragStart(subtask, event)}
          onDragOver={(event) => props.onSubtaskDragOver(subtask, event)}
          onDragLeave={props.onDragLeave}
          onDrop={(event) => props.onSubtaskDrop(subtask, event)}
          onDragEnd={props.onDragEnd}
          className={cn(
            'group flex min-h-9 items-center gap-2.5',
            props.draggedSubtaskId === subtask.id && 'opacity-40',
            props.dragOverSubtaskId === subtask.id && 'ring-2 ring-inset ring-primary',
          )}
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          <Checkbox
            data-testid={`subtask-toggle-${subtask.id}`}
            checked={!!subtask.completedAt}
            onCheckedChange={() => props.onToggleSubtask(subtask)}
            className="shrink-0"
          />
          {props.editingSubtaskId === subtask.id ? (
            <Input
              data-testid={`subtask-edit-${subtask.id}`}
              value={props.editingTitle}
              onChange={(event) => props.onEditingTitleChange(event.target.value)}
              onKeyDown={(event) => onKeyDown(event, subtask)}
              onBlur={() => props.onSaveSubtask(subtask)}
              autoFocus
              className="h-11 flex-1 border-transparent bg-background/80 text-sm xl:h-7"
            />
          ) : (
            <button
              type="button"
              data-testid={`subtask-title-${subtask.id}`}
              onClick={() => props.onEditSubtask(subtask)}
              onDoubleClick={() => props.onSelectTask?.(subtask)}
              className={cn(
                'min-w-0 flex-1 truncate text-left text-sm transition-colors',
                subtask.completedAt ? 'line-through text-muted-foreground' : 'text-foreground hover:text-primary',
              )}
            >
              {subtask.title}
            </button>
          )}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" data-testid={`subtask-promote-${subtask.id}`} onClick={() => props.onPromoteSubtask(subtask)} aria-label={t('detail.promoteSubtask')} title={t('detail.promoteSubtask')} className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:h-7 xl:w-7"><CornerUpLeft className="h-3.5 w-3.5" /></button>
            <button type="button" data-testid={`subtask-demote-${subtask.id}`} onClick={() => props.onDemoteSubtask(subtask)} aria-label={t('detail.demoteSubtask')} title={t('detail.demoteSubtask')} className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:h-7 xl:w-7"><CornerDownRight className="h-3.5 w-3.5" /></button>
            <button type="button" data-testid={`subtask-delete-${subtask.id}`} onClick={() => props.onDeleteSubtask(subtask)} aria-label={t('detail.deleteSubtask')} title={t('detail.deleteSubtask')} className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:h-7 xl:w-7"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ))}
      {!props.task.parentId && (
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            data-testid="subtask-input"
            value={props.newSubtask}
            onChange={(event) => props.onNewSubtaskChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                props.onAddSubtask();
              }
            }}
            placeholder={t('detail.addSubtask')}
            disabled={props.addingSubtask}
            className="h-9 flex-1 border-transparent bg-background/80 text-sm focus-visible:border-ring"
          />
        </div>
      )}
    </div>
  );
}
