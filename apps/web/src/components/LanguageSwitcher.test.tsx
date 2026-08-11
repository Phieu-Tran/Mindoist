import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { LanguageSwitcher } from './LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('should render button', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher />
      </I18nextProvider>
    );

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    // Button should have some text (language indicator)
    expect(button.textContent).toBeTruthy();
  });

  it('should toggle language on button click', async () => {
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher />
      </I18nextProvider>
    );

    const button = screen.getByRole('button');
    const initialLanguage = i18n.language;

    fireEvent.click(button);

    // Wait for language to change
    await waitFor(() => {
      expect(i18n.language).not.toBe(initialLanguage);
    });
  });

  it('should change language when i18n.changeLanguage is called', async () => {
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher />
      </I18nextProvider>
    );

    await i18n.changeLanguage('vi');

    // Language should be updated
    expect(i18n.language).toBe('vi');

    // Change back to en
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
  });
});
