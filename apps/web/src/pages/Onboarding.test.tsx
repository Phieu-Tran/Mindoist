import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@mindoist/shared/types';
import { Onboarding } from './Onboarding';

const user: User = {
  id: 'user-1',
  email: 'hello@example.com',
  name: 'Google Name',
  timeZone: null,
  onboardingRequired: true,
  role: 'USER',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
};

describe('Onboarding', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  async function reachPasswordStep() {
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'From capture to a clear day' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Add a backup way to sign in' })).toBeInTheDocument();
  }

  it('confirms profile details before introducing the app', async () => {
    render(<Onboarding user={user} onComplete={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Make this workspace yours' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Google Name');
    expect(screen.getByLabelText('Time zone')).toHaveValue(
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    );

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('lets the user skip the optional password', async () => {
    const onComplete = vi.fn().mockResolvedValue(null);
    render(<Onboarding user={{ ...user, timeZone: 'Asia/Ho_Chi_Minh' }} onComplete={onComplete} />);

    await reachPasswordStep();
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        name: 'Google Name',
        timeZone: 'Asia/Ho_Chi_Minh',
      });
    });
  });

  it('validates and submits an optional backup password', async () => {
    const onComplete = vi.fn().mockResolvedValue(null);
    render(<Onboarding user={{ ...user, timeZone: 'Asia/Ho_Chi_Minh' }} onComplete={onComplete} />);
    await reachPasswordStep();

    await userEvent.type(screen.getByLabelText('New password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'different123');
    await userEvent.click(screen.getByRole('button', { name: 'Create password and start' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Confirm Password'));
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Create password and start' }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        name: 'Google Name',
        timeZone: 'Asia/Ho_Chi_Minh',
        password: 'password123',
      });
    });
  });

  it('keeps the final step open when setup fails', async () => {
    const onComplete = vi.fn().mockResolvedValue('Onboarding failed');
    render(<Onboarding user={{ ...user, timeZone: 'Asia/Ho_Chi_Minh' }} onComplete={onComplete} />);
    await reachPasswordStep();
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't finish setup. Check your connection and try again.",
    );
    expect(screen.getByRole('heading', { name: 'Add a backup way to sign in' })).toBeInTheDocument();
  });
});
