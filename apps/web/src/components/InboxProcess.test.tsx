import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@mindoist/shared/types';
import { InboxProcess } from './InboxProcess';

const task = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  userId: 'user-1',
  title: 'Inbox item',
  description: null,
  completedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
} as Task);

describe('InboxProcess', () => {
  const props = {
    onComplete: vi.fn(async () => {}),
    onDelete: vi.fn(async () => {}),
    onUpdate: vi.fn(async () => {}),
    onSchedule: vi.fn(),
    onClose: vi.fn(),
  };

  it('returns a task to the queue after its snooze expires', () => {
    render(<InboxProcess {...props} tasks={[task({ snoozedUntil: new Date(Date.now() - 1_000).toISOString() })]} />);
    expect(screen.getByRole('heading', { name: 'Inbox item' })).toBeInTheDocument();
  });

  it('keeps a future-snoozed task out of the queue', () => {
    render(<InboxProcess {...props} tasks={[task({ snoozedUntil: new Date(Date.now() + 60_000).toISOString() })]} />);
    expect(screen.getByRole('heading', { name: 'Inbox zero' })).toBeInTheDocument();
  });
});
