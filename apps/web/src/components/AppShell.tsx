import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, CalendarDays, FolderOpen, BarChart3, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/Sidebar';
import type { SidebarView } from '@/hooks/useApi';
import type { CreateProjectRequest, Project, Tag } from '@mindoist/shared/types';
import { useSyncInvalidation } from '@/hooks/useSyncInvalidation';

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('desktop');
  useEffect(() => {
    const mqMobile = window.matchMedia('(max-width: 767px)');
    const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1279px)');
    const update = () => {
      if (mqMobile.matches) setBp('mobile');
      else if (mqTablet.matches) setBp('tablet');
      else setBp('desktop');
    };
    update();
    mqMobile.addEventListener('change', update);
    mqTablet.addEventListener('change', update);
    return () => {
      mqMobile.removeEventListener('change', update);
      mqTablet.removeEventListener('change', update);
    };
  }, []);
  return bp;
}

interface Props {
  children: React.ReactNode;
  sidebarView: SidebarView;
  currentProjectId?: string;
  currentTagId?: string;
  counts: { inbox: number; today: number; next7: number; overdue: number; completed: number };
  projects: Project[];
  tags?: Tag[];
  onSidebarSelect: (view: SidebarView, projectId?: string, tagId?: string) => void;
  onLogout: () => void;
  onCreateProject?: (request: CreateProjectRequest) => Promise<void>;
  onCreateTag?: (name: string) => Promise<Tag>;
  onMoveProject?: (projectId: string, parentId?: string) => Promise<void>;
  viewTitle: string;
  contentWide?: boolean;
  isAdmin?: boolean;
}

export function AppShell({
  children,
  sidebarView,
  currentProjectId,
  currentTagId,
  counts,
  projects,
  tags = [],
  onSidebarSelect,
  onLogout,
  onCreateProject,
  onCreateTag,
  onMoveProject,
  viewTitle,
  contentWide = false,
  isAdmin = false,
}: Props) {
  const { t } = useTranslation();
  useSyncInvalidation();
  const bp = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Close drawer on navigation (mobile/tablet)
  const handleSidebarSelect = useCallback((view: SidebarView, projectId?: string, tagId?: string) => {
    onSidebarSelect(view, projectId, tagId);
    if (bp !== 'desktop') setDrawerOpen(false);
  }, [onSidebarSelect, bp]);

  // Focus trap for non-desktop drawer
  useEffect(() => {
    if (drawerOpen && bp !== 'desktop') {
      previousFocus.current = document.activeElement as HTMLElement;
      drawerRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setDrawerOpen(false);
          return;
        }
        if (e.key === 'Tab') {
          const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previousFocus.current?.focus();
      };
    }
  }, [drawerOpen, bp]);

  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';

  // Desktop: sidebar always visible; Tablet: drawer overlay; Mobile: bottom nav only
  const showDesktopSidebar = isDesktop;
  const showMobileBottomNav = isMobile;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <a href="#main-content" className="skip-link">{t('tasks:skipToMain')}</a>
      {/* Mobile/Tablet App Bar */}
      {!isDesktop && (
        <header className="relative z-[60] flex items-center justify-between border-b border-border bg-background px-4 h-[var(--shell-appbar-height)] shrink-0">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawerOpen(o => !o)}
              aria-label={t('tasks:toggleSidebar') as string}
              data-testid="menu-toggle"
            >
              {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <h1 className="m-0 text-base font-semibold truncate">{viewTitle}</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('tasks:quickAdd.globalCapture') as string}
            data-testid="global-capture-trigger"
            onClick={() => window.dispatchEvent(new Event('mindoist:global-capture'))}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        {showDesktopSidebar && (
          <Sidebar
            current={sidebarView}
            currentProjectId={currentProjectId}
            currentTagId={currentTagId}
            counts={counts}
            projects={projects}
            tags={tags}
            onSelect={handleSidebarSelect}
            onLogout={onLogout}
            onCreateProject={onCreateProject}
            onCreateTag={onCreateTag}
            onMoveProject={onMoveProject}
            isAdmin={isAdmin}
          />
        )}

        {/* Tablet/mobile drawer overlay */}
        {!isDesktop && (
          <AnimatePresence>
            {drawerOpen && (
              <>
                <motion.div
                  key="drawer-overlay"
                  className="drawer-overlay"
                  data-open="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setDrawerOpen(false)}
                  aria-hidden="true"
                />
                <motion.div
                  ref={drawerRef}
                  tabIndex={-1}
                  className="fixed inset-y-0 left-0 z-50 w-[min(var(--shell-sidebar-width),calc(100vw-3rem))] bg-sidebar border-r border-border"
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('tasks:toggleSidebar') as string}
                >
                  <Sidebar
                    current={sidebarView}
                    currentProjectId={currentProjectId}
                    currentTagId={currentTagId}
                    counts={counts}
                    projects={projects}
                    tags={tags}
                    onSelect={handleSidebarSelect}
                    showAppearance
                    onLogout={onLogout}
                    onCreateProject={onCreateProject}
                    onCreateTag={onCreateTag}
                    onMoveProject={onMoveProject}
                    isAdmin={isAdmin}
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        )}

        {/* Main content area */}
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "flex-1 overflow-y-auto",
            !isDesktop && "p-4",
            isDesktop && "mx-auto w-full px-8 py-4",
            isDesktop && (contentWide ? "max-w-none" : "max-w-[var(--shell-content-max)]"),
          )}
        >
          {isDesktop && <h1 aria-hidden="true" className="sr-only">{viewTitle}</h1>}
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {showMobileBottomNav && (
        <nav
          className="flex items-center justify-around border-t border-border h-[var(--shell-bottomnav-height)] shrink-0 bg-sidebar"
          aria-label={t('tasks:bottomNav.label')}
          data-testid="bottom-nav"
        >
          <BottomNavItem
            icon={CalendarDays}
            label={t('tasks:sidebar.today')}
            active={sidebarView === 'today' && !currentProjectId && !currentTagId}
            onClick={() => handleSidebarSelect('today')}
          />
          <BottomNavItem
            icon={CalendarDays}
            label={t('tasks:sidebar.calendar')}
            active={sidebarView === 'calendar' && !currentProjectId && !currentTagId}
            onClick={() => handleSidebarSelect('calendar')}
          />
          <BottomNavItem
            icon={FolderOpen}
            label={t('tasks:sidebar.projects')}
            active={sidebarView === 'projects' && !currentProjectId && !currentTagId}
            onClick={() => handleSidebarSelect('projects')}
          />
          <BottomNavItem
            icon={BarChart3}
            label={t('tasks:sidebar.review')}
            active={sidebarView === 'summary' && !currentProjectId && !currentTagId}
            onClick={() => handleSidebarSelect('summary')}
          />
        </nav>
      )}
    </div>
  );
}

function BottomNavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] transition-colors cursor-pointer",
        active ? "text-primary font-semibold" : "text-muted-foreground"
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-5 w-5" />
      <span className="truncate max-w-full">{label}</span>
    </button>
  );
}
