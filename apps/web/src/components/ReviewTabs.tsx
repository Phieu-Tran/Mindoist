import { BarChart3, CheckCircle2, FileText, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SidebarView } from '@/hooks/useApi';

const TABS = [
  { view: 'summary', key: 'sidebar.summary', icon: BarChart3 },
  { view: 'completed', key: 'sidebar.completed', icon: CheckCircle2 },
  { view: 'notes', key: 'sidebar.notes', icon: FileText },
  { view: 'trashed', key: 'sidebar.trashed', icon: Trash2 },
] as const;

interface ReviewTabsProps {
  active: SidebarView;
  onSelect: (view: SidebarView) => void;
}

export function ReviewTabs({ active, onSelect }: ReviewTabsProps) {
  const { t } = useTranslation('tasks');

  return (
    <nav
      className="mb-4 flex w-full max-w-xl gap-1 overflow-x-auto rounded-control border border-border bg-card p-1"
      aria-label={t('sidebar.review')}
      data-testid="review-tabs"
    >
      {TABS.map(tab => {
        const Icon = tab.icon;
        const selected = active === tab.view;
        return (
          <button
            key={tab.view}
            type="button"
            aria-current={selected ? 'page' : undefined}
            data-testid={`review-tab-${tab.view}`}
            onClick={() => onSelect(tab.view)}
            className={cn(
              'flex min-h-10 min-w-max flex-1 items-center justify-center gap-2 rounded-control px-3 text-sm font-medium transition-colors',
              'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'bg-accent font-semibold text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t(tab.key)}
          </button>
        );
      })}
    </nav>
  );
}
