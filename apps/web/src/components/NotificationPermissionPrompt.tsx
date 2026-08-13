import { useEffect, useMemo, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import {
  getPushNotificationStatus,
  subscribeToPushNotifications,
  supportsPushNotifications,
  type PushNotificationStatus,
} from '@/lib/push-notifications';

interface Props {
  userId: string;
}

export function NotificationPermissionPrompt({ userId }: Props) {
  const { t } = useTranslation('tasks');
  const dismissKey = useMemo(() => `mindoist:notification-prompt-dismissed:${userId}`, [userId]);
  const [status, setStatus] = useState<PushNotificationStatus>(() => (
    supportsPushNotifications() ? 'default' : 'unsupported'
  ));
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(dismissKey) === 'true');
  const [statusChecked, setStatusChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(dismissKey) === 'true');
  }, [dismissKey]);

  useEffect(() => {
    if (!supportsPushNotifications()) {
      setStatus('unsupported');
      setStatusChecked(true);
      return;
    }
    let cancelled = false;
    getPushNotificationStatus()
      .then(nextStatus => {
        if (!cancelled) {
          setStatus(nextStatus);
          setStatusChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('unsupported');
          setStatusChecked(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const shouldShow = !dismissed && status !== 'unsupported' && status !== 'denied' && status !== 'subscribed';
  if (!statusChecked || !shouldShow) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(dismissKey, 'true');
    setDismissed(true);
  };

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPushNotifications();
      setStatus(await getPushNotificationStatus());
    } catch (err) {
      setStatus(await getPushNotificationStatus().catch((): PushNotificationStatus => 'unsupported'));
      setError(err instanceof Error ? err.message : t('notificationPrompt.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-border bg-card p-4 text-card-foreground shadow-xl">
      <div className="flex gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-sm font-semibold">{t('notificationPrompt.title')}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('notificationPrompt.description')}</p>
            </div>
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleDismiss}
              aria-label={t('notificationPrompt.dismiss')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {error && <p className="m-0 mt-2 text-xs font-medium text-destructive">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleEnable} disabled={busy}>
              {busy ? t('notificationPrompt.enabling') : t('notificationPrompt.enable')}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              {t('notificationPrompt.later')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
