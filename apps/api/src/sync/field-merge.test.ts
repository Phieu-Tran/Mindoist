import { describe, expect, it } from 'vitest';
import { mergeFieldPatch } from './field-merge.js';

describe('mergeFieldPatch', () => {
  it('keeps independent fields and records their timestamps', () => {
    const result = mergeFieldPatch({
      title: { value: 'Deploy v2', at: '2026-08-12T09:05:00.000Z' },
      priority: { value: 1, at: '2026-08-12T09:00:00.000Z' },
    }, {}, '2026-08-12T08:00:00.000Z', ['title', 'priority']);

    expect(result.accepted).toEqual({ title: 'Deploy v2', priority: 1 });
    expect(result.conflicts).toEqual([]);
  });

  it('rejects stale fields without rejecting newer fields in the same patch', () => {
    const result = mergeFieldPatch({
      title: { value: 'stale', at: '2026-08-12T08:59:00.000Z' },
      priority: { value: 2, at: '2026-08-12T09:01:00.000Z' },
    }, { title: '2026-08-12T09:00:00.000Z' }, '2026-08-12T08:00:00.000Z', ['title', 'priority']);

    expect(result.accepted).toEqual({ priority: 2 });
    expect(result.conflicts).toEqual([{ field: 'title', rejected: '2026-08-12T08:59:00.000Z', kept: '2026-08-12T09:00:00.000Z' }]);
  });

  it('uses the newer timestamp when two devices edit the same field', () => {
    const result = mergeFieldPatch({
      title: { value: 'newer', at: '2026-08-12T09:02:00.000Z' },
    }, { title: '2026-08-12T09:01:00.000Z' }, '2026-08-12T08:00:00.000Z', ['title']);

    expect(result.accepted).toEqual({ title: 'newer' });
    expect(result.fieldVersions.title).toBe('2026-08-12T09:02:00.000Z');
  });

  it('ignores fields outside the table allow-list', () => {
    const result = mergeFieldPatch({
      userId: { value: 'attacker', at: '2026-08-12T10:00:00.000Z' },
    }, {}, '2026-08-12T08:00:00.000Z', ['title']);

    expect(result.accepted).toEqual({});
    expect(result.conflicts).toEqual([]);
  });
});
