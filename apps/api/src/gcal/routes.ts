import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import {
  exchangeCode,
  getSyncLogs,
  storeRefreshToken,
  syncSelectedProjectTasksToGCal,
} from './service.js';
import { googleCalendarProvider } from '../calendar/providers/google.js';
import { syncTimeBlocksToProvider } from '../calendar/provider-sync.js';

export async function gcalRoutes(app: FastifyInstance) {
  // Get Google OAuth URL
  app.get('/gcal/auth-url', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const url = googleCalendarProvider.getAuthUrl(userId);
    return reply.send({ success: true, data: { url } });
  });

  // Google OAuth callback (called by Google after user consents)
  app.get('/gcal/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code || !state) {
      return reply.status(400).send({ success: false, error: 'Missing code or state' });
    }

    try {
      const { refreshToken } = await exchangeCode(code);
      await storeRefreshToken(state, refreshToken);
      // A project may have been selected before Google was connected. Export
      // that selected scope immediately after consent without making a failed
      // first sync invalidate an otherwise successful OAuth connection.
      await Promise.all([
        syncSelectedProjectTasksToGCal(state),
        syncTimeBlocksToProvider(googleCalendarProvider, state),
      ]).catch(error => app.log.error(error, 'Initial Google Calendar sync failed'));
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return reply.redirect(`${frontendUrl}?gcal=connected`);
    } catch (e) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return reply.redirect(`${frontendUrl}?gcal=error`);
    }
  });

  // Check connection status
  app.get('/gcal/status', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const connected = await googleCalendarProvider.isConnected(userId);
    return reply.send({ success: true, data: { connected } });
  });

  // Disconnect Google account
  app.post('/gcal/disconnect', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    await googleCalendarProvider.disconnect(userId);
    return reply.send({ success: true });
  });

  // Trigger manual sync
  app.post('/gcal/sync', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    await googleCalendarProvider.sync(userId);
    const [tasksSynced, timeBlocksSynced] = await Promise.all([
      syncSelectedProjectTasksToGCal(userId),
      syncTimeBlocksToProvider(googleCalendarProvider, userId),
    ]);
    return reply.send({ success: true, data: { tasksSynced, timeBlocksSynced } });
  });

  // Google Calendar webhook endpoint (push notifications)
  // Note: requires HTTPS public URL for Google to send to — pending deploy
  app.post('/gcal/webhook', async (request, reply) => {
    const channelToken = request.headers['x-goog-channel-token'];
    const resourceId = request.headers['x-goog-resource-id'];

    // In production, verify channelToken and trigger sync for the linked user
    // For now, acknowledge the notification
    console.log(`[GCalWebhook] Received notification for resource: ${resourceId}`);

    return reply.status(200).send({ success: true });
  });

  // Fetch GCal events for calendar display
  app.get('/gcal/events', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const { timeMin, timeMax } = request.query as { timeMin?: string; timeMax?: string };
    const events = await googleCalendarProvider.listEvents(userId, timeMin, timeMax);
    return reply.send({ success: true, data: events });
  });

  // Get sync log for debugging
  app.get('/gcal/sync-logs', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const logs = await getSyncLogs(userId);
    return reply.send({ success: true, data: logs });
  });
}
