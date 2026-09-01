import { useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientContext } from '@tanstack/react-query';
import { SYNC_APPLIED_EVENT } from '@/lib/sync/engine';
import { queryKeys } from '@/lib/query-client';

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
        void queryClient.invalidateQueries({ queryKey: ['calendar'] });
        void queryClient.invalidateQueries({ queryKey: ['summary'] });
      }
      if (tables.has('timeBlock')) void queryClient.invalidateQueries({ queryKey: ['time-blocks'] });
      if (projectsChanged) void queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (tables.has('tag')) void queryClient.invalidateQueries({ queryKey: ['tags'] });
      if (tables.has('note')) void queryClient.invalidateQueries({ queryKey: queryKeys.notes() });
    };

    window.addEventListener(SYNC_APPLIED_EVENT, handleApplied);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, handleApplied);
  }, [queryClient]);
}
