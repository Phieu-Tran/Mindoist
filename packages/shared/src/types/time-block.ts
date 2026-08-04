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
}

export interface CreateTimeBlockRequest {
  taskId: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  allDay?: boolean;
  source?: TimeBlockSource;
}

export interface UpdateTimeBlockRequest {
  startAt?: string;
  endAt?: string;
  timeZone?: string;
  allDay?: boolean;
}
