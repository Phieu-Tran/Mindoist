import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import App from '@/App';
import { parseCalendarSearch } from './app-routing';

export interface AppSearch {
  task?: string;
}

export interface ReviewSearch extends AppSearch {
  range: 'week' | 'month';
}

function optionalTask(search: Record<string, unknown>): AppSearch {
  return typeof search.task === 'string' && search.task.length > 0 ? { task: search.task } : {};
}

const rootRoute = createRootRoute({ component: App });
const appRoute = <TPath extends string,>(path: TPath) => createRoute({
  getParentRoute: () => rootRoute,
  path,
  validateSearch: (search: Record<string, unknown>) => optionalTask(search),
});
const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseCalendarSearch(new URLSearchParams(Object.entries(search).flatMap(([key, value]) => value == null ? [] : [[key, String(value)]])).toString()),
    ...optionalTask(search),
  }),
});
const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/review',
  validateSearch: (search: Record<string, unknown>): ReviewSearch => ({
    range: search.range === 'month' ? 'month' : 'week',
    ...optionalTask(search),
  }),
});

const routeTree = rootRoute.addChildren([
  appRoute('/'), appRoute('/login'), appRoute('/register'), appRoute('/privacy'), appRoute('/terms'),
  appRoute('/today'), appRoute('/tasks'), appRoute('/tasks/inbox'), appRoute('/tasks/upcoming'),
  appRoute('/tasks/$taskId'), appRoute('/projects'), appRoute('/projects/$projectId'), calendarRoute,
  reviewRoute, appRoute('/history/completed'), appRoute('/history/trash'), appRoute('/notes'),
  appRoute('/countdown'), appRoute('/settings'), appRoute('/import'), appRoute('/export'), appRoute('/admin'),
]);

export const appRouter = createRouter({ routeTree, defaultPreload: 'intent' });
declare module '@tanstack/react-router' { interface Register { router: typeof appRouter } }
