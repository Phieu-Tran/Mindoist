import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAgentAuth } from './auth.js';
import { hitTelegramRateLimit } from './rate-limit.js';
import {
  cancelTelegramTaskBatchDraft,
  cancelTelegramTaskDraft,
  confirmTelegramTaskBatchDraft,
  confirmTelegramTaskDraft,
  prepareTelegramTaskBatchDraft,
  prepareTelegramTaskDraft,
  telegramTaskColors,
} from './task-drafts.js';
import {
  listTelegramTasks,
  summarizeTelegramTasks,
  telegramTaskPeriods,
} from './task-queries.js';
import {
  TelegramLinkError,
  authorizeTelegramMessage,
  consumeTelegramLinkChallenge,
  createTelegramLinkChallenge,
  disconnectTelegram,
  getTelegramStatus,
} from './service.js';

const telegramId = z.string().regex(/^\d{1,20}$/);
const consumeSchema = z.object({
  code: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
  telegramUserId: telegramId,
  telegramChatId: telegramId,
  chatType: z.literal('private'),
  telegramUsername: z.string().max(64).optional(),
  telegramDisplayName: z.string().max(128).optional(),
});
const authorizeSchema = z.object({
  telegramUserId: telegramId,
  telegramChatId: telegramId,
  chatType: z.literal('private'),
  telegramMessageId: telegramId.optional(),
  telegramMessageDate: z.number().int().nonnegative().optional(),
}).superRefine((value, context) => {
  if ((value.telegramMessageId === undefined) !== (value.telegramMessageDate === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['telegramMessageId'],
      message: 'telegramMessageId and telegramMessageDate must be provided together',
    });
  }
});
const locale = z.enum(['vi', 'en']).default('en');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid date');
const taskDraftSchema = z.object({
  telegramChatId: telegramId,
  locale,
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5_000).optional(),
  projectName: z.string().trim().min(1).max(200).optional(),
  color: z.enum(telegramTaskColors).optional(),
  tagNames: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  priority: z.number().int().min(1).max(4).nullable().optional(),
  dueDate: isoDate.optional(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
}).superRefine((value, context) => {
  if (value.dueTime && !value.dueDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueTime'], message: 'dueTime requires dueDate' });
  }
});
const taskBatchDraftSchema = z.object({
  telegramChatId: telegramId,
  locale,
  titles: z.array(z.string().trim().min(1).max(160)).min(2).max(20),
  projectName: z.string().trim().min(1).max(200).optional(),
  color: z.enum(telegramTaskColors).optional(),
  tagNames: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  createTagNames: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  priority: z.number().int().min(1).max(4).nullable().optional(),
  dueDate: isoDate.optional(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
}).superRefine((value, context) => {
  if (value.dueTime && !value.dueDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueTime'], message: 'dueTime requires dueDate' });
  }
  const titleKeys = value.titles.map(title => title.toLocaleLowerCase('vi'));
  if (new Set(titleKeys).size !== titleKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['titles'], message: 'duplicate titles are not allowed' });
  }
  const tagKeys = [...(value.tagNames ?? []), ...(value.createTagNames ?? [])]
    .map(name => name.replace(/^#+/, '').trim().toLocaleLowerCase('vi'));
  if (new Set(tagKeys).size > 10) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tagNames'], message: 'at most 10 tags are allowed' });
  }
});
const taskDraftActionSchema = z.object({ telegramChatId: telegramId, locale });
const taskQuerySchema = z.object({
  telegramChatId: telegramId,
  locale,
  period: z.enum(telegramTaskPeriods),
  date: isoDate.optional(),
  projectName: z.string().trim().min(1).max(200).optional(),
  tagNames: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  status: z.enum(['open', 'completed', 'all']).optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).superRefine((value, context) => {
  if (value.period === 'date' && !value.date) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'date is required' });
  }
});

function limited(reply: FastifyReply, retryAfterSeconds: number) {
  reply.header('Retry-After', String(retryAfterSeconds));
  return reply.status(429).send({ success: false, error: 'Too many requests' });
}

function sendTelegramError(error: unknown, reply: FastifyReply) {
  if (error instanceof TelegramLinkError) {
    return reply.status(error.statusCode).send({ success: false, error: error.message, code: error.code });
  }
  throw error;
}

