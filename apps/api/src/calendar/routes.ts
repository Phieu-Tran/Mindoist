import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { syncTimeBlocksToProvider } from './provider-sync.js';
import { getCalendarProvider, listCalendarProviders } from './providers/registry.js';

function providerFromRequest(
  request: { params: unknown },
  reply: FastifyReply,
) {
  const { provider: providerId } = request.params as { provider: string };
  const provider = getCalendarProvider(providerId);
  if (!provider) {
    reply.status(404).send({ success: false, error: 'Calendar provider not found' });
    return null;
  }
  return provider;
}

export async function calendarProviderRoutes(app: FastifyInstance) {
  app.get('/calendar/providers', { preHandler: requireAuth }, async (request, reply) => {
    const data = await Promise.all(
      listCalendarProviders().map(async provider => ({
        id: provider.id,
        connected: await provider.isConnected(request.auth!.sub),
      })),
    );
    return reply.send({ success: true, data });
  });

  app.get('/calendar/providers/:provider/status', { preHandler: requireAuth }, async (request, reply) => {
    const provider = providerFromRequest(request, reply);
    if (!provider) return;
    return reply.send({
      success: true,
      data: { connected: await provider.isConnected(request.auth!.sub) },
    });
  });

  app.get('/calendar/providers/:provider/auth-url', { preHandler: requireAuth }, async (request, reply) => {
    const provider = providerFromRequest(request, reply);
    if (!provider) return;
    return reply.send({
      success: true,
      data: { url: provider.getAuthUrl(request.auth!.sub) },
    });
  });

  app.post('/calendar/providers/:provider/disconnect', { preHandler: requireAuth }, async (request, reply) => {
    const provider = providerFromRequest(request, reply);
    if (!provider) return;
    await provider.disconnect(request.auth!.sub);
    return reply.send({ success: true });
  });

  app.post('/calendar/providers/:provider/sync', { preHandler: requireAuth }, async (request, reply) => {
    const provider = providerFromRequest(request, reply);
    if (!provider) return;
    await provider.sync(request.auth!.sub);
    const timeBlocksSynced = await syncTimeBlocksToProvider(provider, request.auth!.sub);
    return reply.send({ success: true, data: { timeBlocksSynced } });
  });

  app.get('/calendar/providers/:provider/events', { preHandler: requireAuth }, async (request, reply) => {
    const provider = providerFromRequest(request, reply);
    if (!provider) return;
    const { from, to } = request.query as { from?: string; to?: string };
    return reply.send({
      success: true,
      data: await provider.listEvents(request.auth!.sub, from, to),
    });
  });
}
