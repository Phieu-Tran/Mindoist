import { apiFetch } from '@/lib/api-client';

export type TelegramStatus =
  | { state: 'unavailable' }
  | { state: 'unlinked'; botUsername: string }
  | { state: 'pending'; botUsername: string; expiresAt: string }
  | {
      state: 'connected';
      botUsername: string;
      telegramUsername: string | null;
      telegramDisplayName: string | null;
      linkedAt: string;
    };

export type TelegramLinkChallenge = {
  state: 'pending';
  botUsername: string;
  expiresAt: string;
  deepLink: string;
};

export function getTelegramStatus() {
  return apiFetch<TelegramStatus>('/integrations/telegram/status');
}

export function createTelegramLinkChallenge() {
  return apiFetch<TelegramLinkChallenge>('/integrations/telegram/link-challenges', {
    method: 'POST',
  });
}

export function disconnectTelegram() {
  return apiFetch<{ disconnected: boolean }>('/integrations/telegram/connection', {
    method: 'DELETE',
  });
}
