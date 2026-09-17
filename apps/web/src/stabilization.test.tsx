import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { Task, Tag } from '@mindoist/shared/types';
import { useTasksQuery } from './hooks/useTasksQuery';
import { useTagsQuery } from './hooks/useTagsQuery';
import { queryKeys } from './lib/query-client';
import { useAuth } from './hooks/useAuth';
import { TaskList } from './components/TaskList';
import { TaskInspector } from './components/TaskDetail';
import { GlobalQuickCapture } from './components/GlobalQuickCapture';
import { TagManager } from './components/TagManager';

const reply = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });
const tag: Tag = { id: 'tag-a', userId: 'user-a', name: 'Work', color: '#123456', createdAt: '', updatedAt: '', deletedAt: null };
const task: Task = {
  id: 'task-a', userId: 'user-a', title: 'Task A', description: null, color: null,
  projectId: null, projectColumnId: null, sectionId: null, parentId: null,
  priority: null, deadline: null, startDate: null, estimateMin: null,
  rrule: null, recurrenceBasis: null, recurringResetMode: null,
  pomodoroCount: 0, sortOrder: 0, completedAt: null, deletedAt: null,
  createdAt: '', updatedAt: '', tagIds: [tag.id],
};
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <StrictMode><QueryClientProvider key={localStorage.getItem('token')} client={client}>{children}</QueryClientProvider></StrictMode>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-06T05:00:00Z'));
});
afterEach(() => { cleanup(); client.clear(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

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

it('addTask shows an optimistic task before the API returns', async () => {
  let finish!: (value: unknown) => void;
  const fetch = vi.fn()
    .mockResolvedValueOnce(reply([]))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useTasksQuery('inbox', true), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let request!: Promise<Task>;
  act(() => { request = result.current.addTask({ title: 'New Task' }); });
  await waitFor(() => expect(result.current.tasks[0]?.title).toBe('New Task'));
  expect(result.current.tasks[0].id).toMatch(/^optimistic-/);
  await act(async () => { finish(reply({ ...task, id: 'new-task', title: 'New Task' })); await request; });
  await waitFor(() => expect(result.current.tasks[0]?.id).toBe('new-task'));
});

it('StrictMode loads tasks and ignores an old session mutation', async () => {
  localStorage.setItem('token', 'old');
  const fetch = vi.fn().mockResolvedValue(reply([]));
  vi.stubGlobal('fetch', fetch);
  const { result, rerender } = renderHook(() => useTasksQuery('inbox', true), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let resolve!: (value: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  let mutation!: Promise<Task>;
  act(() => { mutation = result.current.addTask({ title: 'Old user task' }); });
  await waitFor(() => expect(resolve).toBeDefined());
  const oldClient = client;
  // AppWorkspace remounts its QueryClientProvider for each authenticated user.
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  localStorage.setItem('token', 'new');
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { resolve(reply(task)); await mutation; });
  expect(result.current.tasks).toEqual([]);
  oldClient.clear();
});

it('completeTask shows completion before the API returns', async () => {
  let finish!: (value: unknown) => void;
  const completed = { ...task, completedAt: '2026-09-06T00:00:00Z' };
  const fetch = vi.fn()
    .mockResolvedValueOnce(reply([task]))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(reply([completed]));
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useTasksQuery('inbox', true), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let request!: Promise<Task>;
  act(() => { request = result.current.completeTask(task.id); });
  await waitFor(() => expect(result.current.tasks[0].completedAt).toBeTruthy());
  await act(async () => { finish(reply(completed)); await request; });
});

it('mutation started in Inbox does not append into Today after switching view', async () => {
  let resolveMutation!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply([task])).mockImplementationOnce(() => new Promise(resolve => { resolveMutation = resolve; })).mockResolvedValue(reply([])));
  const { result, rerender } = renderHook(({ view }: { view: 'inbox' | 'today' }) => useTasksQuery(view, true), { initialProps: { view: 'inbox' }, wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  let mutation!: Promise<Task>;
  act(() => { mutation = result.current.updateTask(task.id, { title: 'Changed' }); });
  await waitFor(() => expect(resolveMutation).toBeDefined());
  rerender({ view: 'today' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { resolveMutation(reply({ ...task, title: 'Changed' })); await mutation; });
  expect(result.current.tasks).toEqual([]);
  expect(client.getQueryData<Task[]>(queryKeys.tasks('inbox'))?.[0].title).toBe('Changed');
});

it('deleted tags are removed from visible task badges', () => {
  const props = { tasks: [task], loading: false, onSelect: () => {}, onToggle: () => {} };
  const { rerender } = render(<TaskList {...props} tags={[tag]} />);
  expect(screen.getByTestId('task-tag-task-a')).toHaveTextContent('#Work');
  rerender(<TaskList {...props} tags={[]} />);
  expect(screen.queryByTestId('task-tag-task-a')).toBeNull();
});

it('saving an open task after deleting its tag does not resubmit the deleted id', async () => {
  const save = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply([])));
  const props = { task, projects: [], onSave: save, onCompletePomodoro: async () => task, onClose: () => {}, onDelete: () => {} };
  const { rerender } = render(<TaskInspector {...props} tags={[tag]} />);
  rerender(<TaskInspector {...props} tags={[]} />);
  await act(async () => { fireEvent.click(screen.getByTestId('detail-save')); });
  expect(save.mock.calls[0][1].tagIds).toEqual([]);
});

it('GlobalQuickCapture reparses an existing draft after midnight', async () => {
  const add = vi.fn();
  render(<GlobalQuickCapture onAdd={add} locale="vi" />);
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  fireEvent.change(screen.getByTestId('global-quick-capture-input'), { target: { value: 'họp ngày mai' } });
  vi.setSystemTime(new Date('2026-09-07T05:00:00Z'));
  await act(async () => { fireEvent.click(screen.getByTestId('global-quick-capture-submit')); });
  expect(add.mock.calls[0][0].deadline.date).toBe('2026-09-08');
});

it('typing the next draft while saving does not lose it on success', async () => {
  let done!: () => void;
  render(<GlobalQuickCapture onAdd={() => new Promise<void>(resolve => { done = resolve; })} />);
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  fireEvent.change(screen.getByTestId('global-quick-capture-input'), { target: { value: 'First draft' } });
  fireEvent.click(screen.getByTestId('global-quick-capture-submit'));
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  fireEvent.change(screen.getByTestId('global-quick-capture-input'), { target: { value: 'Second draft' } });
  await act(async () => { done(); });
  expect(screen.getByTestId('global-quick-capture-input')).toHaveValue('Second draft');
});

it('tag edit and delete UI reach PATCH and DELETE and update list on success', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply([tag])).mockResolvedValueOnce(reply({ ...tag, name: 'Renamed' })).mockResolvedValueOnce(reply(undefined));
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  function Harness() { return <TagManager state={useTagsQuery(true)} selectedTagId={null} onSelect={() => {}} />; }
  render(<Harness />, { wrapper });
  await waitFor(() => expect(screen.getByTestId('tag-tag-a')).toBeInTheDocument());
  const row = screen.getByTestId('tag-tag-a');
  fireEvent.click(row.querySelectorAll('button')[1]);
  fireEvent.change(screen.getByTestId('tag-edit-name-tag-a'), { target: { value: 'Renamed' } });
  await act(async () => { fireEvent.click(row.querySelectorAll('button')[0]); });
  expect(fetch).toHaveBeenCalledWith('/tags/tag-a', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Renamed', color: '#123456' }) }));
  await waitFor(() => expect(screen.getByText('Renamed')).toBeInTheDocument());
  await act(async () => { fireEvent.click(row.querySelectorAll('button')[2]); });
  expect(fetch).toHaveBeenCalledWith('/tags/tag-a', expect.objectContaining({ method: 'DELETE' }));
  await waitFor(() => expect(screen.queryByTestId('tag-tag-a')).toBeNull());
});
