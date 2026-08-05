import { PanelLeftOpen, PanelLeftClose, Calendar as CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  panelOpen: boolean;
  togglePanel: () => void;
  hasGcalEvents: boolean;
}

const PRIORITIES = [1, 2, 3, 4] as const;

export function CalendarHeader({ panelOpen, togglePanel, hasGcalEvents }: Props) {
  const { t } = useTranslation('tasks');

  return (
    <div className="calendar-header-row">
      <CalendarIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <h2 className="calendar-header-title">{t('sidebar.calendar')}</h2>
      <div className="calendar-legend" role="list" aria-label={t('calendar.priorityLegend')}>
        {PRIORITIES.map(priority => (
          <span key={priority} role="listitem" data-testid={`calendar-legend-p${priority}`} className="calendar-legend-item">
            <span className={`calendar-priority-dot calendar-priority-p${priority}`} aria-hidden="true" />
            {t(`calendar.priority${priority}`)}
          </span>
        ))}
        {hasGcalEvents && (
          <span role="listitem" className="calendar-legend-item">
            <span className="calendar-priority-dot calendar-priority-google" aria-hidden="true" />
            {t('calendar.google')}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={togglePanel}
        className="calendar-panel-toggle"
        aria-label={panelOpen ? t('calendar.closePanel') : t('calendar.openPanel')}
      >
        {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </button>
      <div className="calendar-mobile-mode" role="group" aria-label={t('calendar.mobileMode')}>
        <button type="button" aria-pressed={panelOpen} onClick={() => !panelOpen && togglePanel()}>{t('calendar.plan')}</button>
        <button type="button" aria-pressed={!panelOpen} onClick={() => panelOpen && togglePanel()}>{t('sidebar.calendar')}</button>
      </div>
    </div>
  );
}
