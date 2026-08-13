import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, FolderOpen, ChevronDown, ChevronRight, Calendar, LogOut, BarChart3, Plus, Settings, ShieldCheck, Hourglass, Tag as TagIcon, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectColorClass } from '@/lib/project-colors';
import { GoogleConnectButton } from './GoogleConnectButton';
import { AccentPicker } from './AccentPicker';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { CreateProjectDialog, ProjectTypeIcon } from './CreateProjectDialog';
import { Button } from './ui/button';
import type { SidebarView } from '../hooks/useApi';
import type { CreateProjectRequest, Project, Tag } from '@mindoist/shared/types';

interface NavItem {
  view: SidebarView;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'today', key: 'sidebar.today', icon: CalendarDays },
  { view: 'calendar', key: 'sidebar.calendar', icon: Calendar },
  { view: 'countdown', key: 'sidebar.countdown', icon: Hourglass },
  { view: 'projects', key: 'sidebar.projects', icon: FolderOpen },
  { view: 'summary', key: 'sidebar.review', icon: BarChart3 },
];

interface Props {
  current: SidebarView;
  currentProjectId?: string;
  currentTagId?: string;
  counts: { inbox: number; today: number; next7: number; overdue: number; completed: number };
  projects: Project[];
  tags?: Tag[];
  onSelect: (view: SidebarView, projectId?: string, tagId?: string) => void;
  className?: string;
  showAppearance?: boolean;
  onLogout?: () => void;
  onCreateProject?: (request: CreateProjectRequest) => Promise<void>;
  onCreateTag?: (name: string) => Promise<Tag>;
  onMoveProject?: (projectId: string, parentId?: string) => Promise<void>;
  isAdmin?: boolean;
}

const PROJECT_INDENTS = ['pl-9', 'pl-12', 'pl-16', 'pl-20', 'pl-24'];

