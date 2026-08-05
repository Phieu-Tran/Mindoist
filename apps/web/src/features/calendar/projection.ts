import type { EventInput } from '@fullcalendar/core';
import type { Task, TimeBlock } from '@mindoist/shared/types';
import { isTaskColor, taskColorClass } from '@/lib/task-colors';

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

function addDateOnlyDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

const PROJECT_COLORS = new Set(['indigo', 'ocean', 'jade', 'rose', 'amber']);

function projectColor(task: Task | undefined, projects: ProjectIdentity[]) {
  const project = task?.projectId
    ? projects.find(candidate => candidate.id === task.projectId)
    : undefined;
  return project?.color && PROJECT_COLORS.has(project.color)
    ? `var(--color-project-${project.color})`
    : 'var(--calendar-time-block-accent)';
}

function projectedProjectColor(
  task: Task | undefined,
  projectId: string | null,
  projects: ProjectIdentity[],
) {
  if (task) return projectColor(task, projects);
  const project = projectId
    ? projects.find(candidate => candidate.id === projectId)
    : undefined;
  return project?.color && PROJECT_COLORS.has(project.color)
    ? `var(--color-project-${project.color})`
    : 'var(--calendar-time-block-accent)';
}

function projectedIdentity(
  task: Task | undefined,
  deadline: DeadlineProjection,
  projects: ProjectIdentity[],
) {
  const customColor = isTaskColor(task?.color)
    ? task.color
    : isTaskColor(deadline.colorOverride)
      ? deadline.colorOverride
      : null;
  return {
    customColor,
    identityColor: customColor
      ? 'var(--task-color-accent)'
      : projectedProjectColor(task, deadline.projectId, projects),
  };
}

function projectedRangeToEvent(
  deadline: DeadlineProjection,
  task: Task | undefined,
  projects: ProjectIdentity[],
): EventInput | null {
  const start = deadline.startDate ?? task?.startDate?.slice(0, 10);
  if (!start || start >= deadline.date) return null;

  const { customColor, identityColor } = projectedIdentity(task, deadline, projects);
  const priority = deadline.priority && deadline.priority >= 1 && deadline.priority <= 4
    ? deadline.priority
    : null;

  return {
    id: `task-range-${deadline.taskId}`,
    title: deadline.title,
    start,
    end: addDateOnlyDays(deadline.date, 1),
    allDay: true,
    editable: false,
    durationEditable: false,
    color: identityColor,
    classNames: [
      'calendar-task-range-event',
      customColor ? taskColorClass(customColor) : 'task-color-none',
      priority ? `calendar-priority-marker-p${priority}` : 'calendar-priority-marker-none',
      (task?.completedAt ?? deadline.completedAt) ? 'calendar-task-event-completed' : '',
    ].filter(Boolean),
    extendedProps: {
      kind: 'taskRange',
      source: 'mindoist',
      task,
      taskId: deadline.taskId,
      deadline,
      identityColor,
    },
  };
}

export function taskRangeToEvent(
  task: Task,
  projects: ProjectIdentity[],
  projectedDeadline?: DeadlineProjection,
): EventInput | null {
  const start = projectedDeadline?.startDate ?? task.startDate?.slice(0, 10);
  const deadline = projectedDeadline?.date ?? task.deadline?.date ?? task.dueDate?.slice(0, 10);
  if (!start || !deadline || start >= deadline) return null;

  const customColor = isTaskColor(task.color) ? task.color : null;
  const priority = task.priority && task.priority >= 1 && task.priority <= 4
    ? task.priority
    : null;
  const identityColor = customColor
    ? 'var(--task-color-accent)'
    : projectColor(task, projects);

  return {
    id: `task-range-${task.id}`,
    title: task.title,
    start,
    // FullCalendar uses an exclusive end for all-day spans. Advancing one
    // date keeps the task visible through its deadline, including when the
    // range is split into separate row segments at a week boundary.
    end: addDateOnlyDays(deadline, 1),
    allDay: true,
    editable: false,
    durationEditable: false,
    color: identityColor,
    classNames: [
      'calendar-task-range-event',
      customColor ? taskColorClass(customColor) : 'task-color-none',
      priority ? `calendar-priority-marker-p${priority}` : 'calendar-priority-marker-none',
      task.completedAt ? 'calendar-task-event-completed' : '',
    ].filter(Boolean),
    extendedProps: {
      kind: 'taskRange',
      source: 'mindoist',
      task,
      taskId: task.id,
      deadline: projectedDeadline,
      identityColor,
    },
  };
}

