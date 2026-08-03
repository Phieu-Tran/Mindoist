export type SmartListFilter = 'today' | 'upcoming' | 'overdue' | 'completed';

export interface TaskDeadline {
  date: string;
  time?: string;
  timeZone?: string;
}

export interface Task {
  id: string;
  userId: string;
  projectId: string | null;
  projectColumnId: string | null;
  sectionId: string | null;
  parentId: string | null;
  title: string;
  description: string | null;
  color: string | null;
  priority: number | null;
  dueDate: string | null;
  dueTime: string | null;
  deadline?: TaskDeadline | null;
  deadlineDate?: string | null;
  deadlineTime?: string | null;
  deadlineTimeZone?: string | null;
  startDate: string | null;
  durationMin: number | null;
  rrule: string | null;
  recurringResetMode: 'RESET' | 'KEEP' | null;
  recurrenceBasis: 'DUE_DATE' | 'COMPLETION_DATE' | null;
  pomodoroCount: number;
  dueNotificationSentAt?: string | null;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  tagIds: string[];
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  projectId?: string;
  projectColumnId?: string;
  sectionId?: string;
  parentId?: string;
  color?: string | null;
  priority?: number | null;
  dueDate?: string;
  dueTime?: string;
  deadline?: TaskDeadline | null;
  startDate?: string;
  durationMin?: number;
  rrule?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  projectId?: string | null;
  projectColumnId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  color?: string | null;
  priority?: number | null;
  dueDate?: string | null;
  dueTime?: string | null;
  deadline?: TaskDeadline | null;
  startDate?: string | null;
  durationMin?: number | null;
  rrule?: string | null;
  recurringResetMode?: 'RESET' | 'KEEP' | null;
  recurrenceBasis?: 'DUE_DATE' | 'COMPLETION_DATE' | null;
  sortOrder?: number;
  tagIds?: string[];
}
