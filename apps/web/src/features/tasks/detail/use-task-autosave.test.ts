import { describe, expect, it } from 'vitest';
import { changedTaskFields, taskSyncPatch } from './use-task-autosave';

describe('changedTaskFields', () => {
  it('queues only fields actually edited from the local baseline', () => {
    const baseline = {
      title: 'Original title',
      priority: 2 as const,
      deadline: { date: '2026-08-12' },
      estimateMin: 30,
    };
    const next = {
      ...baseline,
      priority: 1 as const,
    };

    expect(changedTaskFields(baseline, next)).toEqual({ priority: 1 });
  });

  it('recognizes a nested deadline edit without resending unrelated fields', () => {
    const baseline = { title: 'Task', deadline: { date: '2026-08-12' } };
    const next = { title: 'Task', deadline: { date: '2026-08-13' } };
    expect(taskSyncPatch(baseline, next)).toEqual({
      deadlineDate: '2026-08-13',
      deadlineTime: null,
      deadlineTimeZone: null,
    });
  });
});
