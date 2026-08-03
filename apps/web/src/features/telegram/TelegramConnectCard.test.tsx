import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramConnectCard } from './TelegramConnectCard';
import {
  createTelegramLinkChallenge,
  disconnectTelegram,
  getTelegramStatus,
} from './api';

vi.mock('./api', () => ({
  createTelegramLinkChallenge: vi.fn(),
  disconnectTelegram: vi.fn(),
  getTelegramStatus: vi.fn(),
}));

const renderCard = () => render(
  <I18nextProvider i18n={i18n}>
    <TelegramConnectCard />
  </I18nextProvider>,
);

describe('TelegramConnectCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
  });

  it('creates a one-time bot deep link and keeps an explicit link visible', async () => {
    vi.mocked(getTelegramStatus).mockResolvedValue({ state: 'unlinked', botUsername: 'MindoistTestBot' });
    vi.mocked(createTelegramLinkChallenge).mockResolvedValue({
      state: 'pending',
      botUsername: 'MindoistTestBot',
      expiresAt: '2026-08-02T12:10:00.000Z',
      deepLink: 'https://t.me/MindoistTestBot?start=mindoist_secret',
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderCard();
    fireEvent.click(await screen.findByTestId('telegram-connect'));

    const link = await screen.findByTestId('telegram-open-link');
    expect(link).toHaveAttribute('href', 'https://t.me/MindoistTestBot?start=mindoist_secret');
    expect(open).toHaveBeenCalledWith(
      'https://t.me/MindoistTestBot?start=mindoist_secret',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('requires confirmation before disconnecting and refreshes authorization state', async () => {
    vi.mocked(getTelegramStatus)
      .mockResolvedValueOnce({
        state: 'connected',
        botUsername: 'MindoistTestBot',
        telegramUsername: 'ada_bot',
        telegramDisplayName: 'Ada',
        linkedAt: '2026-08-02T10:00:00.000Z',
      })
      .mockResolvedValueOnce({ state: 'unlinked', botUsername: 'MindoistTestBot' });
    vi.mocked(disconnectTelegram).mockResolvedValue({ disconnected: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderCard();
    fireEvent.click(await screen.findByTestId('telegram-disconnect'));

    await waitFor(() => expect(disconnectTelegram).toHaveBeenCalledOnce());
    expect(await screen.findByTestId('telegram-connect')).toBeInTheDocument();
  });

  it('fails closed when Telegram is unavailable', async () => {
    vi.mocked(getTelegramStatus).mockResolvedValue({ state: 'unavailable' });
    renderCard();
    expect(await screen.findByText('Telegram is not configured.')).toBeInTheDocument();
    expect(screen.queryByTestId('telegram-connect')).not.toBeInTheDocument();
  });

  it('can retry a failed status request', async () => {
    vi.mocked(getTelegramStatus)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ state: 'unlinked', botUsername: 'MindoistTestBot' });
    renderCard();
    fireEvent.click(await screen.findByTestId('telegram-retry'));
    expect(await screen.findByTestId('telegram-connect')).toBeInTheDocument();
  });

  it('renders the connection action in Vietnamese', async () => {
    await i18n.changeLanguage('vi');
    vi.mocked(getTelegramStatus).mockResolvedValue({ state: 'unlinked', botUsername: 'MindoistTestBot' });
    renderCard();
    expect(await screen.findByTestId('telegram-connect')).toHaveTextContent('Kết nối Telegram');
  });
});