function requestIp(request: FastifyRequest) {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

export async function telegramRoutes(app: FastifyInstance) {
  app.get('/integrations/telegram/status', { preHandler: requireAuth }, async (request, reply) => {
    return reply.send({ success: true, data: await getTelegramStatus(request.auth!.sub) });
  });

  app.post('/integrations/telegram/link-challenges', { preHandler: requireAuth }, async (request, reply) => {
    const rate = hitTelegramRateLimit(`challenge:${request.auth!.sub}:${requestIp(request)}`, 5, 15 * 60 * 1000);
    if (rate.limited) return limited(reply, rate.retryAfterSeconds);
    try {
      const data = await createTelegramLinkChallenge(request.auth!.sub);
      request.log.info({ event: 'telegram_link_challenge_created', userId: request.auth!.sub });
      return reply.status(201).send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.delete('/integrations/telegram/connection', { preHandler: requireAuth }, async (request, reply) => {
    const data = await disconnectTelegram(request.auth!.sub);
    request.log.info({ event: 'telegram_disconnected', userId: request.auth!.sub });
    return reply.send({ success: true, data });
  });

  app.post('/internal/agent/telegram/link-challenges/consume', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = consumeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid Telegram link request' });
    const rate = hitTelegramRateLimit(`consume:${parsed.data.telegramUserId}:${requestIp(request)}`, 10, 10 * 60 * 1000);
    if (rate.limited) return limited(reply, rate.retryAfterSeconds);
    try {
      const data = await consumeTelegramLinkChallenge(parsed.data.code, parsed.data);
      request.log.info({
        event: 'telegram_link_connected',
        userId: data.userId,
        connectionId: data.connectionId,
      });
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.warn({ event: 'telegram_link_rejected', telegramUserId: parsed.data.telegramUserId });
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/message/authorize', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = authorizeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Private Telegram chat required' });
    try {
      const data = await authorizeTelegramMessage(
        parsed.data.telegramUserId,
        parsed.data.telegramChatId,
        parsed.data,
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/task-drafts', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid task draft request' });
    }
    try {
      const data = await prepareTelegramTaskDraft(parsed.data);
      request.log.info({ event: 'telegram_task_draft_prepared', draftId: data.draftId });
      return reply.status(201).send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/task-drafts/confirm', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskDraftActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid task draft request' });
    try {
      const data = await confirmTelegramTaskDraft(parsed.data.telegramChatId, parsed.data.locale);
      request.log.info({ event: 'telegram_task_draft_confirmed', taskId: data.taskId });
      return reply.send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/task-drafts/cancel', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskDraftActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid task draft request' });
    try {
      const data = await cancelTelegramTaskDraft(parsed.data.telegramChatId, parsed.data.locale);
      request.log.info({ event: 'telegram_task_draft_cancelled' });
      return reply.send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/task-batch-drafts', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskBatchDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid task batch draft request' });
    }
    try {
      const data = await prepareTelegramTaskBatchDraft(parsed.data);
      request.log.info({ event: 'telegram_task_batch_draft_prepared', batchDraftId: data.batchDraftId });
      return reply.status(201).send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/task-batch-drafts/confirm', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskDraftActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid task batch draft request' });
    try {
      const data = await confirmTelegramTaskBatchDraft(parsed.data.telegramChatId, parsed.data.locale);
      request.log.info({ event: 'telegram_task_batch_draft_confirmed', taskCount: data.taskIds.length });
      return reply.send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/task-batch-drafts/cancel', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskDraftActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid task batch draft request' });
    try {
      const data = await cancelTelegramTaskBatchDraft(parsed.data.telegramChatId, parsed.data.locale);
      request.log.info({ event: 'telegram_task_batch_draft_cancelled' });
      return reply.send({ success: true, data });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/tasks/list', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskQuerySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid task query request' });
    try {
      const message = await listTelegramTasks(parsed.data);
      return reply.send({ success: true, data: { message } });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });

  app.post('/internal/agent/telegram/tasks/summary', { preHandler: requireAgentAuth }, async (request, reply) => {
    const parsed = taskQuerySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Invalid task query request' });
    try {
      const message = await summarizeTelegramTasks(parsed.data);
      return reply.send({ success: true, data: { message } });
    } catch (error) {
      return sendTelegramError(error, reply);
    }
  });
}
