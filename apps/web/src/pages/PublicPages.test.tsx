import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { LandingPage } from './LandingPage';
import { LegalPage } from './LegalPage';
import { GITHUB_URL } from '../lib/publicContent';

function renderPublicPage(page: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{page}</I18nextProvider>);
}

describe('public pages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('introduces Mindoist and links to GitHub and the auth flow', () => {
    renderPublicPage(<LandingPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mindoist');
    expect(screen.getByRole('heading', { level: 2, name: /Plan what matters/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view source on github/i })).toHaveAttribute('href', GITHUB_URL);
    expect(screen.getAllByRole('link', { name: 'Get started' })[0]).toHaveAttribute('href', '/register');
    expect(screen.getAllByRole('link', { name: 'Privacy' })[0]).toHaveAttribute('href', '/privacy');
  });

  it('discloses the read-only boundary for Google-origin events', () => {
    renderPublicPage(<LegalPage kind="privacy" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText(/Google-origin events are read-only inside Mindoist/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Google API Services User Data Policy/i })).toBeInTheDocument();
  });

  it('shows the public status page when configured', () => {
    vi.stubEnv('VITE_STATUS_PAGE_URL', 'https://status.example.test');
    renderPublicPage(<LandingPage />);

    expect(screen.getByRole('link', { name: /view live status/i })).toHaveAttribute('href', 'https://status.example.test');
    expect(screen.getByRole('link', { name: /service status/i })).toHaveAttribute('href', 'https://status.example.test');
  });

  it('publishes service terms for the optional Google integration', () => {
    renderPublicPage(<LegalPage kind="terms" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Google and third-party integrations/i })).toBeInTheDocument();
  });
});
