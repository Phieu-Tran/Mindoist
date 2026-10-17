import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  UI_KIT_OPTIONS,
  getDefaultUiKit,
  getUiKitPreference,
  setUiKitPreference,
  type UiKitPreference,
} from '@/lib/ui-kit';

/**
 * Per-device choice of component kit. Changing it reloads the page because
 * only the active kit's code is loaded (components/ui/kit.tsx).
 */
export function UiKitToggle({ onChange = setUiKitPreference }: { onChange?: (preference: UiKitPreference) => void }) {
  const { t } = useTranslation('tasks');
  const [preference, setPreference] = useState<UiKitPreference>(getUiKitPreference);
  const environmentDefault = getDefaultUiKit();

  const label = (option: UiKitPreference) => option === 'default'
    ? t('settingsPage.uiKitDefault', { kit: t(`settingsPage.uiKit_${environmentDefault}`) })
    : t(`settingsPage.uiKit_${option}`);

  return (
    <div
      className="mindoist-segmented inline-grid grid-cols-3 rounded-control bg-muted p-0.5"
      role="radiogroup"
      aria-label={t('settingsPage.uiKit')}
      data-testid="ui-kit-toggle"
    >
      {UI_KIT_OPTIONS.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={preference === option}
          data-testid={`ui-kit-${option}`}
          className={cn(
            'rounded px-2.5 py-1.5 text-xs text-muted-foreground',
            preference === option && 'bg-background font-semibold text-foreground shadow-sm',
          )}
          onClick={() => {
            if (option === preference) return;
            setPreference(option);
            onChange(option);
          }}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}
