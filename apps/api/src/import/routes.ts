import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { parseTickTickCsv, importTickTickData } from './service.js';

export async function importRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/ticktick/preview', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const csvContent = Buffer.concat(chunks).toString('utf-8');

    const preview = parseTickTickCsv(csvContent);

    return reply.send(preview);
  });

  app.post('/ticktick/confirm', async (req, reply) => {
    const userId = req.auth!.sub;

    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const csvContent = Buffer.concat(chunks).toString('utf-8');

    const preview = parseTickTickCsv(csvContent);
    const result = await importTickTickData(userId, preview, false);

    return reply.send(result);
  });
}
