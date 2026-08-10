import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

export function findOwnedTimeBlock(userId: string, timeBlockId: string) {
  return prisma.timeBlock.findFirst({
    where: {
      id: timeBlockId,
      userId,
      deletedAt: null,
    },
  });
}

export function listOwnedTimeBlocks(userId: string, where: Prisma.TimeBlockWhereInput = {}) {
  return prisma.timeBlock.findMany({
    where: {
      ...where,
      userId,
      deletedAt: null,
    },
    orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
  });
}

export function createOwnedTimeBlock(data: Prisma.TimeBlockUncheckedCreateInput) {
  return prisma.timeBlock.create({ data });
}

export function updateTimeBlockById(
  timeBlockId: string,
  data: Prisma.TimeBlockUncheckedUpdateInput,
) {
  return prisma.timeBlock.update({
    where: { id: timeBlockId },
    data,
  });
}
