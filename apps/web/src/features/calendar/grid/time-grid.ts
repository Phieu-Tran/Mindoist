export const SLOT_MINUTES = 15;
export const MINUTES_PER_DAY = 24 * 60;

export function minutesSinceMidnight(value: Date): number {
  return value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60;
}

export function dateToY(value: Date, startHour = 0, slotHeight = 20): number {
  return Math.max(0, (minutesSinceMidnight(value) - startHour * 60) / SLOT_MINUTES * slotHeight);
}

export function yToDate(day: Date, y: number, startHour = 0, slotHeight = 20): Date {
  const minutes = Math.round((y / slotHeight) * SLOT_MINUTES / SLOT_MINUTES) * SLOT_MINUTES + startHour * 60;
  const result = new Date(day);
  result.setHours(0, minutes, 0, 0);
  return result;
}

export function snapMinutes(minutes: number, step = SLOT_MINUTES): number {
  return Math.round(minutes / step) * step;
}

export function dayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function workWeekDates(anchor: Date): Date[] {
  const monday = new Date(anchor);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function weekDates(anchor: Date): Date[] {
  const monday = workWeekDates(anchor)[0];
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function threeDayDates(anchor: Date): Date[] {
  return [-1, 0, 1].map(offset => {
    const date = new Date(anchor);
    date.setDate(date.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

/** Six complete Monday-Sunday rows containing the anchor month. */
export function monthDates(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monday = workWeekDates(first)[0];
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}
