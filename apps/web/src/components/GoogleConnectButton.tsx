import { useTranslation } from 'react-i18next';
import { Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGoogleCalendarStatus } from '@/hooks/useApi';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Props {
  // Sidebar footer wants a full-width, left-aligned row matching Logout;
  // Settings wants a compact, auto-width control at the end of a
  // label/control row (D7 — one idiom per context, not one global style).
  className?: string;
}

export function GoogleConnectButton({ className }: Props = {}) {
  const { t } = useTranslation();
  const { connected, loading, disconnect } = useGoogleCalendarStatus(Boolean(localStorage.getItem('token')));

  const handleConnect = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${API_BASE}/gcal/auth-url`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (body.success) window.open(body.data.url, '_blank');
  };

  const handleDisconnect = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    await disconnect();
  };

  if (loading) return null;

  return connected ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDisconnect}
      className={cn('gap-1.5 text-xs text-muted-foreground', className)}
      data-testid="gcal-disconnect"
      aria-label={t('tasks:gcal.disconnect')}
    >
      <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{t('tasks:gcal.connected')}</span>
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleConnect}
      className={cn('gap-1.5 text-xs text-muted-foreground', className)}
      data-testid="gcal-connect"
      aria-label={t('tasks:gcal.connect')}
    >
      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{t('tasks:gcal.connect')}</span>
    </Button>
  );
}
