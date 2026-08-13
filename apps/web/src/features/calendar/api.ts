import type {
  CreateTimeBlockRequest,
  TimeBlock,
  UpdateTimeBlockRequest,
} from '@mindoist/shared/types';
import { apiFetch } from '@/lib/api-client';
import type { CalendarProjection } from './projection';

export interface TimeBlockListQuery {
  taskId?: string;
  from?: string;
  to?: string;
}

export function listTimeBlocks(query: TimeBlockListQuery = {}): Promise<TimeBlock[]> {
  const params = new URLSearchParams();
  if (query.taskId) params.set('taskId', query.taskId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const suffix = params.size > 0 ? `?${params}` : '';
  return apiFetch<TimeBlock[]>(`/time-blocks${suffix}`);
}

export function createTimeBlock(input: CreateTimeBlockRequest): Promise<TimeBlock> {
  return apiFetch<TimeBlock>('/time-blocks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTimeBlock(
  id: string,
  input: UpdateTimeBlockRequest,
): Promise<TimeBlock> {
  return apiFetch<TimeBlock>(`/time-blocks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteTimeBlock(id: string): Promise<void> {
  return apiFetch<void>(`/time-blocks/${id}`, { method: 'DELETE' });
}

export function getCalendarProjection(from: string, to: string): Promise<CalendarProjection> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const params = new URLSearchParams({ from, to, timeZone });
  return apiFetch<CalendarProjection>(`/calendar/projection?${params}`);
}
