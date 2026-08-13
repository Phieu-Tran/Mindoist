import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { TaskInspector } from './TaskDetail';
import type { Task } from '@mindoist/shared/types';
import { canonicalTaskOverrides, type LegacyTaskOverrides } from '../test/task-fixture';

const makeTask = (id: string, overrides: LegacyTaskOverrides = {}): Task => ({
  id, userId: 'u1', projectId: null, projectColumnId: null, sectionId: null, parentId: null,
  title: 'Test Task', description: null, color: null, priority: 0, deadline: null,
  startDate: null, estimateMin: null, rrule: null, pomodoroCount: 0, completedAt: null, sortOrder: 0,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null,
  recurrenceBasis: null, recurringResetMode: null, tagIds: [],
  ...canonicalTaskOverrides(overrides),
});

describe('TaskInspector', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;
  let onDelete: ReturnType<typeof vi.fn>;
  let onCompletePomodoro: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onSave = vi.fn().mockResolvedValue(undefined);
    onClose = vi.fn();
    onDelete = vi.fn();
    onCompletePomodoro = vi.fn().mockImplementation(async () => makeTask('1', { pomodoroCount: 1 }));
  });

  const renderInspector = (task?: LegacyTaskOverrides) =>
    render(
      <I18nextProvider i18n={i18n}>
        <TaskInspector
          task={makeTask('1', task)}
          projects={[{ id: 'p1', name: 'Personal' }]}
          tags={[{ id: 't1', userId: 'u1', name: 'urgent', color: null, createdAt: '', updatedAt: '', deletedAt: null }]}
          onSave={onSave}
          onCompletePomodoro={onCompletePomodoro}
          onClose={onClose}
          onDelete={onDelete}
        />
      </I18nextProvider>
    );

  it('renders task detail panel', () => {
    renderInspector();
    expect(screen.getByTestId('task-detail')).toBeInTheDocument();
  });

  it('keeps an empty description compact and expands it as content grows', () => {
    renderInspector();
    const description = screen.getByTestId('detail-description');
    expect(description).toHaveAttribute('placeholder');
    expect(description.getAttribute('placeholder')).not.toBe('');
    expect(description.className).toContain('min-h-12');
    expect(description.className).toContain('[field-sizing:content]');
  });

  it('wraps a long title in an auto-growing textarea instead of clipping horizontally', () => {
    renderInspector({ title: 'Implement Task CRUD API with a deliberately long title that needs wrapping' });
    const title = screen.getByTestId('detail-title');
    expect(title.tagName).toBe('TEXTAREA');
    expect(title).toHaveAttribute('rows', '1');
    expect(title.className).toContain('[field-sizing:content]');
  });

  it('renders the task Pomodoro timer with its persisted count once expanded', () => {
    renderInspector({ pomodoroCount: 3 });
    expect(screen.queryByTestId('pomodoro-timer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pomodoro-toggle'));
    expect(screen.getByTestId('pomodoro-timer')).toBeInTheDocument();
    expect(screen.getByText('3 sessions')).toBeInTheDocument();
  });

  it('displays task title in input', () => {
    renderInspector({ title: 'My Task' });
    expect(screen.getByTestId('detail-title')).toHaveValue('My Task');
  });

  it('completes the task from the checkbox next to the title (no subtasks, no confirm needed)', async () => {
    localStorage.setItem('token', 'test-token');
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (/\/tasks\/1\/(subtasks|checklist-items|reminders)$/.test(url)) {
        return Promise.resolve({ json: async () => ({ success: true, data: [] }) });
      }
      if (url === '/tasks/1/complete') {
        return Promise.resolve({ json: async () => ({ success: true, data: makeTask('1', { completedAt: '2026-07-28T00:00:00Z' }) }) });
      }
      return Promise.resolve({ json: async () => ({ success: false }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInspector({ title: 'My Task' });
    const checkbox = screen.getByTestId('detail-title-complete');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(checkbox);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/tasks/1/complete', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    localStorage.removeItem('token');
    vi.unstubAllGlobals();
  });

  it('displays task description', () => {
    renderInspector({ description: 'Some notes' });
    expect(screen.getByTestId('detail-description')).toHaveValue('Some notes');
  });

  it('D4: title, then description, then the properties row (color/dates)', () => {
    renderInspector({ description: 'Some notes' });
    const title = screen.getByTestId('detail-title');
    const description = screen.getByTestId('detail-description');
    const color = screen.getByTestId('detail-color');
    const startDate = screen.getByTestId('detail-start-date-v2');
    expect(title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(description.compareDocumentPosition(color) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(color.compareDocumentPosition(startDate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('displays due date', () => {
    renderInspector({ dueDate: '2026-07-25T00:00:00.000Z' });
    const date = screen.getByTestId('detail-deadline-v2');
    expect(date).toHaveTextContent('25/07/2026');
    expect(date.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('displays due time', () => {
    renderInspector({ deadline: { date: '2026-07-25', time: '09:00' } });
    expect(screen.getByTestId('detail-deadline-time-v2')).toHaveTextContent('09:00');
  });

  it('displays start date when set', () => {
    renderInspector({ startDate: '2026-07-20T00:00:00.000Z', dueDate: '2026-07-25T00:00:00.000Z' });
    expect(screen.getByTestId('detail-start-date-v2')).toHaveTextContent('20/07/2026');
    expect(screen.getByTestId('detail-deadline-v2')).toHaveTextContent('20/07/2026');
    expect(screen.getByTestId('detail-deadline-v2')).toHaveTextContent('25/07/2026');
    expect(screen.getByTestId('detail-deadline-v2').querySelector('span[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByTestId('detail-deadline-v2-today')).not.toBeInTheDocument();
  });

  it('shows one date without a range arrow when only the start date is set', () => {
    renderInspector({ startDate: '2026-07-20T00:00:00.000Z', dueDate: null });
    const date = screen.getByTestId('detail-deadline-v2');
    expect(date).toHaveTextContent('20/07/2026');
    expect(date.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('updates due date immediately when a day is picked (no blur/Enter needed)', () => {
    renderInspector({ dueDate: '2026-07-25T00:00:00.000Z' });
    fireEvent.click(screen.getByTestId('detail-deadline-v2'));
    fireEvent.click(screen.getByRole('button', { name: '15' }));
    expect(screen.getByTestId('detail-deadline-v2')).toHaveTextContent('15/07/2026');
    expect(screen.queryByRole('dialog', { name: 'Pick date' })).not.toBeInTheDocument();
  });

  it('keeps the common due-date flow simple and reveals range selection on demand', () => {
    renderInspector({ dueDate: '2026-07-25T00:00:00.000Z', startDate: null });
    fireEvent.click(screen.getByTestId('detail-deadline-v2'));

    expect(screen.getByTestId('date-range-add-start')).toBeInTheDocument();
    expect(screen.queryByTestId('date-range-start-tab')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('date-range-add-start'));
    expect(screen.getByTestId('date-range-start-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '15' }));
    expect(screen.getByRole('dialog', { name: 'Pick date' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '16' }));

    const date = screen.getByTestId('detail-deadline-v2');
    expect(date).toHaveTextContent('15/07/2026');
    expect(date).toHaveTextContent('16/07/2026');
    expect(screen.queryByRole('dialog', { name: 'Pick date' })).not.toBeInTheDocument();
  });

  it('includes startDate in the save payload', () => {
    renderInspector({ title: 'Ranged', dueDate: '2026-07-25T00:00:00.000Z', startDate: '2026-07-20T00:00:00.000Z' });
    fireEvent.click(screen.getByTestId('detail-save'));
    expect(onSave).toHaveBeenCalledWith('1', expect.objectContaining({
      startDate: '2026-07-20',
      deadline: { date: '2026-07-25' },
    }));
  });

  it('displays priority', () => {
    renderInspector({ priority: 3 });
    expect(screen.getByTestId('detail-priority')).toHaveTextContent('P3');
  });

  it('maps the highest priority to P1 without changing its API value', () => {
    renderInspector({ priority: 1 });
    const priority = screen.getByTestId('detail-priority');
    expect(priority).toHaveTextContent('P1');
  });

  it('displays project', () => {
    renderInspector({ projectId: 'p1' });
    expect(screen.getByTestId('detail-project')).toHaveTextContent('Personal');
  });

  it('saves a selected task color', async () => {
    renderInspector({ color: null });
    fireEvent.click(screen.getByTestId('detail-color'));
    fireEvent.click(screen.getByTestId('detail-color-sky'));
    expect(screen.getByTestId('detail-color-dot')).toHaveClass('task-color-sky');
    fireEvent.click(screen.getByTestId('detail-save'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('1', expect.objectContaining({ color: 'sky' }));
    });
  });

  it('assigns a tag from the picker and saves it', async () => {
    renderInspector({ tagIds: [] });
    fireEvent.click(screen.getByTestId('detail-tags'));
    fireEvent.click(screen.getByTestId('detail-tag-t1'));
    fireEvent.click(screen.getByTestId('detail-save'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('1', expect.objectContaining({ tagIds: ['t1'] }));
    });
  });

  it('shows the selected tag name in the compact trigger', () => {
    renderInspector({ tagIds: ['t1'] });
    expect(screen.getByTestId('detail-tags')).toHaveTextContent('urgent');
  });

  it('removes an already-assigned tag when clicked again', async () => {
    renderInspector({ tagIds: ['t1'] });
    fireEvent.click(screen.getByTestId('detail-tags'));
    fireEvent.click(screen.getByTestId('detail-tag-t1'));
    fireEvent.click(screen.getByTestId('detail-save'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('1', expect.objectContaining({ tagIds: [] }));
    });
  });

  it('keeps one clear Save action instead of duplicating it in the header', () => {
    renderInspector({ title: 'Original' });
    const titleInput = screen.getByTestId('detail-title');
    fireEvent.change(titleInput, { target: { value: 'Updated once' } });

    const saveElements = document.querySelectorAll('[data-testid*="save"]');
    expect(saveElements).toHaveLength(1);
    expect(screen.queryByTestId('detail-save-header')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('detail-save'));

    expect(onSave).toHaveBeenCalledWith('1', expect.objectContaining({ title: 'Updated once' }));
  });

  it('calls onSave with PATCH payload on submit', async () => {
    renderInspector({ title: 'Original', dueDate: '2026-07-20' });
    const titleInput = screen.getByTestId('detail-title');
    fireEvent.change(titleInput, { target: { value: 'Updated' } });
    fireEvent.click(screen.getByTestId('detail-save'));
    expect(onSave).toHaveBeenCalledWith('1', expect.objectContaining({ title: 'Updated' }));
  });

  it('shows repeat badge when rrule is set', () => {
    renderInspector({ rrule: 'FREQ=DAILY' });
    expect(screen.getByTestId('detail-repeat-badge')).toBeInTheDocument();
  });

  it('selecting "Custom RRULE" reveals a text input, and saving sends the typed RRULE', () => {
    renderInspector();
    const recurrenceTrigger = screen.getByTestId('detail-recurrence-select');
    expect(screen.queryByTestId('detail-custom-rrule')).not.toBeInTheDocument();

    fireEvent.click(recurrenceTrigger);
    fireEvent.click(screen.getByRole('option', { name: /Custom RRULE/i }));
    const rruleInput = screen.getByTestId('detail-custom-rrule');
    fireEvent.change(rruleInput, { target: { value: 'FREQ=DAILY;INTERVAL=3' } });
    fireEvent.click(screen.getByTestId('detail-save'));

    expect(onSave).toHaveBeenCalledWith('1', expect.objectContaining({ rrule: 'FREQ=DAILY;INTERVAL=3' }));
  });

  it('loading a task with an unrecognized RRULE selects "Custom" and pre-fills the raw text', () => {
    renderInspector({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=15' });
    expect(screen.getByTestId('detail-recurrence-select')).toHaveAttribute('data-value', 'custom');
    expect(screen.getByTestId('detail-custom-rrule')).toHaveValue('FREQ=MONTHLY;BYMONTHDAY=15');
  });

  it('calls onDelete when delete confirm is clicked', () => {
    renderInspector();
    fireEvent.click(screen.getByLabelText(/More actions|detail\.moreActions/));
    fireEvent.click(screen.getByLabelText('Delete'));
    fireEvent.click(screen.getByTestId('detail-delete-confirm'));
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('cancel delete does not call onDelete', () => {
    renderInspector();
    fireEvent.click(screen.getByLabelText(/More actions|detail\.moreActions/));
    fireEvent.click(screen.getByLabelText('Delete'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('labels the delete dialog, traps focus, closes with Escape, and restores the trigger', async () => {
    renderInspector();
    fireEvent.click(screen.getByLabelText(/More actions|detail\.moreActions/));
    const trigger = screen.getByLabelText('Delete');
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-describedby', 'delete-confirm-description');
    const buttons = dialog.querySelectorAll('button');
    await waitFor(() => expect(buttons[0]).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog', { name: 'Delete' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  describe('sub-tasks', () => {
    const stubFetch = (subtasks: Task[]) => {
      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (/\/tasks\/([^/]+)\/subtasks$/.test(url) && method === 'GET') {
          const parentId = url.split('/')[2];
          return { json: async () => ({ success: true, data: subtasks.filter(s => s.parentId === parentId) }) };
        }
        if (/\/tasks\/[^/]+\/checklist-items$/.test(url) && method === 'GET') {
          return { json: async () => ({ success: true, data: [] }) };
        }
        if (/\/tasks\/[^/]+\/complete$/.test(url)) {
          const id = url.split('/')[2];
          const st = subtasks.find(s => s.id === id)!;
          return { json: async () => ({ success: true, data: { ...st, completedAt: '2026-07-21T00:00:00Z' } }) };
        }
        if (/\/tasks$/.test(url) && method === 'POST') {
          const payload = JSON.parse(String(init?.body));
          return { json: async () => ({ success: true, data: makeTask('new-sub', { title: payload.title, parentId: payload.parentId }) }) };
        }
        return { json: async () => ({ success: false }) };
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    };

    beforeEach(() => {
      localStorage.setItem('token', 'test-token');
    });

    afterEach(() => {
      localStorage.removeItem('token');
      vi.unstubAllGlobals();
    });

    it('lists only subtasks of the open task', async () => {
      stubFetch([
        makeTask('s1', { parentId: '1', title: 'Child A' }),
        makeTask('s2', { parentId: 'other', title: 'Other child' }),
      ]);
      renderInspector();
      expect(await screen.findByTestId('subtask-s1')).toBeInTheDocument();
      expect(screen.queryByTestId('subtask-s2')).not.toBeInTheDocument();
      expect(screen.getByTestId('subtask-title-s1')).toHaveTextContent('Child A');
    });

    it('adds a subtask with parentId of the open task on Enter', async () => {
      const fetchMock = stubFetch([]);
      renderInspector();
      // let the initial subtask load settle before interacting, like a real user would
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise(r => setTimeout(r, 0));
      const input = screen.getByTestId('subtask-input');
      fireEvent.change(input, { target: { value: 'New child' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(await screen.findByTestId('subtask-new-sub')).toBeInTheDocument();
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(JSON.parse(String(postCall![1].body))).toEqual({ title: 'New child', parentId: '1' });
      expect(input).toHaveValue('');
    });

    it('completes a subtask from its checkbox', async () => {
      const fetchMock = stubFetch([makeTask('s1', { parentId: '1', title: 'Child A' })]);
      renderInspector();
      await screen.findByTestId('subtask-s1');
      fireEvent.click(screen.getByTestId('subtask-toggle-s1'));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/tasks/s1/complete', expect.objectContaining({ method: 'POST' }));
      });
      await waitFor(() => {
        expect(screen.getByTestId('subtask-title-s1')).toHaveClass('line-through');
      });
    });

    it('clicking a subtask title opens it via onSelectTask', async () => {
      const onSelectTask = vi.fn();
      stubFetch([makeTask('s1', { parentId: '1', title: 'Child A' })]);
      render(
        <I18nextProvider i18n={i18n}>
          <TaskInspector
            task={makeTask('1')}
            projects={[]}
            tags={[]}
            onSave={onSave}
            onCompletePomodoro={onCompletePomodoro}
            onClose={onClose}
            onDelete={onDelete}
            onSelectTask={onSelectTask}
          />
        </I18nextProvider>
      );
      fireEvent.doubleClick(await screen.findByTestId('subtask-title-s1'));
      expect(onSelectTask).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    });
  });

  describe('complete-parent confirm dialog (B2.6 focus trap)', () => {
    const stubFetchWithParentComplete = (subtasks: Task[]) => {
      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (/\/tasks\/([^/]+)\/subtasks$/.test(url) && method === 'GET') {
          const parentId = url.split('/')[2];
          return { json: async () => ({ success: true, data: subtasks.filter(s => s.parentId === parentId) }) };
        }
        if (/\/tasks\/[^/]+\/checklist-items$/.test(url) && method === 'GET') {
          return { json: async () => ({ success: true, data: [] }) };
        }
        if (/\/tasks\/1\/complete$/.test(url) && method === 'POST') {
          return { json: async () => ({ success: true, data: makeTask('1', { completedAt: '2026-07-24T00:00:00Z' }) }) };
        }
        return { json: async () => ({ success: false }) };
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    };

    beforeEach(() => {
      localStorage.setItem('token', 'test-token');
    });

    afterEach(() => {
      localStorage.removeItem('token');
      vi.unstubAllGlobals();
    });

    it('opens the confirm dialog, focuses the first control, traps Tab, and restores focus on close', async () => {
      stubFetchWithParentComplete([makeTask('s1', { parentId: '1', title: 'Child A' })]);
      renderInspector();
      await screen.findByTestId('subtask-s1');
      const trigger = screen.getByTestId('detail-complete-parent');
      trigger.focus();
      fireEvent.click(trigger);

      const dialog = await screen.findByRole('alertdialog');
      const buttons = dialog.querySelectorAll('button');
      const cancelButton = buttons[0];
      const confirmButton = screen.getByTestId('detail-complete-confirm');
      expect(confirmButton).toBe(buttons[buttons.length - 1]);
      await waitFor(() => expect(cancelButton).toHaveFocus());

      // Shift+Tab from the first control wraps to the last, not out of the dialog
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(confirmButton).toHaveFocus();

      // Tab from the last control wraps back to the first
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(cancelButton).toHaveFocus();

      // Escape closes without completing, and returns focus to the trigger
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    });

    it('confirming completes the parent task', async () => {
      const fetchMock = stubFetchWithParentComplete([makeTask('s1', { parentId: '1', title: 'Child A' })]);
      renderInspector();
      await screen.findByTestId('subtask-s1');
      fireEvent.click(screen.getByTestId('detail-complete-parent'));
      await screen.findByRole('alertdialog');
      fireEvent.click(screen.getByTestId('detail-complete-confirm'));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/tasks/1/complete', expect.objectContaining({ method: 'POST' }));
      });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});
