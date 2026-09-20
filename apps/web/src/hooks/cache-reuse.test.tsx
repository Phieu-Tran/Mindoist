import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import { queryClient as defaults, queryKeys } from '@/lib/query-client';
import { useTasksQuery } from './useTasksQuery';
import { useAreas, useGoogleCalendarStatus, useSettings, useSummaryTasks } from './useApiData';
import { useProjectsQuery } from './useProjectsQuery';
import { useTagsQuery } from './useTagsQuery';
import { useSyncInvalidation } from './useSyncInvalidation';
import { SYNC_APPLIED_EVENT } from '@/lib/sync/engine';
import { requestCalendarProjectionRefresh } from '@/features/calendar/calendar-refresh';
import { useCalendarProjection } from '@/features/calendar/use-calendar-projection';

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: defaults.getDefaultOptions() });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const fetch = vi.fn(async (path: string, init?: RequestInit) => ({
    json: async () => ({ success: true, data: path === '/gcal/status' ? { connected: true }
      : init?.method === 'POST' ? { id: 'created', title: 'Created', tagIds: [] } : [] }),
  }));
  vi.stubGlobal('fetch', fetch);
  return { client, wrapper, fetch };
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('deduplicates equivalent task views and summary reads, reuses navigation cache, and shares writes', async () => {
  const { client, wrapper, fetch } = setup();
  const useViews = () => ({
    all: useTasksQuery('all', true), calendar: useTasksQuery('calendar', true),
    today: useTasksQuery('today', true), inbox: useTasksQuery('inbox', true),
    summary: useSummaryTasks(true),
  });
  const first = renderHook(useViews, { wrapper });
  await waitFor(() => expect(first.result.current.summary.loading).toBe(false));
  // Six consumers need only three distinct lists: active, inbox and completed.
  expect(fetch.mock.calls.map(([path]) => path).sort()).toEqual(['/tasks', '/tasks?filter=completed', '/tasks?filter=inbox']);
  first.unmount();
  const second = renderHook(useViews, { wrapper });
  expect(second.result.current.summary.loading).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(3);
  await act(async () => { await second.result.current.all.addTask({ title: 'Created' }); });
  await waitFor(() => expect(second.result.current.calendar.tasks[0]?.id).toBe('created'));
  expect(second.result.current.summary.tasks[0]?.id).toBe('created');
  expect(client.getQueryState(queryKeys.tasks('inbox'))?.isInvalidated).toBe(true);
  expect(queryKeys.tasks('all', 'project-a')).not.toEqual(queryKeys.tasks('all', 'project-b'));
  expect(queryKeys.tasks('all', undefined, 'tag-a')).not.toEqual(queryKeys.tasks('all', undefined, 'tag-b'));

  second.unmount();
  const nextSession = new QueryClient({ defaultOptions: defaults.getDefaultOptions() });
  clients.push(nextSession);
  renderHook(() => useTasksQuery('all', true), {
    wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={nextSession}>{children}</QueryClientProvider>,
  });
  await waitFor(() => expect(fetch.mock.calls.filter(([path, init]) => path === '/tasks' && !init?.method)).toHaveLength(2));
});

it('shares Google status and clears both connection and event caches on disconnect', async () => {
  const { client, wrapper, fetch } = setup();
  const { result } = renderHook(() => ({ sidebar: useGoogleCalendarStatus(true), settings: useGoogleCalendarStatus(true) }), { wrapper });
  await waitFor(() => expect(result.current.sidebar.connected).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  client.setQueryData(queryKeys.googleCalendarEvents(), [{ id: 'event' }]);
  await act(async () => { await result.current.settings.disconnect(); });
  await waitFor(() => expect(result.current.sidebar.connected).toBe(false));
  expect(client.getQueryData(queryKeys.googleCalendarEvents())).toEqual([]);
});

it('shares calendar projections with summaries and keeps date ranges and timezones separate', async () => {
  const { wrapper, fetch } = setup();
  const { result, rerender } = renderHook(({ zone }) => ({
    calendar: useCalendarProjection('2026-09-01', '2026-10-01', 'UTC'),
    summary: useCalendarProjection('2026-09-01', '2026-10-01', zone),
  }), { wrapper, initialProps: { zone: 'UTC' } });
  await waitFor(() => expect(result.current.summary.loading).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(1);
  rerender({ zone: 'Asia/Ho_Chi_Minh' });
  await waitFor(() => expect(result.current.summary.loading).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new URL(fetch.mock.calls[1][0], 'https://example.test').searchParams.get('timeZone')).toBe('Asia/Ho_Chi_Minh');
  expect(queryKeys.projection('2026-09-01', '2026-10-01', 'UTC')).not.toEqual(queryKeys.projection('2026-10-01', '2026-11-01', 'UTC'));
});

it('reuses reference data beyond the task freshness window and refreshes only affected caches', async () => {
  const { client, wrapper, fetch } = setup();
  const updatedAt = Date.now() - 90_000;
  const settings = { pomodoroWorkMinutes: 25, pomodoroBreakMinutes: 5, workHoursPerDay: 8, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  client.setQueryData(queryKeys.settings(), settings, { updatedAt });
  for (const key of [queryKeys.projects(), queryKeys.tags(), queryKeys.areas()]) client.setQueryData(key, [], { updatedAt });
  client.setQueryData(queryKeys.googleCalendarEvents(), []);
  client.setQueryData(queryKeys.googleCalendarStatus(), { connected: true });
  const projectionKey = queryKeys.projection('from', 'to', 'UTC');
  client.setQueryData(projectionKey, { timeBlocks: [] });
  client.setQueryData(queryKeys.timeBlocks('task'), []);
  renderHook(() => {
    useSettings(true); useProjectsQuery(true); useTagsQuery(true); useAreas(true); useSyncInvalidation();
  }, { wrapper });
  expect(fetch).not.toHaveBeenCalled();
  act(() => requestCalendarProjectionRefresh());
  expect(client.getQueryState(projectionKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(queryKeys.timeBlocks('task'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(queryKeys.googleCalendarEvents())?.isInvalidated).toBe(false);
  expect(client.getQueryState(queryKeys.googleCalendarStatus())?.isInvalidated).toBe(false);
  act(() => window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { tables: ['area'] } })));
  await waitFor(() => expect(fetch.mock.calls.map(([path]) => path)).toContain('/areas'));
});

it('updates the cached timezone after saving it instead of repeating that PATCH on later settings edits', async () => {
  const { client, wrapper, fetch } = setup();
  client.setQueryData(queryKeys.settings(), { pomodoroWorkMinutes: 25, pomodoroBreakMinutes: 5, workHoursPerDay: 8, timeZone: null });
  const { result } = renderHook(() => useSettings(true), { wrapper });
  await waitFor(() => expect(client.getQueryData(queryKeys.settings())).toHaveProperty('timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone));
  await act(async () => { await result.current.updateWorkHoursPerDay(6); });
  expect(fetch.mock.calls.filter(([, init]) => init?.body?.toString().includes('timeZone'))).toHaveLength(1);
  expect(client.getQueryData(queryKeys.settings())).toHaveProperty('workHoursPerDay', 6);
});
