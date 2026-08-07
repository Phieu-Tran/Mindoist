import { FolderOpen, Plus, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@mindoist/shared/types';
import { Button } from './ui/button';
import { projectColorClass } from '@/lib/project-colors';

interface Props {
  projects: Project[];
  onCreate: () => void;
  onSelect: (projectId: string) => void;
}

export function ProjectsOverview({ projects, onCreate, onSelect }: Props) {
  const { t } = useTranslation('tasks');
  const rootProjects = projects.filter(project => !project.parentId);

  return (
    <section aria-labelledby="projects-overview-title" className="mx-auto w-full max-w-4xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('projects.overviewEyebrow')}
          </p>
          <h2 id="projects-overview-title" className="m-0 text-2xl font-semibold">{t('sidebar.projects')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('projects.overviewSubtitle')}</p>
        </div>
        <Button type="button" onClick={onCreate} className="min-h-11">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('projects.newProject')}
        </Button>
      </header>

      {rootProjects.length === 0 ? (
        <div className="rounded-panel border border-dashed border-border bg-card px-6 py-14 text-center">
          <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
          <h3 className="m-0 text-base font-semibold">{t('projects.emptyTitle')}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('projects.emptyDescription')}</p>
          <Button type="button" onClick={onCreate} className="mt-4 min-h-11">
            {t('projects.createProjectTitle')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rootProjects.map(project => {
            const childCount = projects.filter(item => item.parentId === project.id).length;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelect(project.id)}
                className="group flex min-h-28 items-center gap-4 rounded-panel border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={`h-10 w-2 shrink-0 rounded-full ${projectColorClass(project.color)}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-base">{project.name}</strong>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {t(`projects.templates.${project.type}.name`)}
                    {childCount > 0 ? ` · ${t('projects.subprojectCount', { count: childCount })}` : ''}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