export function Sidebar({
  current,
  currentProjectId,
  currentTagId,
  counts,
  projects,
  tags = [],
  onSelect,
  className,
  showAppearance = true,
  onLogout,
  onCreateProject,
  onCreateTag,
  onMoveProject,
  isAdmin = false,
}: Props) {
  const { t } = useTranslation('tasks');
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined);
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagCreateOpen, setTagCreateOpen] = useState(false);
  const [tagError, setTagError] = useState('');
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  const visibleNavItems = NAV_ITEMS;

  const countMap = counts;
  const projectIds = new Set(projects.map(project => project.id));

  const openCreateProject = (parentId: string | null) => {
    setProjectsOpen(true);
    setCreateParentId(parentId);
  };

  const openCreateTag = () => {
    setTagsOpen(true);
    setTagCreateOpen(true);
    setTagError('');
  };

  const createTagFromSidebar = async () => {
    const name = tagName.trim();
    if (!name || !onCreateTag || creatingTag) return;

    const existingTag = tags.find(tag => tag.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    if (existingTag) {
      setTagName('');
      setTagCreateOpen(false);
      onSelect('tags', undefined, existingTag.id);
      return;
    }

    setCreatingTag(true);
    setTagError('');
    try {
      const tag = await onCreateTag(name);
      setTagName('');
      setTagCreateOpen(false);
      onSelect('tags', undefined, tag.id);
    } catch {
      setTagError(t('tags.createError'));
    } finally {
      setCreatingTag(false);
    }
  };

  const renderProjectRows = (parentId: string | null, depth = 0): React.ReactNode => projects
    .filter(project => parentId === null
      ? !project.parentId || !projectIds.has(project.parentId)
      : project.parentId === parentId)
    .map(project => (
      <div key={project.id}>
        <div
          className={cn('group flex items-center gap-0.5 rounded-lg', dragOverProjectId === project.id && 'bg-primary/10 ring-1 ring-primary/35')}
          draggable={Boolean(onMoveProject)}
          onDragStart={event => {
            setDraggedProjectId(project.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', project.id);
          }}
          onDragEnd={() => { setDraggedProjectId(null); setDragOverProjectId(null); }}
          onDragOver={event => {
            if (draggedProjectId && draggedProjectId !== project.id) {
              event.preventDefault();
              setDragOverProjectId(project.id);
            }
          }}
          onDrop={event => {
            event.preventDefault();
            if (draggedProjectId && draggedProjectId !== project.id && onMoveProject) {
              void onMoveProject(draggedProjectId, project.id);
            }
            setDraggedProjectId(null);
            setDragOverProjectId(null);
          }}
        >
          <button
            data-testid={`sidebar-project-${project.id}`}
            onClick={() => onSelect('projects', project.id)}
            aria-current={current === 'projects' && currentProjectId === project.id ? 'page' : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 text-left pr-1 py-1.5 text-sm rounded-lg transition-colors cursor-pointer",
              PROJECT_INDENTS[Math.min(depth, PROJECT_INDENTS.length - 1)],
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              current === 'projects' && currentProjectId === project.id && "bg-sidebar-accent font-semibold text-foreground"
            )}
          >
            <span className={cn('w-2 h-2 rounded-full shrink-0', projectColorClass(project.color))} />
            <ProjectTypeIcon type={project.type} className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground" />
            <span className="truncate">{project.name}</span>
          </button>
          {onCreateProject && (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground opacity-60 transition-colors hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
              onClick={() => openCreateProject(project.id)}
              aria-label={t('projects.addSubproject', { name: project.name })}
              data-testid={`sidebar-add-subproject-${project.id}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        {renderProjectRows(project.id, depth + 1)}
      </div>
    ));

  return (
    <nav
      data-testid="sidebar"
      className={cn(
        "flex h-full flex-col w-[var(--shell-sidebar-width)] shrink-0 border-r border-border bg-sidebar overflow-y-auto",
        className,
      )}
      aria-label={t('sidebar.navigationLabel')}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2" data-testid="sidebar-brand">
        <img src="/favicon.svg" alt="" width="24" height="24" className="h-6 w-6 shrink-0 rounded-chip" aria-hidden="true" />
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">
          {t('app.title', { ns: 'common' })}
        </span>
      </div>

      <div className="px-2 pb-2">
        <button
          type="button"
          data-testid="sidebar-add-task"
          onClick={() => window.dispatchEvent(new Event('mindoist:global-capture'))}
          className="flex min-h-10 w-full items-center gap-2 rounded-lg bg-primary px-3 text-left text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{t('quickAdd.add')}</span>
          <kbd className="rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
        </button>
      </div>

      <div className="flex flex-col gap-0.5 p-2">
        {visibleNavItems.map(item => {
          const Icon = item.icon;
          const isReviewSurface = ['summary', 'completed', 'notes', 'trashed'].includes(current);
          const isActive = !currentProjectId && !currentTagId && (
            current === item.view || (item.view === 'summary' && isReviewSurface)
          );
          const count = item.view === 'all' ? countMap.inbox : countMap[item.view as keyof typeof countMap];
          return (
            <button
              type="button"
              key={item.view}
              data-testid={`sidebar-${item.view}`}
              onClick={() => onSelect(item.view)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                "flex items-center gap-2.5 w-full text-left px-2.5 py-2.5 text-sm rounded-lg transition-colors cursor-pointer",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                "active:bg-accent/80 active:scale-[0.98]",
                isActive && "bg-sidebar-accent font-semibold text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">{t(item.key)}</span>
              {item.view !== 'completed' && count > 0 && (
                <span className="text-xs tabular-nums text-sidebar-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-0.5 px-2">
        <div
          className={cn('flex items-center gap-0.5 rounded-lg', dragOverProjectId === 'root' && 'bg-primary/10 ring-1 ring-primary/35')}
          onDragOver={event => {
            if (draggedProjectId) {
              event.preventDefault();
              setDragOverProjectId('root');
            }
          }}
          onDrop={event => {
            event.preventDefault();
            if (draggedProjectId && onMoveProject) void onMoveProject(draggedProjectId);
            setDraggedProjectId(null);
            setDragOverProjectId(null);
          }}
        >
          <button
            data-testid="sidebar-projects-toggle"
            onClick={() => setProjectsOpen(o => !o)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left px-2.5 py-2 text-sm font-medium text-foreground/60 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{t('sidebar.projects')}</span>
            {projectsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {onCreateProject && (
            <button
              type="button"
              onClick={() => openCreateProject(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('projects.addProject')}
              data-testid="sidebar-add-project"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {projectsOpen && (
          <div className="flex flex-col gap-0.5" data-testid="sidebar-projects-list">
            {projects.length === 0 ? (
              <span className="px-2.5 py-1.5 text-xs text-sidebar-foreground italic">{t('list.empty')}</span>
            ) : (
              renderProjectRows(null)
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5 px-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            data-testid="sidebar-tags-toggle"
            onClick={() => setTagsOpen(open => !open)}
            aria-expanded={tagsOpen}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
              'text-foreground/60 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              current === 'tags' && currentTagId && 'bg-sidebar-accent text-foreground',
            )}
          >
            <TagIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{t('sidebar.tags')}</span>
            {tags.length > 0 && <span className="text-xs font-normal tabular-nums text-sidebar-foreground">{tags.length}</span>}
            {tagsOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          {onCreateTag && (
            <button
              type="button"
              onClick={openCreateTag}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('tags.addTag')}
              data-testid="sidebar-add-tag"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {tagsOpen && (
          <div className="flex flex-col gap-0.5" data-testid="sidebar-tags-list">
            {tagCreateOpen && (
              <form
                className="flex items-center gap-1 px-2 py-1"
                onSubmit={event => { event.preventDefault(); void createTagFromSidebar(); }}
              >
                <input
                  autoFocus
                  value={tagName}
                  onChange={event => setTagName(event.target.value)}
                  placeholder={t('tags.namePlaceholder')}
                  aria-label={t('tags.namePlaceholder')}
                  className="min-w-0 flex-1 rounded-md bg-muted/70 px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={!tagName.trim() || creatingTag}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-45"
                  aria-label={t('tags.addTag')}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => { setTagCreateOpen(false); setTagName(''); setTagError(''); }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground hover:bg-accent hover:text-foreground"
                  aria-label={t('tags.cancel')}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </form>
            )}
            {tagError && <p role="alert" className="px-2.5 py-1 text-xs text-destructive">{tagError}</p>}
            {tags.length === 0 && !tagCreateOpen ? (
              <button type="button" onClick={openCreateTag} className="px-2.5 py-1.5 text-left text-xs text-sidebar-foreground hover:text-foreground">
                {t('tags.empty')}
              </button>
            ) : tags.map(tag => (
              <button
                type="button"
                key={tag.id}
                data-testid={`sidebar-tag-${tag.id}`}
                onClick={() => onSelect('tags', undefined, tag.id)}
                aria-current={current === 'tags' && currentTagId === tag.id ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 pl-9 text-left text-sm transition-colors',
                  'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  current === 'tags' && currentTagId === tag.id && 'bg-sidebar-accent font-medium text-foreground',
                )}
              >
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', !tag.color && 'bg-primary')}
                  style={tag.color ? { backgroundColor: tag.color } : undefined}
                  aria-hidden="true"
                />
                <span className="truncate">#{tag.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* One idiom for every footer control (D7): ghost, w-full, left-aligned
          icon+label — was 5 different treatments (plain ghost button, an
          outlined pill, a bare label+icon-button row, another outlined
          button, and Logout's own ghost row), and in dark mode the two
          outlined ones (AccentPicker, LanguageSwitcher) were the single
          brightest things in the sidebar — louder than the actual nav. */}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border mx-2 my-2 p-2">
        <Button data-testid="sidebar-settings" type="button" variant="ghost" size="sm" aria-current={current === 'settings' ? 'page' : undefined} onClick={() => onSelect('settings')} className="w-full justify-start gap-2 text-sidebar-foreground"><Settings className="h-4 w-4" aria-hidden="true" />{t('sidebar.settings')}</Button>
        {isAdmin && <Button data-testid="sidebar-admin" type="button" variant="ghost" size="sm" onClick={() => onSelect('admin')} className="w-full justify-start gap-2 text-sidebar-foreground"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t('sidebar.admin')}</Button>}
        <GoogleConnectButton className="w-full justify-start text-sidebar-foreground" />
        {showAppearance && (
          <>
            <AccentPicker side="top" variant="row" />
            <ThemeToggle variant="row" />
            <LanguageSwitcher variant="ghost" />
          </>
        )}
        {onLogout && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="w-full justify-start gap-2 text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('logout', { ns: 'auth' })}
          </Button>
        )}
      </div>
      {onCreateProject && (
        <CreateProjectDialog
          open={createParentId !== undefined}
          parentId={createParentId || undefined}
          parentName={projects.find(project => project.id === createParentId)?.name}
          onClose={() => setCreateParentId(undefined)}
          onCreate={onCreateProject}
        />
      )}
    </nav>
  );
}
