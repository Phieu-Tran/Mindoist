import { useEffect } from 'react';
import { Activity, CalendarDays, Check, ExternalLink, Inbox, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PublicFooter, PublicHeader, PublicPage } from '../components/PublicSiteChrome';
import { GITHUB_URL, getPublicLocale, getStatusPageUrl, publicCopy } from '../lib/publicContent';

const featureIcons = [Inbox, LayoutDashboard, ShieldCheck] as const;

export function LandingPage() {
  const { i18n } = useTranslation();
  const copy = publicCopy[getPublicLocale(i18n.resolvedLanguage)].landing;
  const statusPageUrl = getStatusPageUrl();

  useEffect(() => {
    document.title = 'Mindoist';
  }, []);

  return (
    <PublicPage>
      <PublicHeader />
      <main>
        <section className="border-b border-border bg-sidebar/55">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-primary">{copy.eyebrow}</p>
              <h1 className="mt-4 text-5xl font-semibold leading-none tracking-[-0.04em] sm:text-6xl">
                Mindoist
              </h1>
              <h2 className="mt-5 max-w-[18ch] text-3xl font-semibold leading-[1.12] tracking-[-0.03em] sm:text-4xl">
                {copy.title}
              </h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                {copy.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="/register" className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {copy.primaryAction}
                </a>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-background px-5 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {copy.secondaryAction}
                </a>
              </div>
            </div>

            <div className="rounded-panel border border-border bg-background p-3 shadow-xl shadow-foreground/5" aria-label={copy.previewLabel}>
              <div className="grid min-h-[24rem] overflow-hidden rounded-[calc(var(--radius-panel)-0.25rem)] border border-border bg-card sm:grid-cols-[0.38fr_0.62fr]">
                <div className="border-b border-border bg-sidebar p-5 sm:border-b-0 sm:border-r">
                  <div className="flex items-center gap-2 font-semibold">
                    <img src="/favicon.svg" alt="" aria-hidden="true" className="h-7 w-7 rounded-control" />
                    Mindoist
                  </div>
                  <div className="mt-8 space-y-2 text-sm text-muted-foreground">
                    <div className="rounded-control bg-sidebar-accent px-3 py-2 font-medium text-foreground">{copy.previewToday}</div>
                    <div className="px-3 py-2">Inbox</div>
                    <div className="px-3 py-2">Projects</div>
                    <div className="px-3 py-2">{copy.previewCalendar}</div>
                  </div>
                </div>
                <div className="p-5 sm:p-7">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">{copy.previewToday}</h2>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">2 tasks</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    {[copy.previewTaskOne, copy.previewTaskTwo].map((task, index) => (
                      <div key={task} className="flex items-center gap-3 rounded-control border border-border bg-background px-4 py-3">
                        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-primary" aria-hidden="true" />
                        <span className="min-w-0 flex-1 text-sm font-medium">{task}</span>
                        <span className="text-xs text-muted-foreground">{index === 0 ? '09:30' : '14:00'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-7 rounded-control border border-border bg-sidebar/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CalendarDays size={17} className="text-primary" aria-hidden="true" />
                      {copy.previewCalendar}
                    </div>
                    <div className="mt-4 grid grid-cols-5 gap-1.5" aria-hidden="true">
                      {[0, 1, 2, 3, 4].map(day => <span key={day} className="h-14 rounded-control bg-background" />)}
                    </div>
                    <div className="mt-2 rounded-control bg-primary/12 px-3 py-2 text-xs font-medium text-primary">{copy.previewProject}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">{copy.featuresTitle}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{copy.featuresDescription}</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {copy.features.map((feature, index) => {
                const Icon = featureIcons[index];
                return (
                  <article key={feature.title} className="rounded-panel border border-border bg-card p-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-sidebar/55 px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold text-primary">{copy.calendarEyebrow}</p>
              <h2 className="mt-3 max-w-[18ch] text-3xl font-semibold tracking-tight">{copy.calendarTitle}</h2>
              <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{copy.calendarDescription}</p>
            </div>
            <ul className="space-y-3 rounded-panel border border-border bg-background p-6">
              {copy.calendarPoints.map(point => (
                <li key={point} className="flex gap-3 text-sm leading-6">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {statusPageUrl ? (
          <section className="border-b border-border px-5 py-10 sm:px-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-panel border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                  <Activity size={21} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-primary">{copy.statusEyebrow}</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{copy.statusTitle}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.statusDescription}</p>
                </div>
              </div>
              <a
                href={statusPageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {copy.statusLink}
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
          </section>
        ) : null}

        <section className="px-5 py-16 text-center sm:px-8 sm:py-20">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">{copy.ctaTitle}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{copy.ctaBody}</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a href="/register" className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{copy.primaryAction}</a>
              <a href="/login" className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-background px-5 text-sm font-semibold text-foreground hover:bg-accent">{publicCopy[getPublicLocale(i18n.resolvedLanguage)].nav.login}</a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </PublicPage>
  );
}
