import { endOfDay, startOfDay } from './date.js';
import { countTasks } from './repository.js';

export interface TaskCounts {
  inbox: number;
  today: number;
  next7: number;
  overdue: number;
  completed: number;
  trashed: number;
}

export async function getTaskCounts(userId: string, now = new Date()): Promise<TaskCounts> {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const next7End = new Date(todayEnd);
  next7End.setDate(next7End.getDate() + 7);

  const base = {
    userId,
    deletedAt: null as null,
    parentId: null as null,
  };

  const [inbox, today, next7, overdue, completed, trashed] = await Promise.all([
    countTasks({ ...base, completedAt: null, dueDate: null }),
    countTasks({ ...base, completedAt: null, dueDate: { gte: todayStart, lte: todayEnd } }),
    countTasks({ ...base, completedAt: null, dueDate: { gt: todayEnd, lte: next7End } }),
    countTasks({ ...base, completedAt: null, dueDate: { lt: todayStart } }),
    countTasks({ ...base, completedAt: { not: null } }),
    countTasks({ userId, deletedAt: { not: null }, parentId: null }),
  ]);

  return {
    inbox,
    today,
    next7,
    overdue,
    completed,
    trashed,
  };
}
