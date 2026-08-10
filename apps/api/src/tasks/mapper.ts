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
  const { taskTags, ...rest } = task;
  const deadlineDate = toDateOnly(task.deadlineDate ?? task.dueDate);
  const deadlineTime = task.deadlineTime ?? task.dueTime ?? undefined;
  const deadline = deadlineDate
    ? {
        date: deadlineDate,
        ...(deadlineTime ? { time: deadlineTime } : {}),
        ...(deadlineTime && task.deadlineTimeZone
          ? { timeZone: task.deadlineTimeZone }
          : {}),
      }
    : null;

  return {
    ...rest,
    deadline,
    tagIds: taskTags?.map(tag => tag.tagId) ?? [],
  };
}
