type TaskWithOptionalTags = {
  taskTags?: { tagId: string }[];
  deadlineDate?: Date | string | null;
  deadlineTime?: string | null;
  deadlineTimeZone?: string | null;
  dueDate?: Date | string | null;
  dueTime?: string | null;
} & Record<string, unknown>;

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function toTaskResponse<T extends TaskWithOptionalTags>(task: T) {
  const {
    taskTags,
    dueDate: _legacyDueDate,
    dueTime: _legacyDueTime,
    durationMin: legacyDurationMin,
    deadlineDate: rawDeadlineDate,
    deadlineTime: rawDeadlineTime,
    deadlineTimeZone: rawDeadlineTimeZone,
    estimateMin,
    ...rest
  } = task;
  const deadlineDate = toDateOnly(rawDeadlineDate);
  const deadlineTime = rawDeadlineTime ?? undefined;
  const deadline = deadlineDate
    ? {
        date: deadlineDate,
        ...(deadlineTime ? { time: deadlineTime } : {}),
        ...(deadlineTime && rawDeadlineTimeZone
          ? { timeZone: rawDeadlineTimeZone }
          : {}),
      }
    : null;

  return {
    ...rest,
    deadline,
    estimateMin: estimateMin ?? legacyDurationMin ?? null,
    tagIds: taskTags?.map(tag => tag.tagId) ?? [],
  };
}
