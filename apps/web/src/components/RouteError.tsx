import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { isStaleChunkError, reloadForStaleChunk } from '@/lib/chunk-reload';

/** Replaces the router's bare "Something went wrong!" screen. A chunk left
 * over from an older deploy reloads itself; anything else offers a reload. */
export function RouteError({ error }: { error: unknown }) {
  const { t } = useTranslation('common');
  const staleChunk = isStaleChunkError(error);
  const [reloading, setReloading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (staleChunk) setReloading(reloadForStaleChunk());
  }, [staleChunk]);

  if (reloading) return <div className="p-6 text-sm text-muted-foreground" role="status">{t('error.updating')}</div>;

  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" data-testid="route-error" className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-3 p-6">
      <h1 className="m-0 text-xl font-semibold">{t(staleChunk ? 'error.updateTitle' : 'error.title')}</h1>
      <p className="m-0 text-sm text-muted-foreground">{t(staleChunk ? 'error.updateDescription' : 'error.description')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => window.location.reload()}>{t('error.reload')}</Button>
        <Button type="button" variant="outline" aria-expanded={showDetails} onClick={() => setShowDetails(value => !value)}>
          {t(showDetails ? 'error.hideDetails' : 'error.showDetails')}
        </Button>
      </div>
      {showDetails && <pre className="m-0 max-w-full overflow-auto rounded-control border border-border bg-card p-3 text-xs">{message}</pre>}
    </div>
  );
}
