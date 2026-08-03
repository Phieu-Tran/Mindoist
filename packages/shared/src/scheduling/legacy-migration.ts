export interface LegacyTaskSchedule {
  id: string;
  startDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  durationMin?: number | null;
}

export interface DeadlineValue {
  date: string;
  time?: string;
  timeZone?: string;
}

export interface LegacyTimeBlockCandidate {
  source: 'legacy-timed-duration';
  startLocal: string;
  endLocal: string;
  timeZone: string;
  allDay: false;
}

export type LegacyScheduleWarning =
  | 'ambiguous-date-range'
  | 'duration-without-time'
  | 'invalid-duration'
  | 'invalid-date'
  | 'invalid-time';

export interface LegacyScheduleMigration {
  taskId: string;
  deadline: DeadlineValue | null;
  timeBlockCandidate: LegacyTimeBlockCandidate | null;
  warnings: LegacyScheduleWarning[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return DATE_PATTERN.test(date) ? date : null;
}

function addMinutes(localDateTime: string, minutes: number): string {
  const [date, time] = localDateTime.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  utc.setUTCMinutes(utc.getUTCMinutes() + minutes);
  return `${utc.getUTCFullYear().toString().padStart(4, '0')}-${(utc.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${utc.getUTCDate().toString().padStart(2, '0')}T${utc
    .getUTCHours()
    .toString()
    .padStart(2, '0')}:${utc.getUTCMinutes().toString().padStart(2, '0')}`;
}

export function planLegacyScheduleMigration(
  task: LegacyTaskSchedule,
  timeZone: string,
): LegacyScheduleMigration {
  const warnings: LegacyScheduleWarning[] = [];
  const dueDate = toDateOnly(task.dueDate);
  const startDate = toDateOnly(task.startDate);

  if (task.dueDate && !dueDate) warnings.push('invalid-date');

  const dueTime = task.dueTime?.trim() || null;
  const validTime = dueTime != null && TIME_PATTERN.test(dueTime);
  if (dueTime && !validTime) warnings.push('invalid-time');

  const deadline: DeadlineValue | null = dueDate
    ? {
        date: dueDate,
        ...(validTime ? { time: dueTime!, timeZone } : {}),
      }
    : null;

  let timeBlockCandidate: LegacyTimeBlockCandidate | null = null;
  const duration = task.durationMin;

  if (duration != null && (!Number.isInteger(duration) || duration <= 0)) {
    warnings.push('invalid-duration');
  } else if (duration && dueDate && validTime) {
    const startLocal = `${dueDate}T${dueTime}`;
    timeBlockCandidate = {
      source: 'legacy-timed-duration',
      startLocal,
      endLocal: addMinutes(startLocal, duration),
      timeZone,
      allDay: false,
    };
  } else if (duration && !validTime) {
    warnings.push('duration-without-time');
  }

  if (startDate && dueDate && startDate !== dueDate) {
    warnings.push('ambiguous-date-range');
  }

  return {
    taskId: task.id,
    deadline,
    timeBlockCandidate,
    warnings,
  };
}
