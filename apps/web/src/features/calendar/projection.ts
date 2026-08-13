import { effectiveTaskColor } from '@/lib/task-colors';
import type { Task, TimeBlock } from '@mindoist/shared/types';
import type { CalendarItem } from './grid/types';

export interface DeadlineProjection {
  id: string;
  taskId: string;
  title: string;
  startDate: string | null;
  date: string;
  time: string | null;
  timeZone: string | null;
  completedAt: string | null;
  priority: number | null;
  projectId: string | null;
  colorOverride: string | null;
}

export interface ExternalEventProjection {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  provider: string;
  providerEventId?: string;
}

export interface CalendarProjection {
  timeBlocks: TimeBlock[];
  deadlines: DeadlineProjection[];
  externalEvents: ExternalEventProjection[];
}

interface ProjectIdentity {
  id: string;
  color?: string | null;
}

export function resolveCalendarIdentity(
  task: Task | undefined,
  projectId: string | null,
  projects: ProjectIdentity[],
  colorOverride?: string | null,
): { color: string; colorName: string | null } {
  const effectiveProjectId = task?.projectId ?? projectId;
  const projectColor = effectiveProjectId
    ? projects.find(project => project.id === effectiveProjectId)?.color
    : null;
  const identityColor = effectiveTaskColor(colorOverride ?? task?.color, projectColor);

  return {
    colorName: identityColor,
    color: identityColor
      ? `var(--color-project-${identityColor})`
      : 'var(--calendar-time-block-accent)',
  };
}

function conflictingBlockIds(blocks: TimeBlock[]): Set<string> {
  const result = new Set<string>();
  const sorted = [...blocks]
    .filter(block => !block.allDay)
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    const left = sorted[leftIndex];
    const leftEnd = new Date(left.endAt).getTime();
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      const right = sorted[rightIndex];
      if (new Date(right.startAt).getTime() >= leftEnd) break;
      result.add(left.id);
      result.add(right.id);
    }
  }
  return result;
}

/**
 * Converts the API projection into the calendar engine's own intermediate
 * representation. No renderer-specific object leaks out of this boundary.
 */
export function calendarProjectionToItems(
  projection: CalendarProjection,
  tasks: Task[],
  projects: ProjectIdentity[],
): CalendarItem[] {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const conflicts = conflictingBlockIds(projection.timeBlocks);
  const taskListIsLoaded = tasks.length > 0;

  const blocks: CalendarItem[] = projection.timeBlocks
    .filter(block => !taskListIsLoaded || tasksById.has(block.taskId))
    .map(block => {
      const task = tasksById.get(block.taskId);
      const identity = resolveCalendarIdentity(task, task?.projectId ?? null, projects);
      return {
        kind: 'block' as const,
        id: `time-block-${block.id}`,
        taskId: block.taskId,
        title: task?.title ?? 'Scheduled work',
        start: new Date(block.startAt),
        end: new Date(block.endAt),
        timeZone: block.timeZone,
        editable: true as const,
        allDay: block.allDay,
        conflict: conflicts.has(block.id),
        completed: Boolean(task?.completedAt),
        priority: task?.priority ?? null,
        identityColor: identity.color,
        colorName: identity.colorName,
        block,
      };
    });

  const taskItems = projection.deadlines
    .filter(deadline => !taskListIsLoaded || tasksById.has(deadline.taskId))
    .flatMap<CalendarItem>(deadline => {
      const task = tasksById.get(deadline.taskId);
      const identity = resolveCalendarIdentity(task, deadline.projectId, projects, deadline.colorOverride);
      const common = {
        taskId: deadline.taskId,
        title: task?.title ?? deadline.title,
        completed: Boolean(task?.completedAt ?? deadline.completedAt),
        priority: task?.priority ?? deadline.priority,
        identityColor: identity.color,
        colorName: identity.colorName,
      };
      const items: CalendarItem[] = [];
      const startDate = deadline.startDate ?? task?.startDate?.slice(0, 10) ?? null;
      if (startDate && startDate < deadline.date) {
        items.push({
          kind: 'range',
          id: `task-range-${deadline.taskId}`,
          startDate,
          endDate: deadline.date,
          ...common,
        });
      }
      items.push({
        kind: 'deadline',
        id: deadline.id,
        date: deadline.date,
        time: deadline.time,
        timeZone: deadline.timeZone,
        allDay: !deadline.time,
        editable: true,
        deadline,
        ...common,
      });
      return items;
    });

  const external: CalendarItem[] = projection.externalEvents.map(event => ({
    kind: 'external',
    id: `external-${event.id}`,
    provider: event.provider.toLowerCase(),
    start: new Date(event.startAt),
    end: event.endAt ? new Date(event.endAt) : new Date(event.startAt),
    allDay: event.allDay,
    title: event.title,
    event,
  }));

  return [...blocks, ...taskItems, ...external];
}
