import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { GlobalQuickCapture } from './GlobalQuickCapture';

const task = {
  id: 'task-1',
  title: 'Fix nginx proxy',
  description: 'Production routing',
  completedAt: null,
} as any;

describe('GlobalQuickCapture command bar', () => {
  let onAdd: ReturnType<typeof vi.fn>;
  let onNavigate: ReturnType<typeof vi.fn>;
  let onSelectTask: ReturnType<typeof vi.fn>;
  let onCompleteTask: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onAdd = vi.fn();
    onNavigate = vi.fn();
    onSelectTask = vi.fn();
    onCompleteTask = vi.fn();
  });

  const renderCapture = (selectedTask: any = null) => render(
    <I18nextProvider i18n={i18n}>
      <button type="button" data-testid="page-button">Somewhere else</button>
      <GlobalQuickCapture
        onAdd={onAdd}
        tasks={[task]}
        projects={[{ id: 'project-1', name: 'Chailease' } as any]}
        selectedTask={selectedTask}
        onNavigate={onNavigate}
        onSelectTask={onSelectTask}
        onCompleteTask={onCompleteTask}
      />
    </I18nextProvider>
  );

  const open = async () => {
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    return screen.findByTestId('global-quick-capture-input');
  };

  it('stays unmounted until Cmd/Ctrl+K and then focuses the cmdk input', async () => {
    renderCapture();
    expect(screen.queryByTestId('global-quick-capture')).not.toBeInTheDocument();
    const input = await open();
    expect(screen.getByTestId('global-quick-capture')).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('also opens on Cmd+K', () => {
    renderCapture();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByTestId('global-quick-capture')).toBeInTheDocument();
  });

  it('Escape closes the dialog and restores its trigger focus', async () => {
    renderCapture();
    const trigger = screen.getByTestId('page-button');
    trigger.focus();
    const input = await open();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('global-quick-capture')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('creates through the shared parser and closes', async () => {
    renderCapture();
    const input = await open();
    fireEvent.change(input, { target: { value: 'call dentist p1' } });
    fireEvent.click(await screen.findByTestId('global-quick-capture-submit'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'call dentist', priority: 1 })));
    await waitFor(() => expect(screen.queryByTestId('global-quick-capture')).not.toBeInTheDocument());
  });

  it('keeps parsed chips editable before create', async () => {
    renderCapture();
    const input = await open();
    fireEvent.change(input, { target: { value: 'call dentist p1' } });
    const priority = await screen.findByLabelText('Parsed priority');
    fireEvent.change(priority, { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('global-quick-capture-submit'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ priority: 3 })));
  });

  it('keeps quick project and schedule choices while the title is typed', async () => {
    renderCapture();
    const input = await open();

    fireEvent.change(screen.getByLabelText('Parsed project'), { target: { value: 'Chailease' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    fireEvent.change(screen.getByLabelText('Parsed time'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('Parsed priority'), { target: { value: '2' } });
    fireEvent.change(input, { target: { value: 'Prepare weekly review' } });
    fireEvent.click(screen.getByTestId('global-quick-capture-submit'));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Prepare weekly review',
      projectId: 'Chailease',
      priority: 2,
      deadline: expect.objectContaining({ time: '09:30' }),
    })));
  });

  it('uses @ for ranked navigation including projects', async () => {
    renderCapture();
    const input = await open();
    fireEvent.change(input, { target: { value: '@calendar' } });
    fireEvent.click(await screen.findByText('Calendar'));
    expect(onNavigate).toHaveBeenCalledWith('calendar');
    await waitFor(() => expect(screen.queryByTestId('global-quick-capture')).not.toBeInTheDocument());

    const reopened = await open();
    fireEvent.change(reopened, { target: { value: '@project chai' } });
    fireEvent.click(await screen.findByText('Chailease'));
    expect(onNavigate).toHaveBeenCalledWith('projects', 'project-1');
  });

  it('uses ? to search title and description', async () => {
    renderCapture();
    const input = await open();
    fireEvent.change(input, { target: { value: '?nginx' } });
    fireEvent.click(await screen.findByText('Fix nginx proxy'));
    expect(onSelectTask).toHaveBeenCalledWith(task);
  });

  it('uses > for contextual actions on the selected task', async () => {
    renderCapture(task);
    const input = await open();
    fireEvent.change(input, { target: { value: '>complete' } });
    fireEvent.click(await screen.findByText('Complete task'));
    await waitFor(() => expect(onCompleteTask).toHaveBeenCalledWith(task));
  });

  it('does not create an empty task', async () => {
    renderCapture();
    await open();
    expect(screen.getByTestId('global-quick-capture-submit')).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('localizes the empty command center in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    renderCapture();
    const input = await open();
    expect(input).toHaveAttribute('placeholder', 'Nhập task hoặc lệnh…');
    expect(screen.getByText('Bắt đầu nhanh')).toBeInTheDocument();
    expect(screen.getByText('Cứ viết như cách bạn nghĩ')).toBeInTheDocument();
  });
});
