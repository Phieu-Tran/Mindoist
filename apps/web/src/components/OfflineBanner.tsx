import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineBanner() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2',
        'bg-muted px-4 py-2 text-sm text-muted-foreground border-b border-border'
      )}
    >
      <WifiOff className="w-4 h-4" />
      <span>{t('offline', 'You are offline. Changes will sync when reconnected.')}</span>
    </div>
  );
}
