import type { Task } from '@mindoist/shared';

export type LegacyTaskOverrides = Omit<Partial<Task>, 'deadline' | 'estimateMin'> & {
  dueDate?: string | null;
  dueTime?: string | null;
  durationMin?: number | null;
  deadlineDate?: string | null;
  deadlineTime?: string | null;
  deadlineTimeZone?: string | null;
  deadline?: Task['deadline'];
  estimateMin?: number | null;
};

/** Converts old fixture shorthand without leaking legacy fields into runtime Task objects. */
export function canonicalTaskOverrides(overrides: LegacyTaskOverrides): Partial<Task> {
  const {
    dueDate,
    dueTime,
    durationMin,
    deadlineDate,
    deadlineTime,
    deadlineTimeZone,
    ...canonical
  } = overrides;
  const result: Partial<Task> = { ...canonical };

  if (!('deadline' in overrides) && ('dueDate' in overrides || 'dueTime' in overrides || 'deadlineDate' in overrides || 'deadlineTime' in overrides || 'deadlineTimeZone' in overrides)) {
    const date = deadlineDate ?? dueDate;
    const time = deadlineTime ?? dueTime;
    result.deadline = date
      ? {
          date: date.slice(0, 10),
          ...(time ? { time } : {}),
          ...(time && deadlineTimeZone ? { timeZone: deadlineTimeZone } : {}),
        }
      : null;
  }
  if ('durationMin' in overrides) result.estimateMin = durationMin ?? null;

  return result;
}
