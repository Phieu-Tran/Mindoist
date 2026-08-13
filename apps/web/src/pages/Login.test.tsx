import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { Login } from './Login';

describe('Login Component', () => {
  let onLoginMock: ReturnType<typeof vi.fn>;
  let onGoogleLoginMock: ReturnType<typeof vi.fn>;
  let onSwitchToRegisterMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    onLoginMock = vi.fn();
    onGoogleLoginMock = vi.fn();
    onSwitchToRegisterMock = vi.fn();
  });

  it('should render login form with labels', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Login onLogin={onLoginMock} onSwitchToRegister={onSwitchToRegisterMock} />
      </I18nextProvider>
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('should call onLogin with form data on submit', async () => {
    onLoginMock.mockResolvedValue(null);
    render(
      <I18nextProvider i18n={i18n}>
        <Login onLogin={onLoginMock} onSwitchToRegister={onSwitchToRegisterMock} />
      </I18nextProvider>
    );
    await userEvent.type(screen.getByTestId('login-email'), 'test@example.com');
    await userEvent.type(screen.getByTestId('login-password'), 'password123');
    fireEvent.click(screen.getByTestId('login-submit'));
    await waitFor(() => {
      expect(onLoginMock).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password123' });
    });
  });

  it('should show error message when login fails', async () => {
    onLoginMock.mockResolvedValue('Invalid credentials');
    render(
      <I18nextProvider i18n={i18n}>
        <Login onLogin={onLoginMock} onSwitchToRegister={onSwitchToRegisterMock} />
      </I18nextProvider>
    );
    await userEvent.type(screen.getByTestId('login-email'), 'test@example.com');
    await userEvent.type(screen.getByTestId('login-password'), 'wrongpassword');
    fireEvent.click(screen.getByTestId('login-submit'));
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('should disable button while submitting', async () => {
    let resolveLogin: ((value: any) => void) | undefined;
    onLoginMock.mockReturnValue(new Promise(resolve => { resolveLogin = resolve; }));
    render(
      <I18nextProvider i18n={i18n}>
        <Login onLogin={onLoginMock} onSwitchToRegister={onSwitchToRegisterMock} />
      </I18nextProvider>
    );
    await userEvent.type(screen.getByTestId('login-email'), 'test@example.com');
    await userEvent.type(screen.getByTestId('login-password'), 'password123');
    fireEvent.click(screen.getByTestId('login-submit'));
    const btn = screen.getByTestId('login-submit');
    expect(btn).toBeDisabled();
    resolveLogin!(null);
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('should call onSwitchToRegister when clicking register link', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Login onLogin={onLoginMock} onSwitchToRegister={onSwitchToRegisterMock} />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByText('Register'));
    expect(onSwitchToRegisterMock).toHaveBeenCalled();
  });

  it('should call onGoogleLogin when clicking Google sign-in', async () => {
    onGoogleLoginMock.mockResolvedValue(null);
    render(
      <I18nextProvider i18n={i18n}>
        <Login
          onLogin={onLoginMock}
          onGoogleLogin={onGoogleLoginMock}
          onSwitchToRegister={onSwitchToRegisterMock}
        />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByTestId('login-google'));
    await waitFor(() => {
      expect(onGoogleLoginMock).toHaveBeenCalled();
    });
  });

  it('has correct autocomplete attributes', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Login onLogin={onLoginMock} onSwitchToRegister={onSwitchToRegisterMock} />
      </I18nextProvider>
    );
    expect(screen.getByTestId('login-email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByTestId('login-password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('links to the public legal pages', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Login onLogin={onLoginMock} onSwitchToRegister={onSwitchToRegisterMock} />
      </I18nextProvider>
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});
