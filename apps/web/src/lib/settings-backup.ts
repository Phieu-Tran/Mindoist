import {
  ACCENT_OPTIONS,
  applyAccent,
  applyTheme,
  getStoredAccent,
  getStoredTheme,
  type Accent,
  type Theme,
} from './appearance';
import {
  DEFAULT_OBSIDIAN_SETTINGS,
  loadObsidianSettings,
  normalizeObsidianSettings,
  saveObsidianSettings,
  validateObsidianSettings,
  type ObsidianSettings,
} from './obsidian-settings';

type Density = 'compact' | 'cozy' | 'comfortable';
type Language = 'en' | 'vi';

export interface ClientSettingsBackup {
  obsidian: ObsidianSettings;
  appearance: {
    theme: Theme;
    accent: Accent;
    density: Density;
    language: Language;
  };
}

const DENSITIES: readonly Density[] = ['compact', 'cozy', 'comfortable'];

function storedDensity(): Density {
  const value = localStorage.getItem('mindoist:density');
  return DENSITIES.includes(value as Density) ? value as Density : 'cozy';
}

function storedLanguage(): Language {
  return localStorage.getItem('i18nextLng')?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export function readClientSettings(userId: string): ClientSettingsBackup {
  return {
    obsidian: loadObsidianSettings(userId),
    appearance: {
      theme: getStoredTheme(),
      accent: getStoredAccent(),
      density: storedDensity(),
      language: storedLanguage(),
    },
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function restoreClientSettings(userId: string, value: unknown): ClientSettingsBackup | null {
  const root = objectValue(value);
  if (!root) return null;

  const current = readClientSettings(userId);
  const rawObsidian = objectValue(root.obsidian);
  if (rawObsidian) {
    const candidate = normalizeObsidianSettings({
      vault: typeof rawObsidian.vault === 'string' ? rawObsidian.vault : current.obsidian.vault,
      folder: typeof rawObsidian.folder === 'string' ? rawObsidian.folder : current.obsidian.folder,
      filenameTemplate: typeof rawObsidian.filenameTemplate === 'string'
        ? rawObsidian.filenameTemplate
        : current.obsidian.filenameTemplate,
      weeklyFilenameTemplate: typeof rawObsidian.weeklyFilenameTemplate === 'string'
        ? rawObsidian.weeklyFilenameTemplate
        : current.obsidian.weeklyFilenameTemplate,
    });
    const isEmpty = candidate.vault === '' && candidate.folder === ''
      && candidate.filenameTemplate === DEFAULT_OBSIDIAN_SETTINGS.filenameTemplate
      && candidate.weeklyFilenameTemplate === DEFAULT_OBSIDIAN_SETTINGS.weeklyFilenameTemplate;
    if (isEmpty || !validateObsidianSettings(candidate)) saveObsidianSettings(userId, candidate);
  }

  const appearance = objectValue(root.appearance);
  if (appearance) {
    if (appearance.theme === 'light' || appearance.theme === 'dark' || appearance.theme === 'system') applyTheme(appearance.theme);
    if (typeof appearance.accent === 'string' && ACCENT_OPTIONS.some(option => option.value === appearance.accent)) applyAccent(appearance.accent as Accent);
    if (DENSITIES.includes(appearance.density as Density)) {
      localStorage.setItem('mindoist:density', appearance.density as Density);
      document.documentElement.dataset.density = appearance.density as Density;
      window.dispatchEvent(new CustomEvent('mindoist:density-change', { detail: { density: appearance.density } }));
    }
    if (appearance.language === 'en' || appearance.language === 'vi') localStorage.setItem('i18nextLng', appearance.language);
  }

  return readClientSettings(userId);
}
