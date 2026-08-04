import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PublicFooter, PublicHeader, PublicPage } from '../components/PublicSiteChrome';
import { getPublicLocale, publicCopy, type LegalSection } from '../lib/publicContent';

type LegalKind = 'privacy' | 'terms';

export function LegalPage({ kind }: { kind: LegalKind }) {
  const { i18n } = useTranslation();
  const locale = getPublicLocale(i18n.resolvedLanguage);
  const page = publicCopy[locale][kind];
  const sections = page.sections as readonly LegalSection[];

  useEffect(() => {
    document.title = `${page.title} · Mindoist`;
  }, [page.title]);

  return (
    <PublicPage>
      <PublicHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[14rem_minmax(0,46rem)] lg:justify-center">
        <aside className="hidden lg:block">
          <nav className="sticky top-8 space-y-1 text-sm" aria-label={page.title}>
            {sections.map(section => (
              <a key={section.id} href={`#${section.id}`} className="block rounded-control px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                {section.title.replace(/^\d+\.\s*/, '')}
              </a>
            ))}
          </nav>
        </aside>

        <article>
          <header className="border-b border-border pb-8">
            <p className="text-sm font-medium text-primary">Mindoist</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">{page.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{page.description}</p>
            <p className="mt-4 text-sm font-medium text-foreground">{page.effective}</p>
          </header>

          <div className="space-y-10 pt-10">
            {sections.map(section => (
              <section key={section.id} id={section.id} className="scroll-mt-8">
                <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
                <div className="mt-3 space-y-3 text-[0.96rem] leading-7 text-muted-foreground">
                  {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && (
                    <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                      {section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}
                    </ul>
                  )}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
      <PublicFooter />
    </PublicPage>
  );
}
