export const CALENDAR_PROJECTION_REFRESH_EVENT = 'mindoist:calendar-projection-refresh';

export function requestCalendarProjectionRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CALENDAR_PROJECTION_REFRESH_EVENT));
}
