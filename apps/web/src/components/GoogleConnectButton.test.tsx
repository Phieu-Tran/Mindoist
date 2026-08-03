import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleConnectButton } from './GoogleConnectButton';

describe('GoogleConnectButton', () => {
  beforeEach(async () => {
    i18n.addResourceBundle('en', 'tasks', {
      gcal: { connect: 'Connect Google', connected: 'Google Connected', disconnect: 'Disconnect' },
    }, true, true);
    await i18n.changeLanguage('en');
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    vi.restoreAllMocks();
  });

  const renderButton = (connected: boolean) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ success: true, data: { connected } }),
    } as Response);

    return render(
      <I18nextProvider i18n={i18n}>
        <GoogleConnectButton />
      </I18nextProvider>,
    );
  };

  it('keeps an accessible name when the connect label is visually hidden', async () => {
    renderButton(false);
    expect(await screen.findByTestId('gcal-connect')).toHaveAccessibleName('Connect Google');
  });

  it('keeps an accessible name when the disconnect label is visually hidden', async () => {
    renderButton(true);
    expect(await screen.findByTestId('gcal-disconnect')).toHaveAccessibleName('Disconnect');
  });
});
