import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, WifiOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getSyncStatus,
  onSyncStatusChange,
  retrySync,
  type SyncStatus,
} from '../lib/sync/engine';
import { cn } from '../lib/utils';

export function SyncCenter() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [open, setOpen] = useState(false);

  useEffect(() => onSyncStatusChange(setStatus), []);

  const lastSyncedLabel = useMemo(() => {
    if (!status.lastSyncedAt) return t('common:sync.never');
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(status.lastSyncedAt));
  }, [i18n.language, status.lastSyncedAt, t]);

  const label = !status.online
    ? t('common:sync.offline')
    : status.phase === 'syncing'
      ? t('common:sync.syncing')
      : status.phase === 'error'
        ? t('common:sync.error')
        : status.pendingCount > 0
          ? t('common:sync.pending', { count: status.pendingCount })
          : t('common:sync.synced');

  const Icon = !status.online
    ? WifiOff
    : status.phase === 'syncing'
      ? Loader2
      : status.phase === 'error'
        ? AlertCircle
        : CheckCircle2;

  return (
    <div className="fixed bottom-20 right-3 z-50 flex flex-col items-end gap-2 md:bottom-4 md:right-4">
      {open && (
        <section
          className="w-[min(22rem,calc(100vw-1.5rem))] rounded-panel border border-border bg-popover p-4 text-popover-foreground shadow-lg"
          aria-label={t('common:sync.title')}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-sm font-semibold">{t('common:sync.title')}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('common:sync.description')}</p>
            </div>
            <button
              type="button"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setOpen(false)}
              aria-label={t('common:sync.close')}
            >
              <X className="size-4" />
            </button>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('common:sync.status')}</dt>
            <dd className="m-0 text-right font-medium">{label}</dd>
            <dt className="text-muted-foreground">{t('common:sync.pendingLabel')}</dt>
            <dd className="m-0 text-right font-medium">{status.pendingCount}</dd>
            <dt className="text-muted-foreground">{t('common:sync.lastSynced')}</dt>
            <dd className="m-0 text-right font-medium">{lastSyncedLabel}</dd>
          </dl>

          {status.error && (
            <p className="mt-3 rounded-control bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {status.error}
            </p>
          )}

          <button
            type="button"
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!status.online || status.phase === 'syncing'}
            onClick={() => void retrySync()}
          >
            <RefreshCw className="size-4" />
            {t('common:sync.retry')}
          </button>
        </section>
      )}

      <button
        type="button"
        className={cn(
          'inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          status.phase === 'error'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : !status.online || status.pendingCount > 0
              ? 'border-border bg-popover text-popover-foreground'
              : 'border-border/70 bg-popover/90 text-muted-foreground',
        )}
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-label={`${t('common:sync.title')}: ${label}`}
      >
        <Icon className={cn('size-4', status.phase === 'syncing' && 'animate-spin motion-reduce:animate-none')} />
        <span>{label}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">{label}</span>
    </div>
  );
}
