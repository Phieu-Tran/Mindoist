import { describe, expect, it } from 'vitest';
import { isTaskDetailPath, parseCalendarSearch, routeToView, viewToRoute } from './app-routing';

describe('app routing', () => {
  it('keeps project, tag, and task deep links shareable', () => {
    expect(routeToView('/projects/project-1')).toEqual({ view: 'projects', projectId: 'project-1' });
    expect(routeToView('/tags/tag-1')).toEqual({ view: 'tags', tagId: 'tag-1' });
    expect(routeToView('/tasks/task-1')).toEqual({ view: 'all', taskId: 'task-1' });
    expect(viewToRoute('projects', 'project-1')).toBe('/projects/project-1');
    expect(viewToRoute('tags', undefined, undefined, 'tag-1')).toBe('/tags/tag-1');
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

  it('validates calendar search params and preserves deep links', () => {
    expect(parseCalendarSearch('?view=3day&date=2026-08-12&plan=1')).toEqual({
      view: '3day', date: '2026-08-12', plan: true,
    });
    expect(parseCalendarSearch('?view=unknown&date=nope&plan=0')).toEqual({
      view: 'week', date: undefined, plan: false,
    });
    expect(routeToView('/calendar', '?view=month&date=2026-08-12&plan=true')).toEqual({
      view: 'calendar', calendar: { view: 'month', date: '2026-08-12', plan: true },
    });
    expect(viewToRoute('calendar', undefined, { view: 'day', date: '2026-08-12', plan: false }))
      .toBe('/calendar?view=day&date=2026-08-12');
  });
});
