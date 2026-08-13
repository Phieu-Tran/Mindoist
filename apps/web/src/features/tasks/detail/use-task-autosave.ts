import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateTaskRequest } from '@mindoist/shared/types';
import { enqueueMutation } from '@/lib/sync/engine';

type SaveState = 'idle' | 'waiting' | 'saving' | 'saved' | 'queued' | 'error';

interface Options {
  enabled: boolean;
  taskId: string;
  dirty: boolean;
  draft: UpdateTaskRequest;
  initialDraft: UpdateTaskRequest;
  save: (draft: UpdateTaskRequest) => Promise<unknown>;
  onSaved?: () => void;
  delay?: number;
}

export function changedTaskFields(
  baseline: UpdateTaskRequest,
  next: UpdateTaskRequest,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(next).filter(([field, value]) => (
      JSON.stringify(value) !== JSON.stringify(baseline[field as keyof UpdateTaskRequest])
    )),
  );
}

export function taskSyncPatch(
  baseline: UpdateTaskRequest,
  next: UpdateTaskRequest,
): Record<string, unknown> {
  const changed = changedTaskFields(baseline, next);
  if (!Object.prototype.hasOwnProperty.call(changed, 'deadline')) return changed;
  const { deadline, ...rest } = changed;
  const value = deadline as UpdateTaskRequest['deadline'];
  return {
    ...rest,
    deadlineDate: value?.date ?? null,
    deadlineTime: value?.time ?? null,
    deadlineTimeZone: value?.timeZone ?? null,
  };
}

export function useTaskAutosave({
  enabled,
  taskId,
  dirty,
  draft,
  initialDraft,
  save,
  onSaved,
  delay = 800,
}: Options) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const baselineRef = useRef(initialDraft);
  const undoRef = useRef<UpdateTaskRequest | null>(null);
  const draftRef = useRef(draft);
  const saveRef = useRef(save);

  draftRef.current = draft;
  saveRef.current = save;
  const draftKey = JSON.stringify(draft);

  useEffect(() => {
    baselineRef.current = initialDraft;
    undoRef.current = null;
    setState('idle');
    setError(null);
  }, [taskId]);

  const persist = useCallback(async (nextDraft: UpdateTaskRequest) => {
    setError(null);
    undoRef.current = baselineRef.current;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const patch = taskSyncPatch(baselineRef.current, nextDraft);
      if (Object.keys(patch).length > 0) {
        enqueueMutation('task', taskId, 'upsert', patch, new Date().toISOString());
      }
      baselineRef.current = nextDraft;
      setState('queued');
      onSaved?.();
      return;
    }

    setState('saving');
    try {
      await saveRef.current(nextDraft);
      baselineRef.current = nextDraft;
      setState('saved');
      onSaved?.();
    } catch (cause) {
      setState('error');
      setError(cause instanceof Error ? cause.message : 'Unable to save task');
    }
  }, [onSaved, taskId]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    setState('waiting');
    const timer = window.setTimeout(() => {
      void persist(draftRef.current);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [delay, dirty, draftKey, enabled, persist]);

  const undo = useCallback(async () => {
    if (!undoRef.current) return;
    const previous = undoRef.current;
    undoRef.current = baselineRef.current;
    await persist(previous);
  }, [persist]);

  return {
    state,
    error,
    canUndo: undoRef.current != null && (state === 'saved' || state === 'queued'),
    saveNow: () => persist(draftRef.current),
    undo,
  };
}
