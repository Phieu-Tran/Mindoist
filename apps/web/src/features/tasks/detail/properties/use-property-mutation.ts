import { useCallback, useState } from 'react';
import type { UpdateTaskRequest } from '@mindoist/shared/types';
import { enqueueMutation } from '@/lib/sync/engine';
import type { PropertySave } from './types';

export function usePropertyMutation(taskId: string, save: PropertySave) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const commit = useCallback(async (patch: UpdateTaskRequest) => {
    setError(null);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueMutation('task', taskId, 'upsert', patch as Record<string, unknown>, new Date().toISOString());
      return;
    }
    setSaving(true);
    try {
      await save(patch);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save property');
    } finally {
      setSaving(false);
    }
  }, [save, taskId]);

  return { commit, error, saving };
}
