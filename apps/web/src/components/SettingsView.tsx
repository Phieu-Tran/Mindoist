import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { Switch } from './ui/switch';
import type { SidebarView } from '../hooks/useApi';

const NAV_ITEMS: { view: SidebarView; labelKey: string }[] = [
  { view: 'summary', labelKey: 'sidebar.summary' },
  { view: 'completed', labelKey: 'sidebar.completed' },
  { view: 'trashed', labelKey: 'sidebar.trashed' },
  { view: 'notes', labelKey: 'sidebar.notes' },
  { view: 'countdown', labelKey: 'sidebar.countdown' },
];

interface Props {
  hiddenNavItems: SidebarView[];
  onUpdate: (hiddenNavItems: SidebarView[]) => void;
}

export function SettingsView({ hiddenNavItems, onUpdate }: Props) {
  const { t } = useTranslation('tasks');
  const [local, setLocal] = useState<Set<SidebarView>>(new Set(hiddenNavItems));

  useEffect(() => { setLocal(new Set(hiddenNavItems)); }, [hiddenNavItems]);

  const toggle = (view: SidebarView) => {
    const next = new Set(local);
    if (next.has(view)) next.delete(view); else next.add(view);
    setLocal(next);
    onUpdate([...next]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="m-0 text-lg font-semibold">{t('settings.navModules')}</h3>
        <p className="m-0 text-sm text-muted-foreground mt-1">{t('settings.description')}</p>
      </div>

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => {
          const hidden = local.has(item.view);
          return (
            <div
              key={item.view}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-accent/50 transition-colors"
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                {hidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4" />}
                {t(item.labelKey)}
              </span>
              <Switch
                checked={!hidden}
                onCheckedChange={() => toggle(item.view)}
                data-testid={`setting-nav-${item.view}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
