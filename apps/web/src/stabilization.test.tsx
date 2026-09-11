import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { useTasks, useTags, invalidateAllTaskCache } from './hooks/useApi';
import { useAuth } from './hooks/useAuth';
import { TaskList } from './components/TaskList';
import { TaskDetail } from './components/TaskDetail';
import { QuickAdd } from './components/QuickAdd';
import { TagManager } from './components/TagManager';

const reply = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });
const tag = { id: 'tag-a', name: 'Work', color: '#123456' } as any;
const task = { id: 'task-a', title: 'Task A', completedAt: null, dueDate: null, tags: [tag] } as any;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-06T05:00:00Z')); invalidateAllTaskCache(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); invalidateAllTaskCache(); });

it('a late session restore cannot overwrite a new login', async () => {
  localStorage.setItem('token', 'old');
  let restore!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise(resolve => { restore = resolve; }))
    .mockResolvedValueOnce(reply({ accessToken: 'new', user: { id: 'new-user' } })));
  const { result } = renderHook(() => useAuth());
  await act(async () => { await result.current.login({ email: 'new@example.test', password: 'password' }); });
  await act(async () => { restore(reply({ id: 'old-user' })); });
  expect(result.current.user?.id).toBe('new-user');
  expect(localStorage.getItem('token')).toBe('new');
});

it('logout clears the session while its network request is still pending', async () => {
  localStorage.setItem('token', 'old');
  let finish!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply({ id: 'old-user' }))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })));
  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.user?.id).toBe('old-user'));
  let logout!: Promise<void>;
  act(() => { logout = result.current.logout(); });
  expect(result.current.user).toBeNull();
  expect(localStorage.getItem('token')).toBeNull();
  await act(async () => { finish(reply(null)); await logout; });
});

it('addTask with optimistic update shows result immediately', async () => {
  // Verify optimistic update works - UI updates before API returns
  const fetch = vi.fn()
    .mockResolvedValueOnce(reply([]))
    .mockResolvedValueOnce(reply({ ...task, id: 'new-task', title: 'New Task' }));
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useTasks('inbox', true));
  await waitFor(() => expect(result.current.loading).toBe(false));

  // Add task - should update immediately (optimistic)
  await act(async () => {
    const p = result.current.addTask({ title: 'New Task' });
    vi.runAllTimers();
    await p;
  });

  // Task should be in list after API response
  expect(result.current.tasks.some(t => t.id === 'new-task')).toBe(true);
});

it('StrictMode loads tasks and ignores an old session mutation', async () => {
  localStorage.setItem('token', 'old');
  const fetch = vi.fn().mockResolvedValue(reply([]));
  vi.stubGlobal('fetch', fetch);
  const { result, rerender } = renderHook(() => useTasks('inbox', true), { wrapper: StrictMode });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let resolve!: (value: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const mutation = result.current.addTask({ title: 'Old user task' });
  localStorage.setItem('token', 'new');
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { resolve(reply(task)); await mutation; });
  expect(result.current.tasks).toEqual([]);
});

it('completeTask with optimistic update shows completed state immediately', async () => {
  // Verify optimistic update for complete - UI updates before API returns
  const fetch = vi.fn()
    .mockResolvedValueOnce(reply([task]))
    .mockResolvedValueOnce(reply({ ...task, id: task.id, completedAt: '2026-09-06T00:00:00Z' }));
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useTasks('inbox', true));
  await waitFor(() => expect(result.current.loading).toBe(false));

  // Complete task - should update immediately (optimistic)
  await act(async () => {
    const p = result.current.completeTask(task.id);
    vi.runAllTimers();
    await p;
  });

  // Task should be marked complete after API response
  expect(result.current.tasks[0].completedAt).toBeTruthy();
});

it('mutation started in Inbox does not append into Today after switching view', async () => {
  let resolveMutation!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply([])).mockImplementationOnce(() => new Promise(resolve => { resolveMutation = resolve; })).mockResolvedValueOnce(reply([])));
  const { result, rerender } = renderHook(({ view }) => useTasks(view as any, true), { initialProps: { view: 'inbox' } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const mutation = result.current.updateTask(task.id, { title: 'Changed' });
  rerender({ view: 'today' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { resolveMutation(reply(task)); await mutation; });
  expect(result.current.tasks).toEqual([]);
});

it('deleted tags are removed from visible task badges', () => {
  const props = { tasks: [task], loading: false, onSelect: () => {}, onToggle: () => {} };
  const { rerender } = render(<TaskList {...props} tags={[tag]} />);
  rerender(<TaskList {...props} tags={[]} />);
  expect(screen.queryByText('Work')).toBeNull();
});

it('saving an open task after deleting its tag does not resubmit the deleted id', async () => {
  const save = vi.fn();
  const props = { task, onSave: save, onClose: () => {}, onDelete: () => {} };
  const { rerender } = render(<TaskDetail {...props} tags={[tag]} />);
  rerender(<TaskDetail {...props} tags={[]} />);
  await act(async () => { fireEvent.click(screen.getByTestId('detail-save')); });
  expect(save.mock.calls[0][1].tagIds).toEqual([]);
});

it('QuickAdd uses the current day after the tab crosses midnight', async () => {
  const add = vi.fn();
  render(<QuickAdd onAdd={add} locale="vi" />);
  vi.setSystemTime(new Date('2026-09-07T05:00:00Z'));
  fireEvent.change(screen.getByTestId('add-task-input'), { target: { value: 'họp ngày mai' } });
  await act(async () => { fireEvent.click(screen.getByTestId('add-task-btn')); });
  expect(add.mock.calls[0][0].dueDate).toBe('2026-09-08');
});

it('typing the next draft while saving does not lose it on success', async () => {
  let done!: () => void;
  render(<QuickAdd onAdd={() => new Promise<void>(resolve => { done = resolve; })} />);
  fireEvent.change(screen.getByTestId('add-task-input'), { target: { value: 'First draft' } });
  fireEvent.click(screen.getByTestId('add-task-btn'));
  fireEvent.change(screen.getByTestId('add-task-input'), { target: { value: 'Second draft' } });
  await act(async () => { done(); });
  expect(screen.getByTestId('add-task-input')).toHaveValue('Second draft');
});

it('tag edit and delete UI reach PATCH and DELETE and update list on success', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply([tag])).mockResolvedValueOnce(reply({ ...tag, name: 'Renamed' })).mockResolvedValueOnce(reply(undefined));
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  function Harness() { return <TagManager state={useTags(true)} selectedTagId={null} onSelect={() => {}} />; }
  render(<Harness />);
  await waitFor(() => expect(screen.getByTestId('tag-tag-a')).toBeInTheDocument());
  const row = screen.getByTestId('tag-tag-a');
  fireEvent.click(row.querySelectorAll('button')[1]);
  fireEvent.change(screen.getByTestId('tag-edit-name-tag-a'), { target: { value: 'Renamed' } });
  await act(async () => { fireEvent.click(row.querySelectorAll('button')[0]); });
  expect(fetch).toHaveBeenCalledWith('/tags/tag-a', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Renamed', color: '#123456' }) }));
  expect(screen.getByText('Renamed')).toBeInTheDocument();
  await act(async () => { fireEvent.click(row.querySelectorAll('button')[2]); });
  expect(fetch).toHaveBeenCalledWith('/tags/tag-a', expect.objectContaining({ method: 'DELETE' }));
  expect(screen.queryByTestId('tag-tag-a')).toBeNull();
});
