import { describe, expect, it } from 'vitest';
import { isTaskDetailPath, routeToView, viewToRoute } from './app-routing';

describe('app routing', () => {
  it('keeps project and task deep links shareable', () => {
    expect(routeToView('/projects/project-1')).toEqual({ view: 'projects', projectId: 'project-1' });
    expect(routeToView('/tasks/task-1')).toEqual({ view: 'all', taskId: 'task-1' });
    expect(viewToRoute('projects', 'project-1')).toBe('/projects/project-1');
  });

  it('does not mistake task collection routes for detail routes', () => {
    expect(isTaskDetailPath('/tasks/task-1')).toBe(true);
    expect(isTaskDetailPath('/tasks/inbox')).toBe(false);
    expect(isTaskDetailPath('/tasks/upcoming')).toBe(false);
  });

  it('keeps the administrator console on its dedicated route', () => {
    expect(routeToView('/admin')).toEqual({ view: 'admin' });
    expect(viewToRoute('admin')).toBe('/admin');
  });
});