export function calendarProjectionToEvents(
  projection: CalendarProjection,
  tasks: Task[],
  projects: ProjectIdentity[],
): EventInput[] {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  // The projection snapshot is only refetched on date-range navigation, not
  // whenever the task list itself changes - deleting a task removes it from
  // `tasks` immediately, but its deadline entry lingers in this stale
  // snapshot until the next navigation/reload, so its marker kept showing
  // on Calendar right after deletion (with an Undo toast still up) until
  // then. Deadlines for a task no longer in the live list are dropped here
  // instead of rendered with an undefined task - but only once the task
  // list has actually loaded (an empty `tasks` array on first mount, before
  // its own fetch resolves, isn't evidence of deletion, and the projection
  // alone should still render in that brief window).
  const liveDeadlines = tasks.length === 0
    ? projection.deadlines
    : projection.deadlines.filter(deadline => tasksById.has(deadline.taskId));
  const deadlinesByTaskId = new Map(
    liveDeadlines.map(deadline => [deadline.taskId, deadline]),
  );
  const conflictingTimeBlockIds = new Set(
    projection.timeBlocks.flatMap((block, index, blocks) =>
      blocks.some((candidate, candidateIndex) =>
        candidateIndex !== index &&
        new Date(block.startAt) < new Date(candidate.endAt) &&
        new Date(block.endAt) > new Date(candidate.startAt)
      )
        ? [block.id]
        : [],
    ),
  );

  const timeBlocks = projection.timeBlocks
    .filter(block => tasksById.has(block.taskId))
    .map<EventInput>(block => {
    const task = tasksById.get(block.taskId);
    const customColor = task && isTaskColor(task.color) ? task.color : null;
    return {
      id: `time-block-${block.id}`,
      title: task?.title ?? 'Scheduled work',
      start: block.startAt,
      end: block.endAt,
      allDay: block.allDay,
      editable: true,
      color: customColor ? 'var(--task-color-accent)' : projectColor(task, projects),
      classNames: [
        'calendar-time-block-event',
        customColor ? taskColorClass(customColor) : 'task-color-none',
        conflictingTimeBlockIds.has(block.id) ? 'calendar-conflict-event' : '',
      ].filter(Boolean),
      extendedProps: {
        kind: 'timeBlock',
        source: 'mindoist',
        task,
        timeBlock: block,
        identityColor: customColor ? 'var(--task-color-accent)' : projectColor(task, projects),
        conflict: conflictingTimeBlockIds.has(block.id),
      },
    };
  });

  const projectedRanges = liveDeadlines
    .map(deadline => projectedRangeToEvent(deadline, tasksById.get(deadline.taskId), projects))
    .filter((event): event is EventInput => event !== null);
  const projectedRangeTaskIds = new Set(
    projectedRanges.map(event => event.extendedProps?.taskId as string),
  );
  const fallbackRanges = tasks
    .filter(task => !projectedRangeTaskIds.has(task.id))
    .map(task => taskRangeToEvent(task, projects, deadlinesByTaskId.get(task.id)))
    .filter((event): event is EventInput => event !== null);
  const taskRanges = [...projectedRanges, ...fallbackRanges];
  const rangedTaskIds = new Set(
    taskRanges.map(event => event.extendedProps?.taskId as string),
  );

  const deadlines = liveDeadlines
    // A date-only deadline is already represented by the range's final edge.
    // A timed deadline remains as its own marker in the timed grid.
    .filter(deadline => Boolean(deadline.time) || !rangedTaskIds.has(deadline.taskId))
    .map<EventInput>(deadline => {
    const task = tasksById.get(deadline.taskId);
    const { customColor, identityColor } = projectedIdentity(task, deadline, projects);
    const priority =
      deadline.priority && deadline.priority >= 1 && deadline.priority <= 4
        ? deadline.priority
        : null;
    return {
      id: deadline.id,
      title: deadline.title,
      start: deadline.time ? `${deadline.date}T${deadline.time}:00` : deadline.date,
      allDay: !deadline.time,
      editable: true,
      durationEditable: false,
      color: identityColor,
      classNames: [
        'calendar-deadline-event',
        customColor ? taskColorClass(customColor) : 'task-color-none',
        priority ? `calendar-priority-marker-p${priority}` : 'calendar-priority-marker-none',
        (task?.completedAt ?? deadline.completedAt) ? 'calendar-task-event-completed' : '',
      ].filter(Boolean),
      extendedProps: {
        kind: 'deadline',
        source: 'mindoist',
        task,
        deadline,
        identityColor,
      },
    };
  });

  const externalEvents = projection.externalEvents.map<EventInput>(event => ({
    id: `external-${event.id}`,
    title: event.title,
    start: event.startAt,
    end: event.endAt ?? undefined,
    allDay: event.allDay,
    editable: false,
    color: 'var(--calendar-external-accent)',
    classNames: ['calendar-external-event', `calendar-provider-${event.provider.toLowerCase()}`],
    extendedProps: {
      kind: 'externalEvent',
      source: event.provider.toLowerCase(),
      externalEvent: event,
    },
  }));

  return [...timeBlocks, ...taskRanges, ...deadlines, ...externalEvents];
}
