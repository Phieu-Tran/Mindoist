import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CalendarGridView } from './CalendarGridView';

describe('CalendarGridView', () => {
  it('renders a Monday-Friday working week', () => {
    render(
      <CalendarGridView
        anchorDate={new Date('2026-08-16T12:00:00Z')}
        projection={null}
        tasks={[]}
        onSelectTask={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('gridcell')).toHaveLength(5);
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Fri')).toBeTruthy();
  });

  it.each([
    ['timeGridDay', 1],
    ['timeGrid3Day', 3],
    ['timeGridWeek', 7],
  ] as const)('renders %s with %i day columns', (view, expectedDays) => {
    const { unmount } = render(
      <CalendarGridView
        anchorDate={new Date('2026-08-12T12:00:00Z')}
        projection={null}
        tasks={[]}
        view={view}
        onSelectTask={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('gridcell')).toHaveLength(expectedDays);
    unmount();
  });

  it('creates an inline scheduled task with project inheritance or an explicit flat color', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarGridView
        anchorDate={new Date('2026-08-12T12:00:00Z')}
        projection={null}
        tasks={[]}
        projects={[{ id: 'project-jade', name: 'Jade launch', color: 'jade' }]}
        view="timeGridDay"
        onSelectTask={vi.fn()}
        onCreateTask={onCreateTask}
      />,
    );

    fireEvent.keyDown(screen.getByRole('gridcell'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Plan launch' } });
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'project-jade' } });

    const form = screen.getByRole('form', { name: 'Create scheduled task' });
    expect(form.getAttribute('style')).toContain('--calendar-draft-identity-color: var(--color-project-jade)');
    expect(screen.getByRole('group', { name: 'Task color' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rose' }));
    expect(form.getAttribute('style')).toContain('--calendar-draft-identity-color: var(--color-project-rose)');
    fireEvent.click(screen.getByRole('button', { name: 'Create scheduled task' }));

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Plan launch',
      projectId: 'project-jade',
      color: 'rose',
      allDay: false,
    })));
  });
});
