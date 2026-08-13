import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { authRoutes } from './auth/routes.js';
import { healthRoutes } from './health/routes.js';
import { projectRoutes } from './projects/routes.js';
import { sectionRoutes } from './sections/routes.js';
import { tagRoutes } from './tags/routes.js';
import { taskRoutes } from './tasks/routes.js';
import { timeBlockRoutes } from './time-blocks/routes.js';
import { calendarProviderRoutes } from './calendar/routes.js';
import { syncRoutes } from './sync/routes.js';
import { noteRoutes } from './notes/routes.js';
import { countdownRoutes } from './countdowns/routes.js';
import { reminderRoutes } from './reminders/routes.js';
import { pushRoutes } from './push/routes.js';
import { gcalRoutes } from './gcal/routes.js';
import { importRoutes } from './import/routes.js';
import { driveRoutes } from './drive/routes.js';
import { areaRoutes } from './areas/routes.js';
import { exportRoutes } from './export/routes.js';
import { settingsRoutes } from './settings/routes.js';
import { telegramRoutes } from './telegram/routes.js';
import { adminRoutes } from './admin/routes.js';
import { agentDraftRoutes } from './agent-drafts/routes.js';
import { apiKeyRoutes } from './api-keys/routes.js';
import { startReminderWorker, stopReminderWorker } from './reminders/delivery.js';
import { startRefreshTokenPruner, stopRefreshTokenPruner } from './auth/refresh-tokens.js';
import { startTelegramChallengePruner, stopTelegramChallengePruner } from './telegram/service.js';
const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  maxAge: 86400,
});
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

await app.register(authRoutes, { prefix: '/auth' });
await app.register(healthRoutes);
await app.register(projectRoutes);
await app.register(sectionRoutes);
await app.register(tagRoutes);
await app.register(taskRoutes);
await app.register(timeBlockRoutes);
await app.register(calendarProviderRoutes);
await app.register(syncRoutes, { prefix: '/sync' });
await app.register(noteRoutes);
await app.register(countdownRoutes);
await app.register(reminderRoutes);
await app.register(pushRoutes, { prefix: '/push' });
await app.register(gcalRoutes);
await app.register(importRoutes, { prefix: '/import' });
await app.register(driveRoutes);
await app.register(areaRoutes);
await app.register(exportRoutes);
await app.register(settingsRoutes);
await app.register(telegramRoutes);
await app.register(adminRoutes);
await app.register(agentDraftRoutes);
await app.register(apiKeyRoutes);

const port = Number(process.env.PORT) || 3000;

try {
  await app.listen({ port, host: '0.0.0.0' });
  startReminderWorker();
  startRefreshTokenPruner();
  startTelegramChallengePruner();
  console.log(`API running on http://localhost:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    stopReminderWorker();
    stopRefreshTokenPruner();
    stopTelegramChallengePruner();
    await app.close();
    process.exit(0);
  });
}
