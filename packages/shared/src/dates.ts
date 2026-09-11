// Local app contract: calendar days use UTC+7, independently of the host timezone.
export const LOCAL_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function localDateKey(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(new Date(value).getTime() + LOCAL_OFFSET_MS).toISOString().slice(0, 10);
}

export function localDayStart(value: Date): Date {
  return new Date(new Date(`${localDateKey(value)}T00:00:00Z`).getTime() - LOCAL_OFFSET_MS);
}
