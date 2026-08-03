import { BookOpenText, ChevronDown, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function TelegramUsageGuide() {
  const { t } = useTranslation('tasks');
  const [isOpen, setIsOpen] = useState(true);
  const examples = [
    {
      label: t('settingsPage.telegramGuideCreateLabel'),
      message: t('settingsPage.telegramGuideCreateExample'),
    },
    {
      label: t('settingsPage.telegramGuideTodayLabel'),
      message: t('settingsPage.telegramGuideTodayExample'),
    },
    {
      label: t('settingsPage.telegramGuideStatsLabel'),
      message: t('settingsPage.telegramGuideStatsExample'),
    },
    {
      label: t('settingsPage.telegramGuideReviseLabel'),
      message: t('settingsPage.telegramGuideReviseExample'),
    },
  ];

  return (
    <section
      className="rounded-panel border border-border/70 bg-card p-4"
      aria-labelledby="telegram-guide-title"
      data-testid="telegram-usage-guide"
    >
      <details
        className="group"
        open={isOpen}
        onToggle={event => setIsOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-control outline-none transition-colors duration-200 hover:bg-accent/60 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card [&::-webkit-details-marker]:hidden">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <BookOpenText className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <h4 id="telegram-guide-title" className="m-0 text-sm font-semibold">
              {t('settingsPage.telegramGuideTitle')}
            </h4>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {t('settingsPage.telegramGuideHint')}
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>

        <div className="mt-4 border-t border-border/60 pt-4">
          <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
            {[1, 2, 3].map(step => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {step}
                </span>
                <div>
                  <p className="m-0 text-xs font-semibold">
                    {t(`settingsPage.telegramGuideStep${step}Title`)}
                  </p>
                  <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                    {t(`settingsPage.telegramGuideStep${step}Text`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 overflow-hidden rounded-control border border-border/70">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="hidden bg-muted/70 text-muted-foreground sm:table-header-group">
                <tr>
                  <th className="w-32 px-3 py-2 font-medium" scope="col">
                    {t('settingsPage.telegramGuideGoalColumn')}
                  </th>
                  <th className="px-3 py-2 font-medium" scope="col">
                    {t('settingsPage.telegramGuideMessageColumn')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {examples.map(example => (
                  <tr key={example.label} className="block border-t border-border/60 first:border-t-0 sm:table-row">
                    <th className="block px-3 pb-1 pt-3 font-semibold sm:table-cell sm:py-3 sm:align-top" scope="row">
                      {example.label}
                    </th>
                    <td className="block px-3 pb-3 sm:table-cell sm:py-3 sm:align-top">
                      <code className="block whitespace-normal break-words rounded-chip bg-muted/70 px-2.5 py-2 font-sans leading-5 text-foreground">
                        {example.message}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-control bg-primary/5 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="m-0">{t('settingsPage.telegramGuideNote')}</p>
          </div>
        </div>
      </details>
    </section>
  );
}
