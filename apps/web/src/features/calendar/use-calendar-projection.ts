import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { useCallback, useContext, useState } from 'react';
import { queryKeys } from '@/lib/query-client';
import { getCalendarProjection } from './api';
import type { CalendarProjection } from './projection';

type ProjectionUpdate = CalendarProjection | null | ((current: CalendarProjection | null) => CalendarProjection | null);

export function useCalendarProjection(from: string, to: string, timeZone: string) {
  const contextClient = useContext(QueryClientContext);
  const [localClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
  }));
  const queryClient = contextClient ?? localClient;
  const queryKey = queryKeys.projection(from, to, timeZone);
  const query = useQuery({
    queryKey,
    queryFn: () => getCalendarProjection(from, to),
  }, queryClient);

  const setProjection = useCallback((update: ProjectionUpdate) => {
    queryClient.setQueryData<CalendarProjection | null>(queryKey, current => (
      typeof update === 'function' ? update(current ?? null) : update
    ));
  }, [from, queryClient, timeZone, to]);

  return {
    projection: query.data ?? null,
    error: query.error,
    loading: query.isPending,
    refetch: query.refetch,
    setProjection,
  };
}
