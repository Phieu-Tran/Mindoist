import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { AppShell } from './AppShell';

vi.mock('@/components/AccentPicker', () => ({
  AccentPicker: () => <button data-testid="accent-picker">Accent color</button>,
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

vi.mock('@/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <button data-testid="language-switcher">Language</button>,
}));

vi.mock('@/components/GoogleConnectButton', () => ({
  GoogleConnectButton: () => <button data-testid="gcal-connect">Connect Google</button>,
}));

function mockMatchMedia(matches: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matches[query] ?? false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('AppShell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockMatchMedia({});
  });

  const defaultProps = {
    sidebarView: 'inbox' as const,
    counts: { inbox: 3, today: 1, next7: 5, overdue: 2, completed: 4 },
    projects: [],
    tags: [],
    onSidebarSelect: vi.fn(),
    onLogout: vi.fn(),
    viewTitle: 'Inbox',
  };

  const renderShell = (overrides?: Record<string, any>) =>
    render(
      <I18nextProvider i18n={i18n}>
        <AppShell {...defaultProps} {...overrides}>
          <div data-testid="content">Main content</div>
        </AppShell>
      </I18nextProvider>
    );

  it('renders children content', () => {
    renderShell();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('shows view title in header on mobile', () => {
    mockMatchMedia({ '(max-width: 767px)': true });
    renderShell();
    expect(screen.getAllByText('Inbox').length).toBeGreaterThanOrEqual(1);
  });

  it('renders sidebar on desktop', () => {
    renderShell();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders bottom nav on mobile', () => {
    mockMatchMedia({ '(max-width: 767px)': true });
    renderShell();
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
  });

  it('hides sidebar on mobile', () => {
    mockMatchMedia({ '(max-width: 767px)': true });
    renderShell();
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  it('keeps appearance controls available inside the mobile drawer', async () => {
    mockMatchMedia({ '(max-width: 767px)': true });
    renderShell();

    expect(screen.queryByTestId('accent-picker')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('menu-toggle'));

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('accent-picker')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });
});
