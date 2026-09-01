import { useCallback, useEffect, useRef, useState } from 'react';
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
  const timeBlocksRef = useRef<TimeBlock[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await listTimeBlocks({ taskId });
      timeBlocksRef.current = loaded;
      setTimeBlocks(loaded);
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
    const now = new Date().toISOString();
    const optimisticId = `optimistic-${taskId}-${Date.now()}`;
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
    timeBlocksRef.current = [...timeBlocksRef.current, optimistic];
    setTimeBlocks(timeBlocksRef.current);
    try {
      const created = await createTimeBlock({ ...input, taskId });
      timeBlocksRef.current = timeBlocksRef.current.map(block => block.id === optimisticId ? created : block);
      setTimeBlocks(timeBlocksRef.current);
      return created;
    } catch (cause) {
      timeBlocksRef.current = timeBlocksRef.current.filter(block => block.id !== optimisticId);
      setTimeBlocks(timeBlocksRef.current);
      throw cause;
    }
  }, [taskId]);

  const update = useCallback(async (id: string, input: UpdateTimeBlockRequest) => {
    const previous = timeBlocksRef.current.find(block => block.id === id);
    if (previous) {
      timeBlocksRef.current = timeBlocksRef.current.map(block => block.id === id ? { ...block, ...input, updatedAt: new Date().toISOString() } : block);
      setTimeBlocks(timeBlocksRef.current);
    }
    try {
      const updated = await updateTimeBlock(id, input);
      timeBlocksRef.current = timeBlocksRef.current.map(block => block.id === id ? updated : block);
      setTimeBlocks(timeBlocksRef.current);
      return updated;
    } catch (cause) {
      if (previous) {
        timeBlocksRef.current = timeBlocksRef.current.map(block => block.id === id ? previous : block);
        setTimeBlocks(timeBlocksRef.current);
      }
      throw cause;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const previous = timeBlocksRef.current;
    timeBlocksRef.current = previous.filter(block => block.id !== id);
    setTimeBlocks(timeBlocksRef.current);
    try {
      await deleteTimeBlock(id);
    } catch (cause) {
      timeBlocksRef.current = previous;
      setTimeBlocks(previous);
      throw cause;
    }
  }, []);

  return { timeBlocks, loading, error, create, update, remove, reload };
}
