import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { createBackup, listBackups, deleteBackup, restoreFromBackup } from './service.js';
import { isConnected } from '../gcal/service.js';

export async function driveRoutes(app: FastifyInstance) {
  // Create backup — export all user data to Google Drive
  app.post('/drive/backup', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;

    const connected = await isConnected(userId);
    if (!connected) {
      return reply.status(400).send({
        success: false,
        error: 'Google account not connected. Please connect Google first.',
      });
    }

    try {
      const result = await createBackup(userId);
      return reply.send({ success: true, data: result });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Backup failed';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // List backups
  app.get('/drive/backups', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;

    const connected = await isConnected(userId);
    if (!connected) {
      return reply.send({ success: true, data: [] });
    }

    try {
      const backups = await listBackups(userId);
      return reply.send({ success: true, data: backups });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to list backups';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // Restore from backup
  app.post('/drive/restore/:fileId', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const { fileId } = request.params as { fileId: string };

    if (!fileId) {
      return reply.status(400).send({ success: false, error: 'Missing fileId' });
    }

    const connected = await isConnected(userId);
    if (!connected) {
      return reply.status(400).send({
        success: false,
        error: 'Google account not connected.',
      });
    }

    try {
      const result = await restoreFromBackup(userId, fileId);
      return reply.send({ success: true, data: result });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Restore failed';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // Delete backup from Drive
  app.delete('/drive/backup/:fileId', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth!.sub;
    const { fileId } = request.params as { fileId: string };

    if (!fileId) {
      return reply.status(400).send({ success: false, error: 'Missing fileId' });
    }

    const connected = await isConnected(userId);
    if (!connected) {
      return reply.status(400).send({
        success: false,
        error: 'Google account not connected.',
      });
    }

    try {
      await deleteBackup(userId, fileId);
      return reply.send({ success: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Delete failed';
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
