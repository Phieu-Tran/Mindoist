import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncCenter } from './SyncCenter';

const syncMock = vi.hoisted(() => ({
  listener: null as null | ((status: Record<string, unknown>) => void),
  retry: vi.fn(async () => true),
  initial: {
    online: true,
    phase: 'idle',
    pendingCount: 0,
    lastSyncedAt: null,
    error: null,
  },
}));

vi.mock('../lib/sync/engine', () => ({
  getSyncStatus: () => syncMock.initial,
  onSyncStatusChange: (listener: (status: Record<string, unknown>) => void) => {
    syncMock.listener = listener;
    listener(syncMock.initial);
    return () => { syncMock.listener = null; };
  },
  retrySync: syncMock.retry,
}));

describe('SyncCenter', () => {
  beforeEach(() => syncMock.retry.mockClear());

  it('shows sync details on demand', () => {
    render(<SyncCenter />);

    fireEvent.click(screen.getByRole('button', { name: /Sync center: Synced/i }));

    expect(screen.getByRole('heading', { name: 'Sync center' })).toBeInTheDocument();
    expect(screen.getByText('Changes waiting')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
  });

  it('surfaces errors and lets the user retry', () => {
    render(<SyncCenter />);

    act(() => syncMock.listener?.({
      online: true,
      phase: 'error',
      pendingCount: 2,
      lastSyncedAt: null,
      error: 'Network unavailable',
    }));

    fireEvent.click(screen.getByRole('button', { name: /Sync center: Sync needs attention/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(syncMock.retry).toHaveBeenCalledOnce();
  });
});
