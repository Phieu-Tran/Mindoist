import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  // 'outline' (default) for contexts where the switcher should read as a
  // deliberate control (auth pages, Settings row). 'ghost' for a quiet
  // sidebar footer row (icon + label + current value), matching
  // AccentPicker/ThemeToggle's row idiom — an outlined button was the
  // single brightest element in the dark-mode sidebar, wrong emphasis next
  // to plain nav rows (D7).
  variant?: 'outline' | 'ghost';
}

export function LanguageSwitcher({ variant = 'outline' }: Props) {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language?.substring(0, 2) || 'en';
  const nextLabel = currentLang === 'en' ? t('language.vi') : t('language.en');

  const toggle = () => {
    const next = currentLang === 'en' ? 'vi' : 'en';
    i18n.changeLanguage(next);
  };

  if (variant === 'ghost') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        className="w-full justify-start gap-2 text-sidebar-foreground"
      >
        <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{t('appearance.language', { ns: 'common' })}</span>
        <span className="text-xs text-muted-foreground">{nextLabel}</span>
      </Button>
    );
  }

  return (
    <Button variant={variant} size="sm" onClick={toggle}>
      {nextLabel}
    </Button>
  );
}
