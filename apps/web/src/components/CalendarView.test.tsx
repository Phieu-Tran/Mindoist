import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { forwardRef } from 'react';
import i18n from 'i18next';
import { CalendarView } from './CalendarView';
import type { Task } from '@mindoist/shared/types';

vi.mock('@fullcalendar/react', () => ({
  default: forwardRef(function MockFullCalendar(props: Record<string, unknown>, _ref: React.Ref<unknown>) {
    const events = (props.events as Array<{
      id: string;
      title: string;
      start: string;
      end?: string;
      allDay: boolean;
      editable?: boolean;
      color?: string;
      classNames?: string[];
      extendedProps?: Record<string, unknown>;
    }>) || [];
    const eventDidMount = props.eventDidMount as ((info: {
      el: HTMLElement;
      event: { extendedProps: Record<string, unknown> };
    }) => void) | undefined;
    const select = props.select as ((info: {
      start: Date;
      end: Date;
      allDay: boolean;
    }) => void) | undefined;
    return (
      <div
        data-testid="fullcalendar"
        data-view={props.initialView}
        data-slot-duration={props.slotDuration}
        data-snap-duration={props.snapDuration}
      >
        <button
          type="button"
          data-testid="select-timed-range"
          onClick={() => select?.({
            start: new Date('2026-07-20T15:00:00'),
            end: new Date('2026-07-20T17:00:00'),
            allDay: false,
          })}
        >
          Select range
        </button>
        {events.map(ev => (
          <div
            key={ev.id}
            ref={element => {
              if (!element || !eventDidMount || element.dataset.mounted) return;
              element.dataset.mounted = 'true';
              eventDidMount({ el: element, event: { extendedProps: ev.extendedProps || {} } });
            }}
            data-testid={`fc-event-${ev.id}`}
            data-color={ev.color}
            data-class-names={ev.classNames?.join(' ')}
            data-end={ev.end}
            data-editable={String(ev.editable)}
            data-source={String(ev.extendedProps?.source ?? '')}
            data-read-only={String(ev.extendedProps?.readOnly ?? false)}
          >
            {ev.title} — {ev.start} {ev.allDay ? '(all day)' : ''}
          </div>
        ))}
      </div>
    );
  }),
}));

vi.mock('@fullcalendar/daygrid', () => ({ default: 'daygrid' }));
vi.mock('@fullcalendar/timegrid', () => ({ default: 'timegrid' }));
vi.mock('@fullcalendar/interaction', () => ({ default: 'interaction' }));

const makeTask = (id: string, title: string, overrides: Partial<Task> = {}): Task => ({
  id, userId: 'u1', projectId: null, projectColumnId: null, sectionId: null, parentId: null,
  title, description: null, color: null, priority: 0, dueDate: null, dueTime: null,
  startDate: null, durationMin: null, rrule: null, pomodoroCount: 0, completedAt: null, sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null,
  recurrenceBasis: null, recurringResetMode: null, tagIds: [],
  ...overrides,
});

