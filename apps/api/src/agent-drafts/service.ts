import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { applyDeadlineInput } from '../tasks/deadline.js';
import { createTaskSchema, updateTaskSchema } from '../tasks/schema.js';

const plannedTimeSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  timeZone: z.string().min(1).default('UTC'),
  allDay: z.boolean().default(false),
}).refine(value => new Date(value.endAt) > new Date(value.startAt), {
  message: 'plannedTime.endAt must be after startAt',
});

const createPayloadSchema = createTaskSchema.extend({
  plannedTime: plannedTimeSchema.optional(),
  tagIds: z.array(z.string().uuid()).max(20).default([]),
  createTagNames: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export const agentDraftInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CREATE_TASK'), payload: createPayloadSchema }),
  z.object({ kind: z.literal('CREATE_TASK_BATCH'), payload: z.object({ tasks: z.array(createPayloadSchema).min(1).max(50) }) }),
  z.object({ kind: z.literal('EDIT_TASK'), payload: z.object({ taskId: z.string().uuid(), patch: updateTaskSchema }) }),
  z.object({
    kind: z.literal('RESCHEDULE'),
    payload: z.object({
      taskId: z.string().uuid(),
      timeBlockId: z.string().uuid().optional(),
      plannedTime: plannedTimeSchema,
    }),
  }),
]);

export const createAgentDraftSchema = z.object({
  transport: z.enum(['TELEGRAM', 'MCP', 'WEB']),
  transportRef: z.string().max(255).optional(),
  expiresAt: z.string().datetime().optional(),
}).and(agentDraftInputSchema);

export type DraftInput = z.infer<typeof agentDraftInputSchema>;
export type CreatePayload = z.infer<typeof createPayloadSchema>;
type Transaction = Prisma.TransactionClient;

export class AgentDraftError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 409 | 410,
  ) {
    super(message);
  }
}

async function assertOwnedTask(tx: Transaction, userId: string, taskId: string) {
  const task = await tx.task.findFirst({ where: { id: taskId, userId, deletedAt: null } });
  if (!task) throw new AgentDraftError('Task not found', 404);
  return task;
}

async function assertOwnedReferences(tx: Transaction, userId: string, input: CreatePayload | z.infer<typeof updateTaskSchema>) {
  const checks: Array<Promise<unknown>> = [];
  if (input.projectId) checks.push(tx.project.findFirstOrThrow({ where: { id: input.projectId, userId, deletedAt: null } }));
  if (input.sectionId) checks.push(tx.section.findFirstOrThrow({ where: { id: input.sectionId, project: { userId } } }));
  if (input.parentId) checks.push(tx.task.findFirstOrThrow({ where: { id: input.parentId, userId, deletedAt: null } }));
  try {
    await Promise.all(checks);
  } catch {
    throw new AgentDraftError('Referenced project, section, or parent task was not found', 404);
  }
  if ('tagIds' in input && input.tagIds && input.tagIds.length > 0) {
    const ownedTagCount = await tx.tag.count({ where: { id: { in: input.tagIds }, userId, deletedAt: null } });
    if (ownedTagCount !== input.tagIds.length) {
      throw new AgentDraftError('A tag is no longer available', 409);
    }
  }
}

function taskData(input: CreatePayload | z.infer<typeof updateTaskSchema>): Record<string, unknown> {
  const { deadline, ...rest } = input;
  const data: Record<string, unknown> = { ...rest };
  delete data.plannedTime;
  delete data.tagIds;
  delete data.createTagNames;
  if ('startDate' in data && data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate as string) : null;
  if ('snoozedUntil' in data && data.snoozedUntil !== undefined) data.snoozedUntil = data.snoozedUntil ? new Date(data.snoozedUntil as string) : null;
  if (deadline !== undefined) applyDeadlineInput(data, deadline);
  return data;
}

