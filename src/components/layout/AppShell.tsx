import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Blocks,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileUp,
  FolderGit2,
  FolderKanban,
  FolderPlus,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProjectRecord } from '../../types/workflow';
import { CroxLogo } from '../brand/CroxLogo';

export type AppRoute =
  | 'dashboard'
  | 'projects'
  | 'workflows'
  | 'templates'
  | 'credentials'
  | 'ai-providers'
  | 'integrations'
  | 'executions'
  | 'insights'
  | 'settings'
  | 'editor';

interface AppShellProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenNova: () => void;
  onQuickCreateWorkflow: () => void;
  onOpenQuickSearch: () => void;
  onOpenCreateProject?: () => void;
  onOpenImportModal?: () => void;
  projects?: ProjectRecord[];
  selectedProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: Exclude<AppRoute, 'editor'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'workflows', label: 'Workflows', icon: FolderGit2 },
  { id: 'templates', label: 'Templates', icon: LayoutGrid },
  { id: 'credentials', label: 'Credentials', icon: KeyRound },
  { id: 'ai-providers', label: 'AI Providers', icon: Cpu },
  { id: 'integrations', label: 'Integrations', icon: Blocks },
  { id: 'executions', label: 'Executions', icon: Activity },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeRoute,
  onNavigate,
  onOpenNova,
  onQuickCreateWorkflow,
  onOpenQuickSearch,
  onOpenCreateProject,
  onOpenImportModal,
  projects = [],
  selectedProjectId = '',
  onSelectProject,
  children,
}) => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const initials = (user?.fullName || 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const activeProjects = projects.filter((p) => !p.isArchived);

  const renderNavButton = (
    item: { id: Exclude<AppRoute, 'editor'>; label: string; icon: React.ComponentType<{ className?: string }> },
    isMobile: boolean
  ) => {
    const Icon = item.icon;
    const isActive =
      activeRoute === item.id || (activeRoute === 'editor' && item.id === 'workflows');
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onNavigate(item.id);
          if (isMobile) setMobileOpen(false);
        }}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 whitespace-nowrap ${
          isActive
            ? 'bg-zinc-800 text-white'
            : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
        }`}
        title={collapsed && !isMobile ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#E11D48]' : 'text-zinc-400'}`} />
        {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  const renderSidebarTopControls = (isMobile: boolean) => (
    <div className="px-3 pt-3 pb-2.5 space-y-2.5 border-b border-zinc-800/80">
      {/* + New Action Dropdown & Global Search */}
      <div className="relative" ref={!isMobile ? newMenuRef : undefined}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setNewMenuOpen((v) => !v)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold transition-colors whitespace-nowrap ${
              collapsed && !isMobile ? 'px-0' : ''
            }`}
            title="Create New..."
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            {(!collapsed || isMobile) && (
              <>
                <span>New</span>
                <ChevronDown className="w-3 h-3 ml-auto opacity-85" />
              </>
            )}
          </button>

          {(!collapsed || isMobile) && (
            <button
              type="button"
              onClick={onOpenQuickSearch}
              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700/70 transition-colors"
              title="Global Search (Ctrl+K)"
              aria-label="Global search"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {newMenuOpen && (!collapsed || isMobile) && (
          <div className="absolute left-0 right-0 mt-1.5 rounded-lg bg-zinc-900 border border-zinc-700 shadow-2xl py-1 z-40 text-xs">
            <button
              type="button"
              onClick={() => {
                setNewMenuOpen(false);
                onQuickCreateWorkflow();
                if (isMobile) setMobileOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2.5"
            >
              <Workflow className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>New Workflow</span>
            </button>
            {onOpenCreateProject && (
              <button
                type="button"
                onClick={() => {
                  setNewMenuOpen(false);
                  onOpenCreateProject();
                  if (isMobile) setMobileOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2.5"
              >
                <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
                <span>New Project</span>
              </button>
            )}
            {onOpenImportModal && (
              <button
                type="button"
                onClick={() => {
                  setNewMenuOpen(false);
                  onOpenImportModal();
                  if (isMobile) setMobileOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2.5"
              >
                <FileUp className="w-3.5 h-3.5 text-zinc-400" />
                <span>Import Workflow JSON</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setNewMenuOpen(false);
                onNavigate('templates');
                if (isMobile) setMobileOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800 flex items-center gap-2.5"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-zinc-400" />
              <span>Create from Template</span>
            </button>
          </div>
        )}
      </div>

      {/* Workspace / Project Selector */}
      {(!collapsed || isMobile) && activeProjects.length > 0 && onSelectProject && (
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1 px-0.5">
            Workspace / Project
          </label>
          <select
            aria-label="Active Project Scope"
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 focus:outline-none focus:border-[#E11D48]"
          >
            <option value="">All Projects</option>
            {activeProjects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name} {proj.isDefault ? '(Personal)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  const renderNavSections = (isMobile = false) => (
    <div className="flex-1 flex flex-col justify-between py-2.5 px-2.5 overflow-y-auto">
      <nav aria-label="Main navigation" className="space-y-0.5">
        {NAV_ITEMS.map((item) => renderNavButton(item, isMobile))}
      </nav>

      <div className="pt-2.5 mt-2.5 border-t border-zinc-800 space-y-1">
        <button
          type="button"
          onClick={() => {
            onOpenNova();
            if (isMobile) setMobileOpen(false);
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-zinc-200 bg-zinc-800/75 hover:bg-zinc-800 border border-zinc-700/70 transition-colors whitespace-nowrap"
          title={collapsed && !isMobile ? 'NOVA AI Builder' : undefined}
        >
          <Sparkles className="w-4 h-4 shrink-0 text-[#E11D48]" />
          {(!collapsed || isMobile) && <span className="truncate">AI Builder (NOVA)</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#FAFAFA] dark:bg-[#0D0D0F] text-zinc-900 dark:text-zinc-100">
      {/* Desktop Compact Charcoal Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-[#141416] text-zinc-300 border-r border-zinc-800 transition-all duration-150 ${
          collapsed ? 'w-[64px]' : 'w-[228px]'
        }`}
      >
        <div className="h-13 px-3 flex items-center justify-between border-b border-zinc-800">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center focus:outline-none rounded-md"
          >
            <CroxLogo showWordmark={!collapsed} size="sm" variant="light" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {renderSidebarTopControls(false)}
        {renderNavSections(false)}

        {/* User Avatar Footer + Popover */}
        <div className="p-2.5 border-t border-zinc-800 relative" ref={userMenuRef}>
          {userMenuOpen && (
            <div className="absolute bottom-full left-2.5 right-2.5 mb-2 rounded-lg bg-zinc-900 border border-zinc-700 shadow-2xl py-1 z-30">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  onNavigate('settings');
                }}
                className="w-full px-3 py-2 text-left text-xs font-medium text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
              >
                <Settings className="w-3.5 h-3.5 text-zinc-400" />
                <span>Account Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  void logout();
                }}
                className="w-full px-3 py-2 text-left text-xs font-medium text-rose-400 hover:bg-zinc-800 flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            className={`w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-zinc-800/80 transition-colors text-left ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <div className="w-7 h-7 rounded-md bg-[#E11D48] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{user?.fullName}</p>
                <p className="text-[11px] text-zinc-400 truncate">{user?.email}</p>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[#141416] text-zinc-300 border-r border-zinc-800 flex flex-col z-10">
            <div className="h-13 px-4 flex items-center justify-between border-b border-zinc-800">
              <CroxLogo size="sm" variant="light" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderSidebarTopControls(true)}
            {renderNavSections(true)}
            <div className="p-3 border-t border-zinc-800 space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[#E11D48] text-white text-xs font-semibold flex items-center justify-center">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{user?.fullName}</p>
                  <p className="text-[11px] text-zinc-400 truncate">{user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-13 px-3.5 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416]">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-zinc-700 dark:text-zinc-300"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <CroxLogo size="sm" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenQuickSearch}
              className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onQuickCreateWorkflow}
              className="p-1.5 rounded-lg text-[#E11D48]"
              aria-label="New workflow"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      </div>
    </div>
  );
};