describe('CalendarView', () => {
  let onSelectTask: ReturnType<typeof vi.fn>;
  let onCreateTask: ReturnType<typeof vi.fn>;
  let onUpdateTask: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.removeItem('mindoist:calendar:view');
    onSelectTask = vi.fn();
    onCreateTask = vi.fn();
    onUpdateTask = vi.fn();
  });

  const renderCalendar = (
    tasks: Task[] = [],
    gcalEvents: Array<{ id: string; title: string; start: string; end: string }> = [],
    extra: { todayTasks?: Task[]; workHoursPerDay?: number } = {},
  ) =>
    render(
      <I18nextProvider i18n={i18n}>
        <CalendarView
          tasks={tasks}
          gcalEvents={gcalEvents}
          todayTasks={extra.todayTasks}
          workHoursPerDay={extra.workHoursPerDay}
          onSelectTask={onSelectTask}
          onCreateTask={onCreateTask}
          onUpdateTask={onUpdateTask}
        />
      </I18nextProvider>
    );

  it('renders FullCalendar', () => {
    renderCalendar([]);
    expect(screen.getByTestId('fullcalendar')).toBeTruthy();
  });

  it('passes initialView as dayGridMonth', () => {
    renderCalendar([]);
    expect(screen.getByTestId('fullcalendar')).toHaveAttribute('data-view', 'dayGridMonth');
  });

  it('restores the last timeline view and configures precise time slots', () => {
    localStorage.setItem('mindoist:calendar:view', 'timeGridWeek');
    renderCalendar([]);
    expect(screen.getByTestId('fullcalendar')).toHaveAttribute('data-view', 'timeGridWeek');
    expect(screen.getByTestId('fullcalendar')).toHaveAttribute('data-slot-duration', '00:30:00');
    expect(screen.getByTestId('fullcalendar')).toHaveAttribute('data-snap-duration', '00:15:00');
  });

  it('maps tasks with dueDate to events', () => {
    const tasks = [
      makeTask('t1', 'Morning standup', { dueDate: '2026-07-20', dueTime: '09:00', priority: 1 }),
      makeTask('t2', 'Submit report', { dueDate: '2026-07-21', priority: 3 }),
    ];
    renderCalendar(tasks);
    expect(screen.getByTestId('fc-event-task-t1')).toBeTruthy();
    expect(screen.getByTestId('fc-event-task-t2')).toBeTruthy();
    expect(screen.getByTestId('fc-event-task-t1')).toHaveAttribute('data-color', 'var(--color-p1)');
    expect(screen.getByTestId('fc-event-task-t2')).toHaveAttribute('data-color', 'var(--color-p3)');
    expect(screen.getByTestId('fc-event-task-t1')).toHaveAttribute('data-class-names', 'calendar-task-event calendar-priority-event-p1 task-color-none');
    expect(screen.getByTestId('fc-event-task-t2')).toHaveAttribute('data-class-names', 'calendar-task-event calendar-priority-event-p3 task-color-none');
  });

  it('uses a neutral calendar color for tasks without a valid priority', () => {
    renderCalendar([
      makeTask('t1', 'No priority', { dueDate: '2026-07-20', priority: 0 }),
    ]);
    expect(screen.getByTestId('fc-event-task-t1')).toHaveAttribute('data-color', 'var(--muted-foreground)');
    expect(screen.getByTestId('fc-event-task-t1')).toHaveAttribute('data-class-names', 'calendar-task-event calendar-priority-event-none task-color-none');
  });

  it('lets a custom task color override priority color on the calendar', () => {
    renderCalendar([
      makeTask('t1', 'Colored task', { dueDate: '2026-07-20', priority: 1, color: 'sky' }),
    ]);
    expect(screen.getByTestId('fc-event-task-t1')).toHaveAttribute('data-color', 'var(--task-color-accent)');
    expect(screen.getByTestId('fc-event-task-t1')).toHaveAttribute('data-class-names', 'calendar-task-event task-color-sky');
  });

  it('renders a date-range task with no due time as an all-day spanning bar', () => {
    renderCalendar([
      makeTask('t1', 'Multi-day project', { dueDate: '2026-07-25', startDate: '2026-07-20' }),
    ]);
    const el = screen.getByTestId('fc-event-task-range-t1');
    expect(el).toHaveTextContent('(all day)');
    expect(el).toHaveAttribute('data-end', '2026-07-26');
    expect(el).toHaveAttribute(
      'data-class-names',
      'calendar-task-range-event task-color-none calendar-priority-marker-none',
    );
    expect(screen.queryByTestId('fc-event-task-t1')).toBeNull();
  });

  it('keeps the continuous range and a separate timed deadline moment', () => {
    renderCalendar([
      makeTask('t1', 'Ranged task with a deadline moment', {
        dueDate: '2026-07-25', startDate: '2026-07-20', dueTime: '11:30',
      }),
    ]);
    const range = screen.getByTestId('fc-event-task-range-t1');
    expect(range).toHaveTextContent('(all day)');
    expect(range).toHaveAttribute('data-end', '2026-07-26');

    const deadline = screen.getByTestId('fc-event-task-t1');
    expect(deadline).not.toHaveTextContent('(all day)');
    expect(deadline).toHaveTextContent('2026-07-25T11:30:00');
  });

  it('dims a completed task instead of hiding it, so a day\'s history stays visible', () => {
    renderCalendar([
      makeTask('t1', 'Done already', { dueDate: '2026-07-20', priority: 2, completedAt: '2026-07-20T10:00:00Z' }),
    ]);
    expect(screen.getByTestId('fc-event-task-t1')).toBeTruthy();
    expect(screen.getByTestId('fc-event-task-t1')).toHaveAttribute(
      'data-class-names',
      'calendar-task-event calendar-priority-event-p2 task-color-none calendar-task-event-completed',
    );
  });

  it('renders a complete priority legend', () => {
    renderCalendar();
    expect(screen.getByTestId('calendar-legend-p1')).toHaveTextContent('P1 Urgent');
    expect(screen.getByTestId('calendar-legend-p2')).toHaveTextContent('P2 High');
    expect(screen.getByTestId('calendar-legend-p3')).toHaveTextContent('P3 Medium');
    expect(screen.getByTestId('calendar-legend-p4')).toHaveTextContent('P4 Low');
  });

  it('adds an accessible hover and keyboard tooltip to task events', () => {
    renderCalendar([
      makeTask('t1', 'Ship release', { dueDate: '2026-07-20T00:00:00.000Z', dueTime: '14:30', priority: 1 }),
    ]);
    const event = screen.getByTestId('fc-event-task-t1');
    const label = 'Ship release · P1 · 2026-07-20 · 14:30';
    expect(event).toHaveAttribute('aria-label', label);
    expect(event).toHaveAttribute('title', label);
    expect(event).toHaveAttribute('tabindex', '0');
    expect(event.querySelector('[role="tooltip"]')).toHaveTextContent(label);
  });

  it('excludes tasks without dueDate', () => {
    const tasks = [
      makeTask('t1', 'No date task', { dueDate: null }),
      makeTask('t2', 'Has date task', { dueDate: '2026-07-20' }),
    ];
    renderCalendar(tasks);
    expect(screen.queryByTestId('fc-event-task-t1')).toBeNull();
    expect(screen.getByTestId('fc-event-task-t2')).toBeTruthy();
  });

  it('renders timed event for task with dueTime', () => {
    const tasks = [makeTask('t1', 'Timed task', { dueDate: '2026-07-20', dueTime: '14:30' })];
    renderCalendar(tasks);
    const el = screen.getByTestId('fc-event-task-t1');
    expect(el.textContent).toContain('T14:30');
    expect(el.textContent).not.toContain('all day');
  });

  it('uses task duration to size a timed event', () => {
    renderCalendar([makeTask('t1', 'Deep work', {
      dueDate: '2026-07-20',
      dueTime: '14:30',
      durationMin: 90,
    })]);
    const event = screen.getByTestId('fc-event-task-t1');
    expect(event).toHaveTextContent('2026-07-20T13:00:00');
    expect(event).toHaveAttribute('data-end', '2026-07-20T14:30:00');
  });

  it('passes the full selected time range to task creation', () => {
    renderCalendar([]);
    fireEvent.click(screen.getByTestId('select-timed-range'));

    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-07-20',
      endDate: '2026-07-20',
      startTime: '15:00',
      endTime: '17:00',
      allDay: false,
    }));
  });

  it('renders all-day event for task without dueTime', () => {
    const tasks = [makeTask('t1', 'All day task', { dueDate: '2026-07-20', dueTime: null })];
    renderCalendar(tasks);
    const el = screen.getByTestId('fc-event-task-t1');
    expect(el.textContent).toContain('all day');
  });

  it('renders multiple events', () => {
    const tasks = [
      makeTask('t1', 'Task 1', { dueDate: '2026-07-20' }),
      makeTask('t2', 'Task 2', { dueDate: '2026-07-21' }),
      makeTask('t3', 'Task 3', { dueDate: '2026-07-22' }),
    ];
    renderCalendar(tasks);
    expect(screen.getByTestId('fc-event-task-t1')).toBeTruthy();
    expect(screen.getByTestId('fc-event-task-t2')).toBeTruthy();
    expect(screen.getByTestId('fc-event-task-t3')).toBeTruthy();
  });

  it('renders GCal events alongside task events', () => {
    const tasks = [makeTask('t1', 'Task 1', { dueDate: '2026-07-20' })];
    const gcalEvents = [{ id: 'g1', title: 'Team standup', start: '2026-07-20T09:00:00', end: '2026-07-20T09:30:00' }];
    renderCalendar(tasks, gcalEvents);
    expect(screen.getByTestId('fc-event-task-t1')).toBeTruthy();
    expect(screen.getByTestId('fc-event-gcal-g1')).toHaveAttribute('data-editable', 'false');
    expect(screen.getByTestId('fc-event-gcal-g1')).toHaveAttribute('data-source', 'google');
    expect(screen.getByTestId('fc-event-gcal-g1')).toHaveAttribute('data-read-only', 'true');
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
  });

  describe('B2.17 planning progress bar (Today panel)', () => {
    beforeEach(() => {
      window.history.pushState({}, '', '?plan=1');
    });

    it('uses the workHoursPerDay setting instead of a hardcoded 8h total', () => {
      const todayTasks = [makeTask('t1', 'Deep work', { durationMin: 180 })];
      renderCalendar([], [], { todayTasks, workHoursPerDay: 6 });
      // 180min planned / (6h * 60) = 50%
      expect(screen.getByText(/3:00 \/ 6h \(50%\)/)).toBeInTheDocument();
    });

    it('defaults to an 8h day when no setting is provided', () => {
      const todayTasks = [makeTask('t1', 'Deep work', { durationMin: 240 })];
      renderCalendar([], [], { todayTasks });
      // 240min / (8h * 60) = 50%
      expect(screen.getByText(/4:00 \/ 8h \(50%\)/)).toBeInTheDocument();
    });

    it('shows unfinished overdue tasks below Today', () => {
      renderCalendar([
        makeTask('overdue', 'Renew certificate', { dueDate: '2000-07-29' }),
        makeTask('completed', 'Already handled', {
          dueDate: '2000-07-28',
          completedAt: '2000-07-28T10:00:00Z',
        }),
        makeTask('future', 'Next release', { dueDate: '2999-07-31' }),
      ]);

      const overdueSection = screen.getByTestId('calendar-overdue-section');
      expect(within(overdueSection).getByText('Overdue')).toBeInTheDocument();
      expect(within(overdueSection).getByText('Renew certificate')).toBeInTheDocument();
      expect(within(overdueSection).getByText('29/07')).toBeInTheDocument();
      expect(within(overdueSection).queryByText('Already handled')).not.toBeInTheDocument();
      expect(within(overdueSection).queryByText('Next release')).not.toBeInTheDocument();
    });
  });
});
