import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import {
  calendarProjectionQuerySchema,
  createTimeBlockSchema,
  timeBlockListQuerySchema,
  updateTimeBlockSchema,
} from './schema.js';
import {
  createTimeBlock,
  deleteTimeBlock,
  getCalendarProjection,
  listTimeBlocks,
  TimeBlockServiceError,
  updateTimeBlock,
} from './service.js';
import { deleteSyncedTimeBlockEvents, syncTimeBlocksToProvider } from '../calendar/provider-sync.js';
import { googleCalendarProvider } from '../calendar/providers/google.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    success: false,
    error: issues.map(issue => issue.message).join(', '),
  });
}

function serviceError(reply: FastifyReply, error: unknown) {
  if (error instanceof TimeBlockServiceError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: error.message,
    });
  }
  throw error;
}

export async function timeBlockRoutes(app: FastifyInstance) {
  app.get('/time-blocks', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = timeBlockListQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error.issues);

    const blocks = await listTimeBlocks(request.auth!.sub, parsed.data);
    return reply.send({ success: true, data: blocks });
  });

  app.post('/time-blocks', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createTimeBlockSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error.issues);

    try {
      const block = await createTimeBlock(request.auth!.sub, parsed.data);
      if (await googleCalendarProvider.isConnected(request.auth!.sub)) {
        await syncTimeBlocksToProvider(googleCalendarProvider, request.auth!.sub, { timeBlockId: block.id })
          .catch(error => request.log.warn(error, 'Time block Calendar sync failed'));
      }
      return reply.status(201).send({ success: true, data: block });
    } catch (error) {
      return serviceError(reply, error);
    }
  });

  app.patch('/time-blocks/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTimeBlockSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error.issues);

    try {
      const block = await updateTimeBlock(request.auth!.sub, id, parsed.data);
      if (await googleCalendarProvider.isConnected(request.auth!.sub)) {
        await syncTimeBlocksToProvider(googleCalendarProvider, request.auth!.sub, { timeBlockId: block.id })
          .catch(error => request.log.warn(error, 'Time block Calendar sync failed'));
      }
      return reply.send({ success: true, data: block });
    } catch (error) {
      return serviceError(reply, error);
    }
  });

  app.delete('/time-blocks/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      if (await googleCalendarProvider.isConnected(request.auth!.sub)) {
        await deleteSyncedTimeBlockEvents(googleCalendarProvider, request.auth!.sub, id);
      }
      await deleteTimeBlock(request.auth!.sub, id);
      return reply.send({ success: true });
    } catch (error) {
      return serviceError(reply, error);
    }
  });

  app.get('/calendar/projection', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = calendarProjectionQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error.issues);

    try {
      const projection = await getCalendarProjection(
        request.auth!.sub,
        new Date(parsed.data.from),
        new Date(parsed.data.to),
        parsed.data.timeZone,
      );
      return reply.send({ success: true, data: projection });
    } catch (error) {
      return serviceError(reply, error);
    }
  });
}
