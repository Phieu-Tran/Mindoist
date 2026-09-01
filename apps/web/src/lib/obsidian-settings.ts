export interface ObsidianSettings {
  vault: string;
  folder: string;
  filenameTemplate: string;
  weeklyFilenameTemplate: string;
}

export type ObsidianReviewPeriod = {
  kind: 'month' | 'week';
  key: string;
};

export type ObsidianSettingsField = keyof ObsidianSettings;

export interface ObsidianSettingsValidationError {
  field: ObsidianSettingsField;
  code:
    | 'vaultRequired'
    | 'folderInvalid'
    | 'filenameRequired'
    | 'filenameMonthRequired'
    | 'filenameInvalid'
    | 'weeklyFilenameRequired'
    | 'weeklyFilenameWeekRequired'
    | 'weeklyFilenameInvalid';
}

export const DEFAULT_OBSIDIAN_SETTINGS: ObsidianSettings = {
  vault: '',
  folder: '',
  filenameTemplate: 'Mindoist Monthly Review {{yyyy-MM}}',
  weeklyFilenameTemplate: 'Mindoist Weekly Review {{weekStart}}',
};

const STORAGE_PREFIX = 'mindoist:obsidian:';
const INVALID_FILENAME_CHARS = /[<>:"|?*]/;

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function normalizeObsidianFolder(folder: string) {
  return folder
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export function normalizeObsidianSettings(settings: ObsidianSettings): ObsidianSettings {
  return {
    vault: settings.vault.trim(),
    folder: normalizeObsidianFolder(settings.folder),
    filenameTemplate: settings.filenameTemplate.trim().replace(/\.md$/i, ''),
    weeklyFilenameTemplate: settings.weeklyFilenameTemplate.trim().replace(/\.md$/i, ''),
  };
}

export function validateObsidianSettings(settings: ObsidianSettings): ObsidianSettingsValidationError | null {
  const normalized = normalizeObsidianSettings(settings);
  if (!normalized.vault) return { field: 'vault', code: 'vaultRequired' };

  const folderSegments = normalized.folder.split('/').filter(Boolean);
  if (folderSegments.some(segment => segment === '.' || segment === '..' || INVALID_FILENAME_CHARS.test(segment))) {
    return { field: 'folder', code: 'folderInvalid' };
  }

  if (!normalized.filenameTemplate) return { field: 'filenameTemplate', code: 'filenameRequired' };
  if (!normalized.filenameTemplate.includes('{{yyyy-MM}}')) {
    return { field: 'filenameTemplate', code: 'filenameMonthRequired' };
  }
  if (normalized.filenameTemplate.includes('/') || normalized.filenameTemplate.includes('\\') || INVALID_FILENAME_CHARS.test(normalized.filenameTemplate)) {
    return { field: 'filenameTemplate', code: 'filenameInvalid' };
  }
  if (!normalized.weeklyFilenameTemplate) {
    return { field: 'weeklyFilenameTemplate', code: 'weeklyFilenameRequired' };
  }
  if (!normalized.weeklyFilenameTemplate.includes('{{weekStart}}')) {
    return { field: 'weeklyFilenameTemplate', code: 'weeklyFilenameWeekRequired' };
  }
  if (
    normalized.weeklyFilenameTemplate.includes('/')
    || normalized.weeklyFilenameTemplate.includes('\\')
    || INVALID_FILENAME_CHARS.test(normalized.weeklyFilenameTemplate)
  ) {
    return { field: 'weeklyFilenameTemplate', code: 'weeklyFilenameInvalid' };
  }
  return null;
}

export function isObsidianConfigured(
  settings: ObsidianSettings | null | undefined,
): settings is ObsidianSettings {
  return Boolean(settings && !validateObsidianSettings(settings));
}

export function renderObsidianFilename(settings: ObsidianSettings, period: ObsidianReviewPeriod) {
  const normalized = normalizeObsidianSettings(settings);
  return period.kind === 'week'
    ? normalized.weeklyFilenameTemplate.replaceAll('{{weekStart}}', period.key)
    : normalized.filenameTemplate.replaceAll('{{yyyy-MM}}', period.key);
}

export function renderObsidianNotePath(settings: ObsidianSettings, period: ObsidianReviewPeriod) {
  const normalized = normalizeObsidianSettings(settings);
  const filename = `${renderObsidianFilename(normalized, period)}.md`;
  return normalized.folder ? `${normalized.folder}/${filename}` : filename;
}

export function buildObsidianNewNoteUri(
  settings: ObsidianSettings,
  period: ObsidianReviewPeriod,
  markdown: string,
  useClipboard: boolean,
) {
  const normalized = normalizeObsidianSettings(settings);
  const filename = renderObsidianFilename(normalized, period);
  const target = normalized.folder
    ? `file=${encodeURIComponent(`${normalized.folder}/${filename}.md`)}`
    : `name=${encodeURIComponent(filename)}`;
  const content = useClipboard ? 'clipboard' : `content=${encodeURIComponent(markdown)}`;
  return `obsidian://new?vault=${encodeURIComponent(normalized.vault)}&${target}&${content}`;
}

export function buildObsidianOpenVaultUri(vault: string) {
  return `obsidian://open?vault=${encodeURIComponent(vault.trim())}`;
}

export function loadObsidianSettings(userId: string): ObsidianSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_OBSIDIAN_SETTINGS };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_OBSIDIAN_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ObsidianSettings>;
    if (
      typeof parsed.vault !== 'string'
      || typeof parsed.folder !== 'string'
      || typeof parsed.filenameTemplate !== 'string'
    ) {
      return { ...DEFAULT_OBSIDIAN_SETTINGS };
    }
    return normalizeObsidianSettings({
      vault: parsed.vault,
      folder: parsed.folder,
      filenameTemplate: parsed.filenameTemplate,
      weeklyFilenameTemplate: typeof parsed.weeklyFilenameTemplate === 'string'
        ? parsed.weeklyFilenameTemplate
        : DEFAULT_OBSIDIAN_SETTINGS.weeklyFilenameTemplate,
    });
  } catch {
    return { ...DEFAULT_OBSIDIAN_SETTINGS };
  }
}

export function saveObsidianSettings(userId: string, settings: ObsidianSettings) {
  const normalized = normalizeObsidianSettings(settings);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
  }
  return normalized;
}
