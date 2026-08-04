export const TASK_COLOR_OPTIONS = [
  { value: 'slate', labelKey: 'detail.colors.slate' },
  { value: 'sky', labelKey: 'detail.colors.sky' },
  { value: 'indigo', labelKey: 'detail.colors.indigo' },
  { value: 'violet', labelKey: 'detail.colors.violet' },
  { value: 'rose', labelKey: 'detail.colors.rose' },
  { value: 'amber', labelKey: 'detail.colors.amber' },
  { value: 'jade', labelKey: 'detail.colors.jade' },
  { value: 'lime', labelKey: 'detail.colors.lime' },
] as const;

export type TaskColor = (typeof TASK_COLOR_OPTIONS)[number]['value'];

export function isTaskColor(value: unknown): value is TaskColor {
  return typeof value === 'string' && TASK_COLOR_OPTIONS.some(option => option.value === value);
}

export function taskColorClass(color: string | null | undefined): string {
  return isTaskColor(color) ? `task-color-${color}` : 'task-color-none';
}
