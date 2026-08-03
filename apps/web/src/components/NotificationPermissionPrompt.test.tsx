import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  subscribe: vi.fn(),
  supports: vi.fn(() => true),
}));

vi.mock('@/lib/push-notifications', () => ({
  getPushNotificationStatus: pushMocks.getStatus,
  subscribeToPushNotifications: pushMocks.subscribe,
  supportsPushNotifications: pushMocks.supports,
}));

import { NotificationPermissionPrompt } from './NotificationPermissionPrompt';

describe('NotificationPermissionPrompt', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    pushMocks.supports.mockReturnValue(true);
    pushMocks.subscribe.mockResolvedValue(undefined);
  });

  it('waits for the subscription check and stays hidden when notifications are enabled', async () => {
    let resolveStatus!: (status: 'subscribed') => void;
    pushMocks.getStatus.mockReturnValue(new Promise(resolve => {
      resolveStatus = resolve;
    }));

    render(<NotificationPermissionPrompt userId="user-1" />);
    expect(screen.queryByText('Turn on reminders?')).not.toBeInTheDocument();

    await act(async () => resolveStatus('subscribed'));
    expect(screen.queryByText('Turn on reminders?')).not.toBeInTheDocument();
  });

  it('shows only after confirming notifications are not enabled', async () => {
    pushMocks.getStatus.mockResolvedValue('default');

    render(<NotificationPermissionPrompt userId="user-1" />);

    expect(await screen.findByText('Turn on reminders?')).toBeInTheDocument();
  });

  it('disappears after notifications are enabled', async () => {
    pushMocks.getStatus
      .mockResolvedValueOnce('default')
      .mockResolvedValueOnce('subscribed');

    render(<NotificationPermissionPrompt userId="user-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable notifications' }));

    await waitFor(() => {
      expect(pushMocks.subscribe).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Turn on reminders?')).not.toBeInTheDocument();
    });
  });
});
