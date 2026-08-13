import { addDatabaseDateDays, toDatabaseDate } from './date.js';
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
  const todayDate = toDatabaseDate(now);
  const next7End = addDatabaseDateDays(todayDate, 7);

  const base = {
    userId,
    deletedAt: null as null,
    parentId: null as null,
  };

  const [inbox, today, next7, overdue, completed, trashed] = await Promise.all([
    countTasks({ ...base, completedAt: null, deadlineDate: null }),
    countTasks({ ...base, completedAt: null, deadlineDate: todayDate }),
    countTasks({ ...base, completedAt: null, deadlineDate: { gt: todayDate, lte: next7End } }),
    countTasks({ ...base, completedAt: null, deadlineDate: { lt: todayDate } }),
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
