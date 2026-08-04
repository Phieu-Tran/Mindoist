import { PgBoss, type Job } from 'pg-boss';
import { google, type calendar_v3 } from 'googleapis';
import { prisma } from '../db.js';

const SYNC_JOB = 'gcal-pull-sync';
const SYNC_INTERVAL = '5 minutes';

let boss: PgBoss | null = null;

function getOAuth2Client(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/gcal/callback',
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

async function pullChanges(userId: string): Promise<number> {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!account?.refreshToken) return 0;

  const auth = getOAuth2Client(account.refreshToken);
  const calendar = google.calendar({ version: 'v3', auth });

  // Get the Mindoist calendar
  const calendarList = await calendar.calendarList.list();
  const mindoistCal = calendarList.data.items?.find(c => c.summary === 'Mindoist');
  if (!mindoistCal?.id) return 0;

  let syncToken = account.syncToken || undefined;
  let pageToken: string | undefined = undefined;
  let changes = 0;
  let newSyncToken = syncToken;

  do {
    const res: { data: calendar_v3.Schema$Events } = await calendar.events.list({
      calendarId: mindoistCal.id,
      syncToken,
      pageToken,
      maxResults: 100,
    });

    const items = res.data.items || [];
    for (const event of items) {
      if (!event.id) continue;

      // Find existing link
      const link = await prisma.gCalLink.findFirst({
        where: { googleEventId: event.id },
      });

      if (event.status === 'cancelled') {
        // Event deleted on Google side
        if (link) {
          // Optionally mark task as completed or deleted
          await prisma.gCalLink.delete({ where: { taskId: link.taskId } });
          changes++;
        }
      } else if (link) {
        const newEtag = event.etag || null;
        // Google is an inbound, read-only overlay. Even for a linked event that
        // originated in Mindoist, edits made in Google must never mutate the
        // owning Mindoist task. We only advance sync metadata here.
        await prisma.gCalLink.update({
          where: { taskId: link.taskId },
          data: { etag: newEtag, lastSyncedAt: new Date() },
        });
        changes++;
      }
      // New events without a link are ignored (created on Google, not linked)
    }

    pageToken = res.data.nextPageToken || undefined;
    newSyncToken = res.data.nextSyncToken || newSyncToken;
  } while (pageToken);

  // Save new sync token
  if (newSyncToken && newSyncToken !== syncToken) {
    await prisma.googleAccount.update({
      where: { userId },
      data: { syncToken: newSyncToken },
    });
  }

  return changes;
}

async function processSyncJobs(jobs: Job<{ userId?: string }>[]) {
  for (const job of jobs) {
    const userIds = job.data.userId
      ? [job.data.userId]
      : (await prisma.googleAccount.findMany({ select: { userId: true } })).map(account => account.userId);

    for (const userId of userIds) {
      try {
        const changes = await pullChanges(userId);
        if (changes > 0) {
          console.log(`[GCalSync] User ${userId}: ${changes} changes synced`);
        }
      } catch (e) {
        console.error(`[GCalSync] Failed for user ${userId}:`, e);
      }
    }
  }
}

export async function startSyncBoss() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('[GCalSync] No DATABASE_URL, skipping pg-boss init');
    return;
  }

  boss = new PgBoss({ connectionString: databaseUrl });
  await boss.start();

  await boss.work<{ userId?: string }>(SYNC_JOB, processSyncJobs);

  // Schedule periodic sync for all connected users
  await boss.schedule(SYNC_JOB, '*/5 * * * *', {}); // runs every 5 minutes as a fallback

  console.log('[GCalSync] pg-boss started, sync every 5 minutes');
}

export async function triggerSyncForUser(userId: string) {
  if (boss) {
    await boss.send(SYNC_JOB, { userId });
  }
}

export async function stopSyncBoss() {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}
