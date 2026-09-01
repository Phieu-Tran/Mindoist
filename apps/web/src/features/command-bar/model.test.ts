import { describe, expect, it } from 'vitest';
import { commandMode, commandQuery, rankTaskMatches } from './model';

describe('command bar model', () => {
  it('maps all four prefix modes', () => {
    expect(commandMode('new task')).toBe('create');
    expect(commandMode('> complete')).toBe('action');
    expect(commandMode('@calendar')).toBe('navigate');
    expect(commandMode('?nginx')).toBe('search');
    expect(commandQuery('  @project chai  ')).toBe('project chai');
  });

  it('ranks exact and title-prefix matches above description matches', () => {
    const tasks = [
      { id: '3', title: 'Proxy notes', description: 'nginx setup' },
      { id: '2', title: 'nginx migration', description: null },
      { id: '1', title: 'nginx', description: null },
    ] as any;
    expect(rankTaskMatches(tasks, 'nginx').map(task => task.id)).toEqual(['1', '2', '3']);
  });
});
