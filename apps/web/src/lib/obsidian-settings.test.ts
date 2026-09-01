import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildObsidianNewNoteUri,
  loadObsidianSettings,
  normalizeObsidianSettings,
  renderObsidianNotePath,
  saveObsidianSettings,
  validateObsidianSettings,
} from './obsidian-settings';

const configured = {
  vault: 'Hiếu - Personal',
  folder: '03_Project/Mindoist',
  filenameTemplate: 'Tổng kết Mindoist {{yyyy-MM}}',
  weeklyFilenameTemplate: 'Tổng kết tuần {{weekStart}}',
};

describe('obsidian settings', () => {
  beforeEach(() => localStorage.clear());

  it('normalizes vault-relative folders and note extensions', () => {
    expect(normalizeObsidianSettings({
      vault: ' Hiếu - Personal ',
      folder: '\\03_Project\\Mindoist\\',
      filenameTemplate: 'Tổng kết {{yyyy-MM}}.md',
      weeklyFilenameTemplate: 'Tổng kết tuần {{weekStart}}.md',
    })).toEqual({
      vault: 'Hiếu - Personal',
      folder: '03_Project/Mindoist',
      filenameTemplate: 'Tổng kết {{yyyy-MM}}',
      weeklyFilenameTemplate: 'Tổng kết tuần {{weekStart}}',
    });
  });

  it('stores separate local configuration for each signed-in user', () => {
    saveObsidianSettings('u1', configured);
    saveObsidianSettings('u2', { ...configured, vault: 'Work' });

    expect(loadObsidianSettings('u1').vault).toBe('Hiếu - Personal');
    expect(loadObsidianSettings('u2').vault).toBe('Work');
  });

  it('builds an encoded URI targeting a path inside the selected vault', () => {
    const uri = buildObsidianNewNoteUri(configured, { kind: 'month', key: '2026-09' }, '# Review', true);

    expect(uri).toBe(
      'obsidian://new?vault=Hi%E1%BA%BFu%20-%20Personal&file=03_Project%2FMindoist%2FT%E1%BB%95ng%20k%E1%BA%BFt%20Mindoist%202026-09.md&clipboard',
    );
    expect(renderObsidianNotePath(configured, { kind: 'month', key: '2026-09' })).toBe(
      '03_Project/Mindoist/Tổng kết Mindoist 2026-09.md',
    );
  });

  it('falls back to content and the default note location when no folder is set', () => {
    const uri = buildObsidianNewNoteUri(
      { ...configured, folder: '' },
      { kind: 'month', key: '2026-09' },
      '# Review',
      false,
    );

    expect(uri).toContain('name=T%E1%BB%95ng%20k%E1%BA%BFt%20Mindoist%202026-09');
    expect(uri).toContain('&content=%23%20Review');
  });

  it('rejects unsafe paths and templates that can overwrite every month', () => {
    expect(validateObsidianSettings({ ...configured, folder: '../Outside' })).toEqual({
      field: 'folder', code: 'folderInvalid',
    });
    expect(validateObsidianSettings({ ...configured, filenameTemplate: 'Monthly review' })).toEqual({
      field: 'filenameTemplate', code: 'filenameMonthRequired',
    });
    expect(validateObsidianSettings({ ...configured, weeklyFilenameTemplate: 'Weekly review' })).toEqual({
      field: 'weeklyFilenameTemplate', code: 'weeklyFilenameWeekRequired',
    });
  });

  it('renders a separate weekly filename and migrates older stored settings', () => {
    expect(renderObsidianNotePath(configured, { kind: 'week', key: '2026-08-31' })).toBe(
      '03_Project/Mindoist/Tổng kết tuần 2026-08-31.md',
    );
    localStorage.setItem('mindoist:obsidian:legacy', JSON.stringify({
      vault: 'Legacy vault',
      folder: 'Reviews',
      filenameTemplate: 'Monthly {{yyyy-MM}}',
    }));

    expect(loadObsidianSettings('legacy')).toEqual({
      vault: 'Legacy vault',
      folder: 'Reviews',
      filenameTemplate: 'Monthly {{yyyy-MM}}',
      weeklyFilenameTemplate: 'Mindoist Weekly Review {{weekStart}}',
    });
  });
});
