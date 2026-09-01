import type { Task } from '@mindoist/shared/types';

export type CommandMode = 'create' | 'action' | 'navigate' | 'search';

export function commandMode(input: string): CommandMode {
  const first = input.trimStart()[0];
  if (first === '>') return 'action';
  if (first === '@') return 'navigate';
  if (first === '?') return 'search';
  return 'create';
}

export function commandQuery(input: string): string {
  const mode = commandMode(input);
  const trimmed = input.trim();
  return mode === 'create' ? trimmed : trimmed.slice(1).trim();
}

export function rankTaskMatches(tasks: Task[], query: string, limit = 8): Task[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  return tasks
    .map(task => {
      const title = task.title.toLocaleLowerCase();
      const description = (task.description ?? '').toLocaleLowerCase();
      const score = title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : description.includes(needle) ? 3 : 99;
      return { task, score };
    })
    .filter(result => result.score < 99)
    .sort((a, b) => a.score - b.score || a.task.title.localeCompare(b.task.title))
    .slice(0, limit)
    .map(result => result.task);
}
