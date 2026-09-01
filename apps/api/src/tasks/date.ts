export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Convert the server-local calendar day to the UTC-midnight representation
 * used by Prisma for PostgreSQL `date` columns. Timestamp day boundaries are
 * incorrect here in non-UTC server zones because Prisma truncates them when
 * comparing with `@db.Date`.
 */
export function toDatabaseDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function addDatabaseDateDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
