import { useCallback, useEffect, useState } from 'react';
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
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      setTimeBlocks(await listTimeBlocks({ taskId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load planned time');
    } finally {
      setLoading(false);
    }
  }, [enabled, taskId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (input: Omit<CreateTimeBlockRequest, 'taskId'>) => {
    const created = await createTimeBlock({ ...input, taskId });
    setTimeBlocks(previous => [...previous, created]);
    return created;
  }, [taskId]);

  const update = useCallback(async (id: string, input: UpdateTimeBlockRequest) => {
    const updated = await updateTimeBlock(id, input);
    setTimeBlocks(previous => previous.map(block => block.id === id ? updated : block));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteTimeBlock(id);
    setTimeBlocks(previous => previous.filter(block => block.id !== id));
  }, []);

  return { timeBlocks, loading, error, create, update, remove, reload };
}
