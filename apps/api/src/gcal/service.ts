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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildEventBody(task: {
  id: string; title: string; description?: string | null;
  dueDate: Date; dueTime?: string | null; durationMin?: number | null;
}) {
  const dateStr = task.dueDate.toISOString().slice(0, 10);

  if (!task.dueTime) {
    return {
      summary: task.title,
      description: task.description || undefined,
      start: { date: dateStr },
      end: { date: addDays(dateStr, 1) },
    };
  }

  const start = `${dateStr}T${task.dueTime}:00`;
  const startDate = new Date(start);
  const durationMs = (task.durationMin || 30) * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  return {
    summary: task.title,
    description: task.description || undefined,
    start: { dateTime: start, timeZone: 'Asia/Ho_Chi_Minh' },
    end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Ho_Chi_Minh' },
  };
}

export async function createEvent(userId: string, task: {
  id: string; title: string; description?: string | null;
  dueDate: Date; dueTime?: string | null; durationMin?: number | null;
}): Promise<{ eventId: string; calendarId: string } | null> {
  try {
    const auth = await getAuthForUser(userId);
    const calendarId = await findOrCreateMindolistCalendar(auth, userId);
    const calendar = google.calendar({ version: 'v3', auth });
    const event = await calendar.events.insert({
      calendarId,
      requestBody: buildEventBody(task),
    });

    const eventId = event.data.id!;
    await prisma.gCalLink.create({
      data: {
        taskId: task.id,
        googleEventId: eventId,
        googleCalendarId: calendarId,
        etag: event.data.etag || null,
        lastSyncedAt: new Date(),
      },
    });

    return { eventId, calendarId };
  } catch (e) {
    console.error('Failed to create GCal event:', e);
    return null;
  }
}

export async function updateEvent(userId: string, taskId: string, task: {
  title: string; description?: string | null;
  dueDate: Date; dueTime?: string | null; durationMin?: number | null;
}): Promise<boolean> {
  try {
    const link = await prisma.gCalLink.findUnique({ where: { taskId } });
    if (!link) return false;

    const auth = await getAuthForUser(userId);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.patch({
      calendarId: link.googleCalendarId,
      eventId: link.googleEventId,
      requestBody: buildEventBody({ ...task, id: taskId }),
    });

    await prisma.gCalLink.update({
      where: { taskId },
      data: { lastSyncedAt: new Date() },
    });

    return true;
  } catch (e) {
    console.error('Failed to update GCal event:', e);
    return false;
  }
}

export async function deleteEvent(userId: string, taskId: string): Promise<boolean> {
  try {
    const link = await prisma.gCalLink.findUnique({ where: { taskId } });
    if (!link) return false;

    const auth = await getAuthForUser(userId);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({
      calendarId: link.googleCalendarId,
      eventId: link.googleEventId,
    });

    await prisma.gCalLink.delete({ where: { taskId } });
    return true;
  } catch (e) {
    console.error('Failed to delete GCal event:', e);
    return false;
  }
}

export async function pushTaskToGCal(userId: string, task: {
  id: string; title: string; description?: string | null;
  dueDate: Date | null; dueTime?: string | null; durationMin?: number | null;
}): Promise<void> {
  const existingLink = await prisma.gCalLink.findUnique({ where: { taskId: task.id } });
  const storedTask = await prisma.task.findFirst({
    where: { id: task.id, userId },
    select: {
      project: {
        select: { calendarSyncEnabled: true, deletedAt: true },
      },
    },
  });
  const projectAllowsSync = Boolean(
    storedTask?.project?.calendarSyncEnabled && !storedTask.project.deletedAt,
  );

  // Turning project sync off only stops future exports. Existing Google events
  // stay in place until the user explicitly deletes the task or project.
  if (!projectAllowsSync) return;

  if (!task.dueDate) {
    if (existingLink && await isConnected(userId)) await deleteEvent(userId, task.id);
    return;
  }

  const connected = await isConnected(userId);
  if (!connected) return;

  if (existingLink) {
    await updateEvent(userId, task.id, task as any);
  } else {
    await createEvent(userId, task as any);
  }
}

export async function removeTaskFromGCal(userId: string, taskId: string): Promise<void> {
  const connected = await isConnected(userId);
  if (!connected) return;
  await deleteEvent(userId, taskId);
}

export async function removeProjectFromGCal(userId: string, projectId: string): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { userId, projectId, gcalLink: { isNot: null } },
    select: { id: true },
  });
  if (tasks.length === 0) return 0;
  if (!await isConnected(userId)) return 0;

  let removed = 0;
  for (const task of tasks) {
    if (await deleteEvent(userId, task.id)) removed += 1;
  }
  return removed;
}

export async function syncProjectTasksToGCal(userId: string, projectId: string): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      projectId,
      deletedAt: null,
      dueDate: { not: null },
      project: { deletedAt: null, calendarSyncEnabled: true },
    },
  });
  if (tasks.length === 0 || !await isConnected(userId)) return 0;

  let synced = 0;
  for (const task of tasks) {
    await pushTaskToGCal(userId, task);
    synced += 1;
  }
  return synced;
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
