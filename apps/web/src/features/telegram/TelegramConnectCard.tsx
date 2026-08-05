import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ExternalLink, Send, Unplug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  createTelegramLinkChallenge,
  disconnectTelegram,
  getTelegramStatus,
  type TelegramStatus,
} from './api';
import { TelegramUsageGuide } from './TelegramUsageGuide';

const POLL_INTERVAL_MS = 3_000;

export function TelegramConnectCard() {
  const { t, i18n } = useTranslation('tasks');
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTelegramStatus()
      .then(next => { if (active) setStatus(next); })
      .catch(() => { if (active) setError(t('settingsPage.telegramLoadError')); });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (status?.state !== 'pending') return;
    let active = true;
    const poll = window.setInterval(() => {
      void getTelegramStatus()
        .then(next => {
          if (!active) return;
          setStatus(next);
          if (next.state !== 'pending') setDeepLink(null);
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [status?.state]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const challenge = await createTelegramLinkChallenge();
      setStatus(challenge);
      setDeepLink(challenge.deepLink);
      window.open(challenge.deepLink, '_blank', 'noopener,noreferrer');
    } catch {
      setError(t('settingsPage.telegramConnectError'));
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await getTelegramStatus());
    } catch {
      setError(t('settingsPage.telegramLoadError'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t('settingsPage.telegramDisconnectConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectTelegram();
      setDeepLink(null);
      setStatus(await getTelegramStatus());
    } catch {
      setError(t('settingsPage.telegramDisconnectError'));
    } finally {
      setBusy(false);
    }
  };

  const connectedIdentity = status?.state === 'connected'
    ? status.telegramUsername
      ? `@${status.telegramUsername}`
      : status.telegramDisplayName || t('settingsPage.telegramAccount')
    : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-panel border border-border/70 bg-card p-4" aria-labelledby="telegram-connect-title">
        <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Send className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 id="telegram-connect-title" className="m-0 text-sm font-semibold">
                {t('settingsPage.telegramBot')}
              </h4>
              {status?.state === 'connected' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('settingsPage.telegramConnected')}
                </span>
              )}
              {status?.state === 'pending' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('settingsPage.telegramPending')}
                </span>
              )}
            </div>
            <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">
              {t('settingsPage.telegramHint')}
            </p>
          </div>
        </div>

        <div className="border-t border-border/60 pt-4" aria-live="polite">
          {!status && !error && (
            <p className="m-0 text-sm text-muted-foreground">{t('settingsPage.telegramLoading')}</p>
          )}

          {status?.state === 'unavailable' && (
            <p className="m-0 text-sm text-muted-foreground">{t('settingsPage.telegramUnavailable')}</p>
          )}

          {status?.state === 'connected' && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-medium">{connectedIdentity}</p>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                  {t('settingsPage.telegramLinkedAt', {
                    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(status.linkedAt)),
                  })}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => { void handleDisconnect(); }}
                data-testid="telegram-disconnect"
              >
                <Unplug className="mr-2 h-4 w-4" aria-hidden="true" />
                {busy ? t('settingsPage.telegramDisconnecting') : t('settingsPage.telegramDisconnect')}
              </Button>
            </div>
          )}

          {(status?.state === 'unlinked' || status?.state === 'pending') && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="m-0 text-sm font-medium">
                  {status.state === 'pending'
                    ? t('settingsPage.telegramPendingHint')
                    : t('settingsPage.telegramUnlinked')}
                </p>
                {status.state === 'pending' && (
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                    {t('settingsPage.telegramExpires', {
                      time: new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' })
                        .format(new Date(status.expiresAt)),
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {deepLink && (
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    data-testid="telegram-open-link"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('settingsPage.telegramOpen')}
                  </a>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => { void handleConnect(); }}
                  data-testid="telegram-connect"
                >
                  {busy
                    ? t('settingsPage.telegramCreating')
                    : status.state === 'pending'
                      ? t('settingsPage.telegramNewLink')
                      : t('settingsPage.telegramConnect')}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2" role="alert">
              <p className="m-0 text-xs font-medium text-destructive">{error}</p>
              {!status && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => { void handleRetry(); }}
                  data-testid="telegram-retry"
                >
                  {t('settingsPage.telegramRetry')}
                </Button>
              )}
            </div>
          )}
        </div>
        </div>
      </section>
      <TelegramUsageGuide />
    </div>
  );
}