async function createTaskFromDraft(tx: Transaction, userId: string, input: CreatePayload): Promise<string[]> {
  await assertOwnedReferences(tx, userId, input);
  const tagIds = new Set(input.tagIds);
  for (const rawName of input.createTagNames) {
    const name = rawName.trim().replace(/^#+/, '').trim();
    if (!name) continue;
    const matches = await tx.tag.findMany({
      where: { userId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
      take: 2,
    });
    if (matches.length > 1) throw new AgentDraftError('Tag name is ambiguous', 409);
    const tag = matches[0] ?? await tx.tag.create({ data: { userId, name }, select: { id: true } });
    tagIds.add(tag.id);
  }
  const task = await tx.task.create({ data: { userId, ...taskData(input) } as Prisma.TaskUncheckedCreateInput });
  if (tagIds.size > 0) {
    await tx.taskTag.createMany({ data: [...tagIds].map(tagId => ({ taskId: task.id, tagId })) });
  }
  const resultIds = [task.id];
  if (input.plannedTime) {
    const block = await tx.timeBlock.create({
      data: {
        userId,
        taskId: task.id,
        startAt: new Date(input.plannedTime.startAt),
        endAt: new Date(input.plannedTime.endAt),
        timeZone: input.plannedTime.timeZone,
        allDay: input.plannedTime.allDay,
        source: 'MANUAL',
      },
    });
    resultIds.push(block.id);
  }
  return resultIds;
}

async function executeDraft(tx: Transaction, userId: string, input: DraftInput): Promise<string[]> {
  if (input.kind === 'CREATE_TASK') return createTaskFromDraft(tx, userId, input.payload);
  if (input.kind === 'CREATE_TASK_BATCH') {
    const resultIds: string[] = [];
    for (const task of input.payload.tasks) resultIds.push(...await createTaskFromDraft(tx, userId, task));
    return resultIds;
  }
  if (input.kind === 'EDIT_TASK') {
    await assertOwnedTask(tx, userId, input.payload.taskId);
    await assertOwnedReferences(tx, userId, input.payload.patch);
    await tx.task.update({
      where: { id: input.payload.taskId },
      data: taskData(input.payload.patch) as Prisma.TaskUncheckedUpdateInput,
    });
    return [input.payload.taskId];
  }

  await assertOwnedTask(tx, userId, input.payload.taskId);
  const planned = input.payload.plannedTime;
  if (input.payload.timeBlockId) {
    const updated = await tx.timeBlock.updateMany({
      where: { id: input.payload.timeBlockId, taskId: input.payload.taskId, userId, deletedAt: null },
      data: {
        startAt: new Date(planned.startAt),
        endAt: new Date(planned.endAt),
        timeZone: planned.timeZone,
        allDay: planned.allDay,
      },
    });
    if (updated.count === 0) throw new AgentDraftError('Time block not found', 404);
    return [input.payload.timeBlockId];
  }
  const block = await tx.timeBlock.create({
    data: {
      userId,
      taskId: input.payload.taskId,
      startAt: new Date(planned.startAt),
      endAt: new Date(planned.endAt),
      timeZone: planned.timeZone,
      allDay: planned.allDay,
      source: 'MANUAL',
    },
  });
  return [block.id];
}

export async function confirmAgentDraft(userId: string, id: string) {
  return prisma.$transaction(async tx => {
    const draft = await tx.agentDraft.findFirst({ where: { id, userId } });
    if (!draft) throw new AgentDraftError('Draft not found', 404);
    if (draft.status === 'CONFIRMED') return draft;
    if (draft.status !== 'PENDING') throw new AgentDraftError(`Draft is ${draft.status.toLowerCase()}`, 409);
    if (draft.expiresAt <= new Date()) {
      await tx.agentDraft.update({ where: { id }, data: { status: 'EXPIRED' } });
      return tx.agentDraft.findUniqueOrThrow({ where: { id } });
    }

    const parsed = agentDraftInputSchema.safeParse({ kind: draft.kind, payload: draft.payload });
    if (!parsed.success) throw new AgentDraftError('Draft payload is invalid', 400);
    const claimed = await tx.agentDraft.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    if (claimed.count === 0) {
      const concurrent = await tx.agentDraft.findFirst({ where: { id, userId } });
      if (concurrent?.status === 'CONFIRMED') return concurrent;
      throw new AgentDraftError('Draft could not be confirmed', 409);
    }

    const resultIds = await executeDraft(tx, userId, parsed.data);
    return tx.agentDraft.update({ where: { id }, data: { resultIds } });
  });
}

export async function createAgentDraft(userId: string, input: unknown) {
  const parsed = createAgentDraftSchema.safeParse(input);
  if (!parsed.success) throw new AgentDraftError('Draft payload is invalid', 400);
  return prisma.agentDraft.create({
    data: {
      userId,
      transport: parsed.data.transport,
      transportRef: parsed.data.transportRef,
      kind: parsed.data.kind,
      payload: parsed.data.payload as Prisma.InputJsonValue,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : new Date(Date.now() + 15 * 60_000),
    },
  });
}

export async function latestAgentDraft(
  userId: string,
  transport: 'TELEGRAM' | 'MCP' | 'WEB',
  transportRef: string,
  kinds?: Array<'CREATE_TASK' | 'CREATE_TASK_BATCH' | 'EDIT_TASK' | 'RESCHEDULE'>,
) {
  return prisma.agentDraft.findFirst({
    where: { userId, transport, transportRef, ...(kinds ? { kind: { in: kinds } } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

export async function cancelAgentDraft(userId: string, id: string) {
  return prisma.$transaction(async tx => {
    const draft = await tx.agentDraft.findFirst({ where: { id, userId } });
    if (!draft) throw new AgentDraftError('Draft not found', 404);
    if (draft.status === 'CONFIRMED') throw new AgentDraftError('Confirmed draft cannot be cancelled', 409);
    if (draft.status === 'PENDING') {
      return tx.agentDraft.update({ where: { id }, data: { status: 'CANCELLED' } });
    }
    return draft;
  });
}
