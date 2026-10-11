import { describe, expect, it } from 'vitest';
import { commandMode, commandQuery, matchesTaskSearch, rankTaskMatches } from './model';

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

  it('finds Vietnamese tasks typed without diacritics', () => {
    const tasks = [
      { id: '1', title: 'Đối soát hoá đơn', description: null },
      { id: '2', title: 'Report', description: 'Gửi báo cáo tuần' },
    ] as any;
    expect(rankTaskMatches(tasks, 'doi soat').map(task => task.id)).toEqual(['1']);
    expect(rankTaskMatches(tasks, 'BAO CAO').map(task => task.id)).toEqual(['2']);
    expect(matchesTaskSearch(tasks[0], 'hoa don')).toBe(true);
    expect(matchesTaskSearch(tasks[0], 'nginx')).toBe(false);
  });
});
