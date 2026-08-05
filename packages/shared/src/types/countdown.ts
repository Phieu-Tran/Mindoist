export interface Countdown {
  id: string;
  userId: string;
  title: string;
  targetDate: string;
  color: string | null;
  imageUrl: string | null;
  reminderDaysBefore: number | null;
  showInCalendar: boolean;
  notificationSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateCountdownRequest {
  title: string;
  targetDate: string;
  color?: string;
  imageUrl?: string;
  reminderDaysBefore?: number | null;
  showInCalendar?: boolean;
}

export interface UpdateCountdownRequest {
  title?: string;
  targetDate?: string;
  color?: string | null;
  imageUrl?: string | null;
  reminderDaysBefore?: number | null;
  showInCalendar?: boolean;
}
