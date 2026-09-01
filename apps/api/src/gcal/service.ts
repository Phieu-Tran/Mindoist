import { google } from 'googleapis';
import type { Task, TimeBlock } from '@prisma/client';
import { prisma } from '../db.js';

const MINDOIST_CALENDAR_NAME = 'Mindoist';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/gcal/callback',
  );
}

export function getAuthUrl(userId: string): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: userId,
  });
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token! };
}

export async function storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await prisma.googleAccount.upsert({
    where: { userId },
    update: { refreshToken, updatedAt: new Date() },
    create: { userId, refreshToken },
  });
}

export async function getRefreshToken(userId: string): Promise<string | null> {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  return account?.refreshToken ?? null;
}

export async function disconnectAccount(userId: string): Promise<void> {
  await prisma.googleAccount.delete({ where: { userId } }).catch(() => {});
}

export async function isConnected(userId: string): Promise<boolean> {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  return Boolean(account?.refreshToken);
}

async function getAuthForUser(userId: string) {
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) throw new Error('Google account not connected');

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

async function findOrCreateMindolistCalendar(auth: ReturnType<typeof getOAuth2Client>, userId: string): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth });
  const calendarList = await calendar.calendarList.list();
  const existing = calendarList.data.items?.find(c => c.summary === MINDOIST_CALENDAR_NAME);
  if (existing?.id) return existing.id;

  const created = await calendar.calendars.insert({ requestBody: { summary: MINDOIST_CALENDAR_NAME } });
  const calendarId = created.data.id!;
  await calendar.calendarList.update({
    calendarId,
    requestBody: { hidden: false },
  });
  return calendarId;
}

export async function ensureMindoistCalendar(userId: string) {
  const auth = await getAuthForUser(userId);
  const externalId = await findOrCreateMindolistCalendar(auth, userId);
  return {
    externalId,
    name: MINDOIST_CALENDAR_NAME,
    color: null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    readOnly: false,
  };
}

export async function upsertTimeBlockEvent(
  userId: string,
  providerCalendar: { externalId: string },
  timeBlock: TimeBlock,
  task: Task,
  existing?: { externalEventId: string; etag: string | null },
) {
  const auth = await getAuthForUser(userId);
  const calendar = google.calendar({ version: 'v3', auth });
  const requestBody = {
    summary: task.title,
    description: `Mindoist planned time · ${task.id} · ${timeBlock.id}`,
    start: {
      dateTime: timeBlock.startAt.toISOString(),
      timeZone: timeBlock.timeZone,
    },
    end: {
      dateTime: timeBlock.endAt.toISOString(),
      timeZone: timeBlock.timeZone,
    },
    extendedProperties: {
      private: {
        mindoistTaskId: task.id,
        mindoistTimeBlockId: timeBlock.id,
      },
    },
  };

  const response = existing
    ? await calendar.events.update(
        {
          calendarId: providerCalendar.externalId,
          eventId: existing.externalEventId,
          requestBody,
        },
        existing.etag ? { headers: { 'If-Match': existing.etag } } : undefined,
      )
    : await calendar.events.insert({
        calendarId: providerCalendar.externalId,
        requestBody,
      });

  if (!response.data.id) throw new Error('Google Calendar did not return an event id');
  return {
    externalEventId: response.data.id,
    etag: response.data.etag ?? null,
  };
}

export async function deleteExternalEvent(
  userId: string,
  providerCalendar: { externalId: string },
  externalEventId: string,
): Promise<void> {
  const auth = await getAuthForUser(userId);
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    await calendar.events.delete({
      calendarId: providerCalendar.externalId,
      eventId: externalEventId,
    });
  } catch (error) {
    const status = (error as { code?: number; response?: { status?: number } }).code
      ?? (error as { response?: { status?: number } }).response?.status;
    if (status !== 404 && status !== 410) throw error;
  }
}

export async function syncProjectTasksToGCal(userId: string, projectId: string): Promise<number> {
  // Calendar sync is intentionally block-driven. A deadline is a point marker
  // and must not become a Google event unless the user created a TimeBlock.
  if (!await isConnected(userId)) return 0;
  const [{ googleCalendarProvider }, { syncTimeBlocksToProvider }] = await Promise.all([
    import('../calendar/providers/google.js'),
    import('../calendar/provider-sync.js'),
  ]);
  return syncTimeBlocksToProvider(googleCalendarProvider, userId, { projectId });
}

export async function syncSelectedProjectTasksToGCal(userId: string): Promise<number> {
  const projects = await prisma.project.findMany({
    where: { userId, deletedAt: null, calendarSyncEnabled: true },
    select: { id: true },
  });

  let synced = 0;
  for (const project of projects) {
    synced += await syncProjectTasksToGCal(userId, project.id);
  }
  return synced;
}

export async function fetchGCalEvents(userId: string, timeMin?: string, timeMax?: string): Promise<Array<{
  id: string; title: string; start: string; end: string; description?: string;
}>> {
  try {
    if (!await isConnected(userId)) return [];
    const auth = await getAuthForUser(userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const calendarList = await calendar.calendarList.list();
    const readableCalendars = (calendarList.data.items || []).filter(
      item => item.id && !item.deleted && !item.hidden && item.selected !== false,
    );
    if (readableCalendars.length === 0) return [];

    const [legacyLinks, providerLinks] = await Promise.all([
      prisma.gCalLink.findMany({
        where: { task: { userId } },
        select: { googleCalendarId: true, googleEventId: true },
      }),
      prisma.externalEventLink.findMany({
        where: { userId, calendar: { provider: 'GOOGLE' } },
        select: {
          externalEventId: true,
          calendar: { select: { externalCalendarId: true } },
        },
      }),
    ]);
    const ownedEvents = new Set([
      ...legacyLinks.map(link => `${link.googleCalendarId}:${link.googleEventId}`),
      ...providerLinks.map(link => `${link.calendar.externalCalendarId}:${link.externalEventId}`),
    ]);
    const from = timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = timeMax || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const events: Array<{ id: string; title: string; start: string; end: string; description?: string }> = [];

    for (const readableCalendar of readableCalendars) {
      const calendarId = readableCalendar.id!;
      const res = await calendar.events.list({
        calendarId,
        timeMin: from,
        timeMax: to,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      });
      for (const event of res.data.items || []) {
        if (!event.id || event.status === 'cancelled') continue;
        if (ownedEvents.has(`${calendarId}:${event.id}`)) continue;
        const start = event.start?.dateTime || event.start?.date || '';
        if (!start) continue;
        events.push({
          id: `${calendarId}:${event.id}`,
          title: event.summary || '(untitled)',
          start,
          end: event.end?.dateTime || event.end?.date || '',
          description: event.description || undefined,
        });
      }
    }

    return events.sort((left, right) => left.start.localeCompare(right.start));
  } catch (e) {
    console.error('Failed to fetch GCal events:', e);
    return [];
  }
}

export async function logSync(userId: string, direction: string, action: string, taskId?: string, details?: string) {
  await prisma.syncLog.create({
    data: { userId, direction, action, taskId: taskId || null, details: details || null },
  });
}

export async function getSyncLogs(userId: string, limit = 50) {
  return prisma.syncLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
