import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { Register } from './Register';

describe('Register Component', () => {
  let onRegisterMock: ReturnType<typeof vi.fn>;
  let onGoogleLoginMock: ReturnType<typeof vi.fn>;
  let onSwitchToLoginMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onRegisterMock = vi.fn();
    onGoogleLoginMock = vi.fn();
    onSwitchToLoginMock = vi.fn();
  });

  it('should call onGoogleLogin when clicking Google sign-in', async () => {
    onGoogleLoginMock.mockResolvedValue(null);
    render(
      <I18nextProvider i18n={i18n}>
        <Register
          onRegister={onRegisterMock}
          onGoogleLogin={onGoogleLoginMock}
          onSwitchToLogin={onSwitchToLoginMock}
        />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByTestId('register-google'));

    await waitFor(() => {
      expect(onGoogleLoginMock).toHaveBeenCalled();
    });
  });

  it('links to the public legal pages', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Register onRegister={onRegisterMock} onSwitchToLogin={onSwitchToLoginMock} />
      </I18nextProvider>
    );

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});
