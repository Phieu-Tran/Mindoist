import { describe, expect, it } from 'vitest';
import type { Task } from '@mindoist/shared/types';
import { countVisibleTasks, selectCalendarTaskViews } from './app-task-views';

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'task-1',
    title: overrides.title ?? 'Task',
    parentId: null,
    projectId: null,
    dueDate: null,
    startDate: null,
    completedAt: null,
    deletedAt: null,
    color: null,
    ...overrides,
  } as Task;
}

describe('app task view selectors', () => {
  const now = new Date(2026, 7, 2, 12);

  it('keeps subtasks out and includes active multi-day tasks in Today', () => {
    const tasks = [
      task({ id: 'spanning', startDate: '2026-08-01', dueDate: '2026-08-03' }),
      task({ id: 'child', parentId: 'spanning', dueDate: '2026-08-02' }),
    ];

    expect(countVisibleTasks(tasks, 'today', now)).toBe(1);
    expect(selectCalendarTaskViews(tasks, null, now).todayTasks.map(item => item.id)).toEqual(['spanning']);
  });

  it('builds backlog and color preview from the same top-level set', () => {
    const views = selectCalendarTaskViews([task({ id: 'backlog' })], { id: 'backlog', color: '#2563eb' }, now);
    expect(views.backlogTasks).toHaveLength(1);
    expect(views.calendarTasks[0].color).toBe('#2563eb');
  });
});
