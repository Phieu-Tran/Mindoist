import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

export const taskTagsInclude = {
  taskTags: {
    select: {
      tagId: true,
    },
  },
} as const;

export function countTasks(where: Prisma.TaskWhereInput) {
  return prisma.task.count({ where });
}

export function findOwnedTask(
  userId: string,
  taskId: string,
  options: { includeDeleted?: boolean } = {},
) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
      ...(options.includeDeleted ? {} : { deletedAt: null }),
    },
  });
}

export function findOwnedTaskWithTags(userId: string, taskId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
      deletedAt: null,
    },
    include: taskTagsInclude,
  });
}
