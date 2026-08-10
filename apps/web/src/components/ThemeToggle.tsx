import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyTheme, getStoredTheme, resolveTheme, THEME_CHANGE_EVENT, type Theme } from '@/lib/appearance';

interface Props {
  // 'icon' (default): bare icon button, for a label+control settings row.
  // 'row': full-width label+icon+state, matching AccentPicker's row idiom —
  // for the sidebar footer (D7 — one control idiom, not one-off styles).
  variant?: 'icon' | 'row';
}

export function ThemeToggle({ variant = 'icon' }: Props) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const resolved = resolveTheme(theme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // ThemeToggle renders in both the sidebar and Settings at the same time —
  // pick up changes made through the *other* instance instead of going stale.
  useEffect(() => {
    const handleChange = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      setTheme(current => (current === next ? current : next));
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleChange);
  }, []);

  const cycle = () => {
    // Toggle off the resolved (visible) appearance, not the stored theme —
    // otherwise the hidden 'system' step can resolve to the same appearance
    // as the state just left (e.g. dark -> system while OS is dark), making
    // the button look unresponsive and need a second click.
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  };

  const Icon = resolved === 'dark' ? Moon : Sun;

  if (variant === 'row') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={cycle}
        aria-label={t('common:themeToggle', { theme: resolved }) as string}
        data-testid="theme-toggle"
        className="w-full justify-start gap-2 text-sidebar-foreground"
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{t('appearance.label', { ns: 'common' })}</span>
        <span className="text-xs text-muted-foreground capitalize">{resolved}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={t('common:themeToggle', { theme: resolved }) as string}
      data-testid="theme-toggle"
      title={resolved}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
