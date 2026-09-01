import { hues, type Hue } from '@mindoist/design-tokens';
import { canonicalProjectColor } from './project-colors';

export const TASK_COLOR_OPTIONS = hues.map(value => ({ value, labelKey: `detail.colors.${value}` }));

export type TaskColor = Hue;

export function isTaskColor(value: unknown): value is TaskColor {
  return typeof value === 'string' && TASK_COLOR_OPTIONS.some(option => option.value === value);
}

export function taskColorClass(color: string | null | undefined): string {
  return isTaskColor(color) ? `task-color-${color}` : 'task-color-none';
}

/** Explicit task color wins; otherwise inherit the assigned project identity. */
export function effectiveTaskColor(
  taskColor: string | null | undefined,
  projectColor: string | null | undefined,
): TaskColor | null {
  if (isTaskColor(taskColor)) return taskColor;
  const inheritedProjectColor = canonicalProjectColor(projectColor);
  if (inheritedProjectColor && isTaskColor(inheritedProjectColor)) return inheritedProjectColor;
  return null;
}
