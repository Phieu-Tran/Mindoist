export type TimeBlockSource = 'MANUAL' | 'RECURRENCE' | 'IMPORT' | 'EXTERNAL';

export interface TimeBlock {
  id: string;
  userId: string;
  taskId: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  allDay: boolean;
  source: TimeBlockSource;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  completedAt?: string | null;
  actualMin?: number | null;
}

export interface CreateTimeBlockRequest {
  taskId: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  allDay?: boolean;
  source?: TimeBlockSource;
  completedAt?: string | null;
  actualMin?: number | null;
}

export interface UpdateTimeBlockRequest {
  startAt?: string;
  endAt?: string;
  timeZone?: string;
  allDay?: boolean;
  completedAt?: string | null;
  actualMin?: number | null;
}
