import Dexie, { type Table } from 'dexie';

// --- IndexedDB schema for offline cache ---

export interface CachedTask {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  projectId: string | null;
  sectionId: string | null;
  parentId: string | null;
  priority: number;
  dueDate: string | null;
  deadlineDate: string | null;
  deadlineTime: string | null;
  deadlineTimeZone: string | null;
  startDate: string | null;
  dueTime: string | null;
  durationMin: number | null;
  rrule: string | null;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedTimeBlock {
  id: string;
  taskId: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  allDay: boolean;
  source: 'MANUAL' | 'RECURRENCE' | 'IMPORT' | 'EXTERNAL';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedProject {
  id: string;
  name: string;
  color: string | null;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedTag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedSection {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedTaskTag {
  id: string; // `${taskId}:${tagId}`
  taskId: string;
  tagId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedNote {
  id: string;
  userId: string;
  taskId: string | null;
  title: string | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedReminder {
  id: string;
  taskId: string;
  remindAt: string;
  type: string;
  isSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CachedProjectColumn {
  id: string;
  projectId: string;
  name: string;
  color: string;
  isDone: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CachedTaskChecklistItem {
  id: string;
  taskId: string;
  title: string;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CachedArea {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PendingMutation {
  id: string;
  table: 'task' | 'timeBlock' | 'project' | 'tag' | 'section' | 'taskTag' | 'note' | 'reminder' | 'projectColumn' | 'taskChecklistItem' | 'area';
  entityId: string;
  operation: 'upsert' | 'delete';
  data: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
}

export interface SyncCursor {
  key: string; // always 'singleton'
  serverTime: string;
  updatedAt: string;
}

class MindoistDB extends Dexie {
  tasks!: Table<CachedTask, string>;
  timeBlocks!: Table<CachedTimeBlock, string>;
  projects!: Table<CachedProject, string>;
  tags!: Table<CachedTag, string>;
  sections!: Table<CachedSection, string>;
  taskTags!: Table<CachedTaskTag, string>;
  notes!: Table<CachedNote, string>;
  reminders!: Table<CachedReminder, string>;
  projectColumns!: Table<CachedProjectColumn, string>;
  taskChecklistItems!: Table<CachedTaskChecklistItem, string>;
  areas!: Table<CachedArea, string>;
  pendingMutations!: Table<PendingMutation, string>;
  syncCursor!: Table<SyncCursor, string>;

  constructor() {
    super('mindoist');
    this.version(4).stores({
      tasks: 'id, projectId, sectionId, parentId, dueDate, completedAt, deletedAt, updatedAt',
      projects: 'id, deletedAt, updatedAt',
      tags: 'id, deletedAt, updatedAt',
      sections: 'id, projectId, deletedAt, updatedAt',
      taskTags: 'id, taskId, tagId, deletedAt, updatedAt',
      notes: 'id, taskId, deletedAt, updatedAt',
      reminders: 'id, taskId, remindAt, updatedAt',
      projectColumns: 'id, projectId, deletedAt, updatedAt',
      taskChecklistItems: 'id, taskId, updatedAt',
      areas: 'id, updatedAt',
      pendingMutations: 'id, table, entityId, createdAt',
      syncCursor: 'key',
    });
    this.version(5).stores({
      timeBlocks: 'id, taskId, startAt, endAt, deletedAt, updatedAt',
    });
  }
}

export const db = new MindoistDB();
