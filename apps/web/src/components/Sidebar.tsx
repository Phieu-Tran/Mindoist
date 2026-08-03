import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, CalendarDays, CheckCircle2, FolderOpen, Tag, FileText, ChevronDown, ChevronRight, Calendar, Gift, LogOut, BarChart3, Plus, Settings, Trash2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectColorClass } from '@/lib/project-colors';
import { GoogleConnectButton } from './GoogleConnectButton';
import { AccentPicker } from './AccentPicker';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { CreateProjectDialog, ProjectTypeIcon } from './CreateProjectDialog';
import { Button } from './ui/button';
import type { SidebarView } from '../hooks/useApi';
import type { CreateProjectRequest, Project, Tag as TagType } from '@mindoist/shared/types';

interface NavItem {
  view: SidebarView;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'today', key: 'sidebar.today', icon: CalendarDays },
  { view: 'all', key: 'sidebar.inbox', icon: Inbox },
  { view: 'calendar', key: 'sidebar.calendar', icon: Calendar },
  { view: 'projects', key: 'sidebar.projects', icon: FolderOpen },
];

const MORE_ITEMS: NavItem[] = [
  { view: 'summary', key: 'sidebar.summary', icon: BarChart3 },
  { view: 'completed', key: 'sidebar.completed', icon: CheckCircle2 },
  { view: 'trashed', key: 'sidebar.trashed', icon: Trash2 },
  { view: 'notes', key: 'sidebar.notes', icon: FileText },
  { view: 'countdown', key: 'sidebar.countdown', icon: Gift },
  { view: 'settings', key: 'sidebar.settings', icon: Settings },
  { view: 'admin', key: 'sidebar.admin', icon: ShieldCheck },
];

interface Props {
  current: SidebarView;
  currentProjectId?: string;
  currentTagId?: string;
  counts: { inbox: number; today: number; next7: number; overdue: number; completed: number };
  projects: Project[];
  tags: TagType[];
  onSelect: (view: SidebarView, projectId?: string, tagId?: string) => void;
  className?: string;
  showAppearance?: boolean;
  onLogout?: () => void;
  onCreateProject?: (request: CreateProjectRequest) => Promise<void>;
  onMoveProject?: (projectId: string, parentId?: string) => Promise<void>;
  onCreateTag?: (name: string) => Promise<void>;
  hiddenNavItems?: SidebarView[];
  isAdmin?: boolean;
}

const PROJECT_INDENTS = ['pl-9', 'pl-12', 'pl-16', 'pl-20', 'pl-24'];

export function Sidebar({ current, currentProjectId, currentTagId, counts, projects, tags, onSelect, className, showAppearance = true, onLogout, onCreateProject, onMoveProject, onCreateTag, hiddenNavItems = [], isAdmin = false }: Props) {
  const { t } = useTranslation('tasks');
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  const hiddenSet = new Set(hiddenNavItems);
  // Direction B keeps the four core destinations stable. User visibility
  // preferences only apply to optional destinations in More.
  const visibleNavItems = NAV_ITEMS;

  const countMap = counts;
  const projectIds = new Set(projects.map(project => project.id));

  const openCreateProject = (parentId: string | null) => {
    setProjectsOpen(true);
    setCreateParentId(parentId);
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
        <img src="/favicon.svg" alt="" className="h-6 w-6 shrink-0 rounded-chip" aria-hidden="true" />
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">
          {t('app.title', { ns: 'common' })}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 p-2">
        {visibleNavItems.map(item => {
          const Icon = item.icon;
          const isActive = current === item.view && !currentProjectId && !currentTagId;
          const count = item.view === 'all' ? countMap.inbox : countMap[item.view as keyof typeof countMap];
          return (
            <button
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
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{t(item.key)}</span>
              {item.view !== 'completed' && count > 0 && (
                <span className="text-xs tabular-nums text-sidebar-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-border mx-2 my-1" />

      <div className="px-4 pt-1 text-xs font-medium text-sidebar-foreground">{t('sidebar.more')}</div>
      <div className="flex flex-col gap-0.5 p-2">
        {MORE_ITEMS.filter(item => !hiddenSet.has(item.view) && (item.view !== 'admin' || isAdmin)).map(item => {
          const Icon = item.icon;
          const isActive = current === item.view && !currentProjectId && !currentTagId;
          return <div key={item.view}>
            {item.view === 'completed' && <p className="mb-0.5 px-2.5 pt-2 text-xs font-medium text-sidebar-foreground">{t('sidebar.history')}</p>}
            <button data-testid={`sidebar-${item.view}`} onClick={() => onSelect(item.view)} aria-current={isActive ? 'page' : undefined} className={cn("flex min-h-11 items-center gap-2.5 w-full text-left px-2.5 py-2 text-sm rounded-lg transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", isActive && "bg-sidebar-accent font-semibold text-foreground")}><Icon className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{t(item.key)}</span></button>
          </div>;
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

      <div className="flex flex-col gap-0.5 px-2 mt-1">
        <div className="flex items-center gap-0.5">
          <button
            data-testid="sidebar-tags-toggle"
            onClick={() => setTagsOpen(o => !o)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left px-2.5 py-2 text-sm font-medium text-foreground/60 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Tag className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{t('sidebar.tags')}</span>
            {tagsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {onCreateTag && (
            <button
              type="button"
              onClick={() => { setTagsOpen(true); setCreatingTag(true); }}
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
            {creatingTag && onCreateTag && (
              <input
                autoFocus
                data-testid="sidebar-new-tag-input"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onBlur={() => { if (!newTagName.trim()) setCreatingTag(false); }}
                onKeyDown={async e => {
                  if (e.key === 'Escape') { setCreatingTag(false); setNewTagName(''); return; }
                  if (e.key !== 'Enter') return;
                  const name = newTagName.trim();
                  if (!name) { setCreatingTag(false); return; }
                  try {
                    await onCreateTag(name);
                    setNewTagName('');
                    setCreatingTag(false);
                  } catch {
                    // Keep the input open with the typed name so the user can retry.
                  }
                }}
                placeholder={t('tags.namePlaceholder')}
                className="mx-2.5 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
            {tags.length === 0 && !creatingTag ? (
              <span className="px-2.5 py-1.5 text-xs text-sidebar-foreground italic">{t('list.empty')}</span>
            ) : (
              tags.map(tag => (
                <button
                  key={tag.id}
                  data-testid={`sidebar-tag-${tag.id}`}
                  onClick={() => onSelect('tags', undefined, tag.id)}
                  aria-current={current === 'tags' && currentTagId === tag.id ? 'page' : undefined}
                  className={cn(
                    "flex items-center gap-2.5 w-full text-left pl-9 pr-2.5 py-1.5 text-sm rounded-lg transition-colors cursor-pointer",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    current === 'tags' && currentTagId === tag.id && "bg-sidebar-accent font-semibold text-foreground"
                  )}
                >
                  <span className="truncate">#{tag.name}</span>
                </button>
              ))
            )}
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
