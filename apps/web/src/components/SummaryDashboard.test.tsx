import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import type { Project, Task } from '@mindoist/shared/types';
import { SummaryDashboard } from './SummaryDashboard';

const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  userId: 'u1',
  projectId: null,
  projectColumnId: null,
  sectionId: null,
  parentId: null,
  title: `Task ${id}`,
  description: null,
  color: null,
  priority: 4,
  dueDate: null,
  dueTime: null,
  startDate: null,
  durationMin: null,
  rrule: null,
  pomodoroCount: 0,
  completedAt: null,
  sortOrder: 0,
  createdAt: '2026-07-20T08:00:00Z',
  updatedAt: '2026-07-20T08:00:00Z',
  deletedAt: null,
  recurrenceBasis: null, recurringResetMode: null, tagIds: [],
  ...overrides,
});

const projects: Project[] = [{
  id: 'p1',
  userId: 'u1',
  parentId: null,
  name: 'Launch',
  color: null,
  type: 'CUSTOM',
  isArchived: false,
  calendarSyncEnabled: false,
  sortOrder: 0,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  deletedAt: null,
  areaId: null,
}];

describe('SummaryDashboard', () => {
  const onRetry = vi.fn();
  const tasks = [
    makeTask('1', { projectId: 'p1', priority: 1, dueDate: '2026-07-19' }),
    makeTask('2', { projectId: 'p1', priority: 2, completedAt: '2026-07-20T09:00:00Z' }),
    makeTask('3', { priority: 3, completedAt: '2026-07-19T09:00:00Z' }),
    makeTask('4', { priority: 4 }),
  ];

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T20:00:00'));
  });

  afterEach(() => vi.useRealTimers());

  const renderDashboard = (overrides: Partial<React.ComponentProps<typeof SummaryDashboard>> = {}) => render(
    <I18nextProvider i18n={i18n}>
      <SummaryDashboard
        tasks={tasks}
        projects={projects}
        loading={false}
        error={null}
        onRetry={onRetry}
        {...overrides}
      />
    </I18nextProvider>,
  );

  it('shows a Summary dashboard with period controls, trend, priority, project, and calendar panels', () => {
    renderDashboard();
    expect(screen.getByTestId('summary-dashboard').querySelector('#summary-title')).toBeInTheDocument();
    expect(screen.getByTestId('summary-total')).toBeInTheDocument();
    expect(screen.getByTestId('summary-open')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-completed')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-range-week')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('summary-range-month')).toBeInTheDocument();
    expect(screen.getByTestId('summary-range-year')).toBeInTheDocument();
    expect(screen.getByText('Completion trend')).toBeInTheDocument();
    expect(screen.getByText('Calendar overview')).toBeInTheDocument();
  });

  it('filters period metrics by project and can switch to year view', () => {
    renderDashboard();
    fireEvent.change(screen.getByTestId('summary-project-filter'), { target: { value: 'p1' } });
    expect(screen.getByTestId('summary-total')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-open')).toHaveTextContent('0');
    expect(screen.getByTestId('summary-completed')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('summary-range-year'));
    expect(screen.getByTestId('summary-range-year')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders loading, empty and recoverable error states', () => {
    const { rerender } = renderDashboard({ loading: true });
    expect(screen.getByTestId('summary-loading')).toBeInTheDocument();

    rerender(
      <I18nextProvider i18n={i18n}>
        <SummaryDashboard tasks={[]} projects={[]} loading={false} error={null} onRetry={onRetry} />
      </I18nextProvider>,
    );
    expect(screen.getByTestId('summary-empty')).toBeInTheDocument();

    rerender(
      <I18nextProvider i18n={i18n}>
        <SummaryDashboard tasks={[]} projects={[]} loading={false} error="Network error" onRetry={onRetry} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
