import {
  disconnectAccount,
  fetchGCalEvents,
  getAuthUrl,
  isConnected,
  upsertTimeBlockEvent,
  ensureMindoistCalendar,
  deleteExternalEvent,
} from '../../gcal/service.js';
import { triggerSyncForUser } from '../../gcal/sync.js';
import type { CalendarProvider } from './types.js';

export const googleCalendarProvider: CalendarProvider = {
  id: 'google',
  getAuthUrl,
  isConnected,
  disconnect: disconnectAccount,
  sync: triggerSyncForUser,
  async listEvents(userId, from, to) {
    const events = await fetchGCalEvents(userId, from, to);
    return events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description ?? null,
      start: event.start,
      end: event.end,
    }));
  },
  ensureCalendar: ensureMindoistCalendar,
  upsertTimeBlock: upsertTimeBlockEvent,
  deleteEvent: deleteExternalEvent,
};
