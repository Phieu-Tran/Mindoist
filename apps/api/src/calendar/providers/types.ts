import type { Task, TimeBlock } from '@prisma/client';

export type CalendarProviderId = 'google';

export interface ProviderCalendar {
  externalId: string;
  name: string;
  color?: string | null;
  timeZone?: string | null;
  readOnly: boolean;
}

export interface ProviderEventWriteResult {
  externalEventId: string;
  etag: string | null;
}

export interface CalendarProviderEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
}

export interface CalendarProvider {
  readonly id: CalendarProviderId;
  getAuthUrl(userId: string): string;
  isConnected(userId: string): Promise<boolean>;
  disconnect(userId: string): Promise<void>;
  sync(userId: string): Promise<void>;
  listEvents(userId: string, from?: string, to?: string): Promise<CalendarProviderEvent[]>;
  ensureCalendar(userId: string): Promise<ProviderCalendar>;
  upsertTimeBlock(
    userId: string,
    calendar: ProviderCalendar,
    timeBlock: TimeBlock,
    task: Task,
    existing?: { externalEventId: string; etag: string | null },
  ): Promise<ProviderEventWriteResult>;
  deleteEvent(
    userId: string,
    calendar: ProviderCalendar,
    externalEventId: string,
  ): Promise<void>;
}
