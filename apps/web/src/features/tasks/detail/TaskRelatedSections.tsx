import type { DragEvent } from 'react';
import type { Task } from '@mindoist/shared/types';
import { ChecklistSection, type ChecklistItem } from './ChecklistSection';
import { SubtaskList } from './SubtaskList';

export interface TaskRelatedSectionsProps {
  task: Task;
  subtasks: Task[];
  checklistItems: ChecklistItem[];
  newSubtask: string;
  addingSubtask: boolean;
  editingSubtaskId: string | null;
  editingTitle: string;
  draggedSubtaskId: string | null;
  dragOverSubtaskId: string | null;
  newChecklistItem: string;
  addingChecklistItem: boolean;
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
  onNewChecklistChange: (value: string) => void;
  onAddChecklist: () => void;
  onToggleChecklist: (item: ChecklistItem) => void;
  onDeleteChecklist: (id: string) => void;
  onChecklistDragStart: (item: ChecklistItem, event: DragEvent) => void;
  onChecklistDragOver: (item: ChecklistItem, event: DragEvent) => void;
  onChecklistDrop: (item: ChecklistItem, event: DragEvent) => void;
}

export function TaskRelatedSections(props: TaskRelatedSectionsProps) {
  return (
    <>
      <SubtaskList {...props} />
      <ChecklistSection {...props} />
    </>
  );
}
