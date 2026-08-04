import { googleCalendarProvider } from './google.js';
import type { CalendarProvider, CalendarProviderId } from './types.js';

const providers: Record<CalendarProviderId, CalendarProvider> = {
  google: googleCalendarProvider,
};

export function getCalendarProvider(id: string): CalendarProvider | null {
  return id in providers ? providers[id as CalendarProviderId] : null;
}

export function listCalendarProviders() {
  return Object.values(providers);
}
