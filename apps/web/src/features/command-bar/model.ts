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

/** Case- and diacritic-insensitive form, so "hoan thanh" finds "Hoàn thành". */
export function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

export function matchesTaskSearch(task: Task, query: string): boolean {
  const needle = normalizeSearchText(query.trim());
  return !needle || normalizeSearchText(`${task.title}\n${task.description ?? ''}`).includes(needle);
}

export function rankTaskMatches(tasks: Task[], query: string, limit = 8): Task[] {
  const needle = normalizeSearchText(query.trim());
  if (!needle) return [];

  return tasks
    .map(task => {
      const title = normalizeSearchText(task.title);
      const description = normalizeSearchText(task.description ?? '');
      const score = title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : description.includes(needle) ? 3 : 99;
      return { task, score };
    })
    .filter(result => result.score < 99)
    .sort((a, b) => a.score - b.score || a.task.title.localeCompare(b.task.title))
    .slice(0, limit)
    .map(result => result.task);
}
