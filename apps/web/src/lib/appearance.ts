export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'indigo' | 'ocean' | 'jade' | 'rose' | 'amber';

export const ACCENT_STORAGE_KEY = 'accent';
export const DEFAULT_ACCENT: Accent = 'indigo';

export const ACCENT_OPTIONS: ReadonlyArray<{ value: Accent; labelKey: string }> = [
  { value: 'indigo', labelKey: 'appearance.colors.indigo' },
  { value: 'ocean', labelKey: 'appearance.colors.ocean' },
  { value: 'jade', labelKey: 'appearance.colors.jade' },
  { value: 'rose', labelKey: 'appearance.colors.rose' },
  { value: 'amber', labelKey: 'appearance.colors.amber' },
];

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#f7f8fa',
  dark: '#121417',
};

export const THEME_CHANGE_EVENT = 'mindoist:theme-change';
export const ACCENT_CHANGE_EVENT = 'mindoist:accent-change';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  // Keep the browser chrome (address bar, task switcher) in sync with a
  // manually-picked theme too, not just the OS-preference media query the
  // static <meta> tags in index.html cover for the pre-hydration paint.
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.setAttribute('content', THEME_COLOR[resolved]);
  });
  // ThemeToggle renders in both the sidebar and Settings at once; each keeps
  // its own local state, so without this event the one that didn't trigger
  // the change keeps showing the old theme until it happens to remount.
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}

export function getStoredAccent(): Accent {
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
  return ACCENT_OPTIONS.some(option => option.value === stored)
    ? stored as Accent
    : DEFAULT_ACCENT;
}

export function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent;
  localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  // Same reasoning as THEME_CHANGE_EVENT above — AccentPicker also renders
  // in both the sidebar and Settings simultaneously.
  window.dispatchEvent(new CustomEvent<Accent>(ACCENT_CHANGE_EVENT, { detail: accent }));
}

export function initializeAppearance() {
  applyTheme(getStoredTheme());
  applyAccent(getStoredAccent());
}
