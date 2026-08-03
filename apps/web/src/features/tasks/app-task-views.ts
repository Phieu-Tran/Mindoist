import type { Task } from '@mindoist/shared/types';
import type { SidebarView } from '../../hooks/useApi';

export interface TaskColorPreview {
  id: string;
  color: string;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function countVisibleTasks(tasks: Task[], view: SidebarView, now = new Date()): number {
  const topLevel = tasks.filter(task => !task.parentId);
  if (view === 'inbox') {
    return topLevel.filter(task => !task.projectId && !task.dueDate && !task.completedAt && !task.deletedAt).length;
  }
  if (view !== 'today') return topLevel.length;

  const today = localDayKey(now);
  return topLevel.filter(task => {
    const start = task.startDate?.slice(0, 10);
    const due = task.dueDate?.slice(0, 10);
    if (!start && !due) return true;
    if (due && due <= today) return true;
    return Boolean(start && start <= today && (!due || due >= today));
  }).length;
}

export function selectCalendarTaskViews(
  tasks: Task[],
  colorPreview: TaskColorPreview | null,
  now = new Date(),
): { calendarTasks: Task[]; todayTasks: Task[]; backlogTasks: Task[] } {
  const topLevel = tasks.filter(task => !task.parentId);
  const calendarTasks = colorPreview
    ? topLevel.map(task => task.id === colorPreview.id
      ? { ...task, color: colorPreview.color || null }
      : task)
    : topLevel;
  const today = localDayKey(now);
  const todayTasks = calendarTasks.filter(task => {
    if (task.completedAt || task.deletedAt || !task.dueDate) return false;
    const due = task.dueDate.slice(0, 10);
    const start = task.startDate?.slice(0, 10) ?? due;
    return start <= today && today <= due;
  });
  const backlogTasks = calendarTasks.filter(task => !task.dueDate && !task.completedAt && !task.deletedAt);

  return { calendarTasks, todayTasks, backlogTasks };
}
