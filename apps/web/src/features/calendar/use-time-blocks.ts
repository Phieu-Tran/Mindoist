import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useResourceQueryClient } from '@/hooks/useApiData';
import { queryKeys } from '@/lib/query-client';
import type {
  CreateTimeBlockRequest,
  TimeBlock,
  UpdateTimeBlockRequest,
} from '@mindoist/shared/types';
import {
  createTimeBlock,
  deleteTimeBlock,
  listTimeBlocks,
  updateTimeBlock,
} from './api';

export function useTimeBlocks(taskId: string, enabled = true) {
  const queryClient = useResourceQueryClient();
  const key = queryKeys.timeBlocks(taskId);
  const query = useQuery({ queryKey: key, enabled, queryFn: () => listTimeBlocks({ taskId }) }, queryClient);
  const read = () => queryClient.getQueryData<TimeBlock[]>(key) ?? [];
  const write = (update: (current: TimeBlock[]) => TimeBlock[]) => {
    void queryClient.cancelQueries({ queryKey: key }, { revert: false });
    queryClient.setQueryData<TimeBlock[]>(key, current => update(current ?? []));
  };

  const create = useCallback(async (input: Omit<CreateTimeBlockRequest, 'taskId'>) => {
    const now = new Date().toISOString();
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimistic: TimeBlock = {
      id: optimisticId,
      userId: '',
      taskId,
      startAt: input.startAt,
      endAt: input.endAt,
      timeZone: input.timeZone,
      allDay: input.allDay ?? false,
      source: input.source ?? 'MANUAL',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      completedAt: input.completedAt,
      actualMin: input.actualMin,
    };
    write(current => [...current, optimistic]);
    try {
      const created = await createTimeBlock({ ...input, taskId });
      write(current => current.map(block => block.id === optimisticId ? created : block));
      return created;
    } catch (cause) {
      write(current => current.filter(block => block.id !== optimisticId));
      throw cause;
    }
  }, [queryClient, taskId]);

  const update = useCallback(async (id: string, input: UpdateTimeBlockRequest) => {
    const previous = read().find(block => block.id === id);
    if (previous) {
      write(current => current.map(block => block.id === id ? { ...block, ...input, updatedAt: new Date().toISOString() } : block));
    }
    try {
      const updated = await updateTimeBlock(id, input);
      write(current => current.map(block => block.id === id ? updated : block));
      return updated;
    } catch (cause) {
      if (previous) {
        write(current => current.map(block => block.id === id ? previous : block));
      }
      throw cause;
    }
  }, [queryClient, taskId]);

  const remove = useCallback(async (id: string) => {
    const previous = read().find(block => block.id === id);
    write(current => current.filter(block => block.id !== id));
    try {
      await deleteTimeBlock(id);
    } catch (cause) {
      if (previous) write(current => [...current, previous]);
      throw cause;
    }
  }, [queryClient, taskId]);

  return {
    timeBlocks: enabled ? query.data ?? [] : [],
    loading: enabled && query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    create, update, remove, reload: query.refetch,
  };
}
