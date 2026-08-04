import type { SidebarView } from '../hooks/useApi';

export function routeToView(pathname: string): { view: SidebarView; projectId?: string; taskId?: string } {
  const project = pathname.match(/^\/projects\/([^/]+)$/);
  if (project) return { view: 'projects', projectId: project[1] };
  const task = pathname.match(/^\/tasks\/([^/]+)$/);
  if (task && !['inbox', 'upcoming'].includes(task[1])) return { view: 'all', taskId: task[1] };
  if (pathname === '/today' || pathname === '/') return { view: 'today' };
  if (pathname === '/tasks/inbox') return { view: 'inbox' };
  if (pathname === '/tasks/upcoming') return { view: 'next7' };
  if (pathname === '/tasks') return { view: 'all' };
  if (pathname === '/projects') return { view: 'projects' };
  if (pathname === '/calendar') return { view: 'calendar' };
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

export function viewToRoute(view: SidebarView, projectId?: string): string {
  if (projectId) return `/projects/${projectId}`;
  const routes: Partial<Record<SidebarView, string>> = {
    today: '/today', all: '/tasks', inbox: '/tasks/inbox', next7: '/tasks/upcoming', calendar: '/calendar?view=week&plan=1',
    summary: '/review', completed: '/history/completed', trashed: '/history/trash', notes: '/notes', countdown: '/countdown',
    settings: '/settings', import: '/import', export: '/export', projects: '/projects', admin: '/admin',
  };
  return routes[view] || '/today';
}

export function isTaskDetailPath(pathname: string): boolean {
  return /^\/tasks\/[^/]+$/.test(pathname)
    && !['/tasks/inbox', '/tasks/upcoming'].includes(pathname);
}
