import type { Tag, UpdateTaskRequest } from '@mindoist/shared/types';
import type { RecurrencePreset } from '@mindoist/shared/recurrence/utils';

export type PropertySave = (patch: UpdateTaskRequest) => Promise<void> | void;

export interface ProjectOption {
  id: string;
  name: string;
  color?: string | null;
}

export interface TaskPropertyDraft {
  color: string;
  deadlineDate: string;
  deadlineTime: string;
  startDate: string;
  priority: number | null;
  projectId: string;
  tagIds: string[];
  estimateMin: number | '';
  recurrencePreset: RecurrencePreset;
  customRrule: string;
  recurrenceBasis: 'DUE_DATE' | 'COMPLETION_DATE';
  recurringResetMode: 'RESET' | 'KEEP';
}

export interface TaskPropertyEditorProps {
  taskId: string;
  completedAt: string | null;
  deadlineTimeZone?: string | null;
  draft: TaskPropertyDraft;
  projects: ProjectOption[];
  tags: Tag[];
  onCreateTag?: (name: string) => Promise<Tag>;
  onDeleteTag?: (id: string) => Promise<void>;
  save: PropertySave;
  onDraftChange: <K extends keyof TaskPropertyDraft>(key: K, value: TaskPropertyDraft[K]) => void;
  onTasksChanged?: () => void;
  onColorPreview?: (color: string) => void;
}
