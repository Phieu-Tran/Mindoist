import type { SidebarView } from '../hooks/useApi';

export const CALENDAR_VIEWS = ['day', '3day', '5day', 'week', 'month'] as const;
export type CalendarView = typeof CALENDAR_VIEWS[number];

export interface CalendarSearch {
  view: CalendarView;
  date?: string;
  plan: boolean;
}

export interface AppRoute {
  view: SidebarView;
  projectId?: string;
  tagId?: string;
  taskId?: string;
  calendar?: CalendarSearch;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarSearch(search = ''): CalendarSearch {
  const params = new URLSearchParams(search);
  const requestedView = params.get('view');
  const view = CALENDAR_VIEWS.includes(requestedView as CalendarView)
    ? requestedView as CalendarView
    : 'week';
  const date = params.get('date');
  return {
    view,
    date: date && DATE_PATTERN.test(date) ? date : undefined,
    plan: params.get('plan') === '1' || params.get('plan') === 'true',
  };
}

export function routeToView(pathname: string, search = ''): AppRoute {
  const project = pathname.match(/^\/projects\/([^/]+)$/);
  if (project) return { view: 'projects', projectId: project[1] };
  const tag = pathname.match(/^\/tags\/([^/]+)$/);
  if (tag) return { view: 'tags', tagId: decodeURIComponent(tag[1]) };
  const task = pathname.match(/^\/tasks\/([^/]+)$/);
  if (task && !['inbox', 'upcoming'].includes(task[1])) return { view: 'all', taskId: task[1] };
  if (pathname === '/today' || pathname === '/') return { view: 'today' };
  if (pathname === '/tasks/inbox') return { view: 'inbox' };
  if (pathname === '/tasks/upcoming') return { view: 'next7' };
  if (pathname === '/tasks') return { view: 'all' };
  if (pathname === '/projects') return { view: 'projects' };
  if (pathname === '/calendar') return { view: 'calendar', calendar: parseCalendarSearch(search) };
  if (pathname === '/review') return { view: 'summary' };
  if (pathname === '/history/completed') return { view: 'completed' };
  if (pathname === '/history/trash') return { view: 'trashed' };
  if (pathname === '/notes') return { view: 'notes' };
  if (pathname === '/countdown') return { view: 'countdown' };
  if (pathname === '/settings') return { view: 'settings' };
  if (pathname === '/import') return { view: 'import' };
  if (pathname === '/export') return { view: 'export' };
  if (pathname === '/admin') return { view: 'admin' };
  return { view: 'today' };
}

export function viewToRoute(view: SidebarView, projectId?: string, calendar?: Partial<CalendarSearch>, tagId?: string): string {
  if (projectId) return `/projects/${projectId}`;
  if (view === 'tags' && tagId) return `/tags/${encodeURIComponent(tagId)}`;
  const routes: Partial<Record<SidebarView, string>> = {
    today: '/today', all: '/tasks', inbox: '/tasks/inbox', next7: '/tasks/upcoming',
    summary: '/review', completed: '/history/completed', trashed: '/history/trash', notes: '/notes', countdown: '/countdown',
    settings: '/settings', import: '/import', export: '/export', projects: '/projects', admin: '/admin',
  };
  if (view !== 'calendar') return routes[view] || '/today';
  const params = new URLSearchParams();
  params.set('view', calendar?.view ?? 'week');
  if (calendar?.date) params.set('date', calendar.date);
  if (calendar?.plan ?? true) params.set('plan', '1');
  return `/calendar?${params.toString()}`;
}

export function isTaskDetailPath(pathname: string): boolean {
  return /^\/tasks\/[^/]+$/.test(pathname)
    && !['/tasks/inbox', '/tasks/upcoming'].includes(pathname);
}
