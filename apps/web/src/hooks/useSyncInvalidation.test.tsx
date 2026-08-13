import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { SYNC_APPLIED_EVENT } from '@/lib/sync/engine';
import { useSyncInvalidation } from './useSyncInvalidation';

describe('useSyncInvalidation', () => {
  it('invalidates every task-derived cache after a task pull', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useSyncInvalidation(), { wrapper });

    act(() => window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { tables: ['task'] } })));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['task-counts'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['calendar'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['summary'] });
  });

  it('invalidates note and time-block caches independently', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useSyncInvalidation(), { wrapper });

    act(() => window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { tables: ['note', 'timeBlock'] } })));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notes'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['time-blocks'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['calendar'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['summary'] });
  });
});
