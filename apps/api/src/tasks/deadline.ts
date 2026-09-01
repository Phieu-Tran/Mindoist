import type { TaskDeadline } from '@mindoist/shared/types';

type MutableTaskData = Record<string, unknown>;

export function dateOnlyToUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, Number(part.value)]),
    );
    return (
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
      instant
    );
  };

  // Re-evaluate after the first offset application to cover DST boundaries.
  const firstPass = wallClockAsUtc - offsetAt(wallClockAsUtc);
  return new Date(wallClockAsUtc - offsetAt(firstPass));
}

export function applyDeadlineInput(
  data: MutableTaskData,
  deadline: TaskDeadline | null,
): void {
  if (deadline == null) {
    data.deadlineDate = null;
    data.deadlineTime = null;
    data.deadlineTimeZone = null;
    return;
  }

  const deadlineDate = dateOnlyToUtcDate(deadline.date);
  data.deadlineDate = deadlineDate;
  data.deadlineTime = deadline.time ?? null;
  data.deadlineTimeZone = deadline.time ? deadline.timeZone ?? null : null;
}
