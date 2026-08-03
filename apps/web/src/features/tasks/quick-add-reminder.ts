import type { Task } from '@mindoist/shared/types';
import { apiFetch } from '../../lib/api-client';

type ReminderTask = Pick<Task, 'id' | 'dueDate' | 'dueTime'>;

export function quickAddReminderAt(
  task: ReminderTask,
  offsetMinutes: number,
  now = new Date(),
): string {
  const dueBase = task.dueDate
    ? new Date(`${task.dueDate.slice(0, 10)}T${task.dueTime || '09:00'}:00`)
    : now;

  return new Date(dueBase.getTime() - offsetMinutes * 60_000).toISOString();
}

export async function createQuickAddReminder(
  task: ReminderTask,
  offsetMinutes: number,
): Promise<void> {
  await apiFetch(`/tasks/${task.id}/reminders`, {
    method: 'POST',
    body: JSON.stringify({ remindAt: quickAddReminderAt(task, offsetMinutes) }),
  });
}
