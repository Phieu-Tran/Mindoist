import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { GITHUB_URL, getPublicLocale, publicCopy } from '../lib/publicContent';
import { cn } from '../lib/utils';

export function PublicHeader() {
  const { i18n } = useTranslation();
  const copy = publicCopy[getPublicLocale(i18n.resolvedLanguage)].nav;

  return (
    <header className="border-b border-border/80 bg-background/95">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5 rounded-control font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-control shadow-sm" />
          <span>Mindoist</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Primary navigation">
          <a href="/#features" className="transition-colors hover:text-foreground">{copy.features}</a>
          <a href="/privacy" className="transition-colors hover:text-foreground">{copy.privacy}</a>
          <a href="/terms" className="transition-colors hover:text-foreground">{copy.terms}</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">{copy.github}</a>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <a href="/login" className="hidden min-h-10 items-center rounded-control px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:inline-flex">
            {copy.login}
          </a>
          <a href="/register" className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {copy.register}
          </a>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const copy = publicCopy[getPublicLocale(i18n.resolvedLanguage)].nav;

  return (
    <footer className={cn('border-t border-border', className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© 2026 Mindoist</p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label={copy.legal}>
          <a href="/" className="hover:text-foreground">{copy.home}</a>
          <a href="/privacy" className="hover:text-foreground">{copy.privacy}</a>
          <a href="/terms" className="hover:text-foreground">{copy.terms}</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">{copy.github}</a>
        </nav>
      </div>
    </footer>
  );
}

export function AuthLegalLinks({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const copy = publicCopy[getPublicLocale(i18n.resolvedLanguage)].nav;

  return (
    <nav className={cn('flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground', className)} aria-label={copy.legal}>
      <a href="/" className="underline-offset-4 hover:text-foreground hover:underline">{copy.home}</a>
      <a href="/privacy" target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-foreground hover:underline">{copy.privacy}</a>
      <a href="/terms" target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-foreground hover:underline">{copy.terms}</a>
    </nav>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
