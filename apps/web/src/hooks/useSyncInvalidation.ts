import { useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientContext } from '@tanstack/react-query';
import { SYNC_APPLIED_EVENT } from '@/lib/sync/engine';
import { queryKeys } from '@/lib/query-client';
import { CALENDAR_PROJECTION_REFRESH_EVENT } from '@/features/calendar/calendar-refresh';

type SyncTable = 'task' | 'timeBlock' | 'project' | 'tag' | 'section' | 'taskTag' | 'note' | 'reminder' | 'projectColumn' | 'taskChecklistItem' | 'area';

export function useSyncInvalidation() {
  const contextClient = useContext(QueryClientContext);
  const [localClient] = useState(() => new QueryClient());
  const queryClient = contextClient ?? localClient;

  useEffect(() => {
    const handleApplied = (event: Event) => {
      const tables = new Set((event as CustomEvent<{ tables?: SyncTable[] }>).detail?.tables ?? []);
      const tasksChanged = ['task', 'section', 'taskTag', 'reminder', 'taskChecklistItem'].some(table => tables.has(table as SyncTable));
      const projectsChanged = ['project', 'projectColumn', 'area'].some(table => tables.has(table as SyncTable));

      if (tasksChanged || projectsChanged || tables.has('tag')) {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
      if (tasksChanged) void queryClient.invalidateQueries({ queryKey: queryKeys.taskCounts() });
      if (tasksChanged || projectsChanged || tables.has('timeBlock')) {
        void queryClient.invalidateQueries({ queryKey: ['calendar', 'projection'] });
      }
      if (tables.has('timeBlock')) void queryClient.invalidateQueries({ queryKey: ['time-blocks'] });
      if (projectsChanged) void queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (tables.has('tag')) void queryClient.invalidateQueries({ queryKey: ['tags'] });
      if (tables.has('area')) void queryClient.invalidateQueries({ queryKey: queryKeys.areas() });
      if (tables.has('note')) void queryClient.invalidateQueries({ queryKey: queryKeys.notes() });
    };

    const handleCalendarChange = () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'projection'] });
      void queryClient.invalidateQueries({ queryKey: ['time-blocks'] });
    };
    window.addEventListener(SYNC_APPLIED_EVENT, handleApplied);
    window.addEventListener(CALENDAR_PROJECTION_REFRESH_EVENT, handleCalendarChange);
    return () => {
      window.removeEventListener(SYNC_APPLIED_EVENT, handleApplied);
      window.removeEventListener(CALENDAR_PROJECTION_REFRESH_EVENT, handleCalendarChange);
    };
  }, [queryClient]);
}
