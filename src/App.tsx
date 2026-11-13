import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Blocks,
  Cpu,
  FileUp,
  FolderKanban,
  GitBranch,
  KeyRound,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { CroxLoader } from './components/brand/CroxLogo';
import { AppRoute, AppShell } from './components/layout/AppShell';
import { NovaAssistant } from './components/nova/NovaAssistant';
import { NewWorkflowModal } from './components/workflows/NewWorkflowModal';
import { NODE_CATALOG } from './constants/nodeCatalog';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AiProvidersPage } from './pages/AiProvidersPage';
import { AuthMode, AuthPage } from './pages/AuthPage';
import { CredentialsPage } from './pages/CredentialsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { InsightsPage } from './pages/InsightsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { LandingPage } from './pages/LandingPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { WorkflowEditorPage } from './pages/WorkflowEditorPage';
import { api } from './services/api';
import {
  AiProviderConfigRecord,
  CredentialRecord,
  IntegrationDefinition,
  NovaGenerationResult,
  ProjectRecord,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRecord,
  WorkflowTemplate,
} from './types/workflow';

const RECENT_SEARCH_STORAGE_KEY = 'crox_recent_search_items';

interface SearchResultItem {
  id: string;
  group: 'Actions' | 'Recent' | 'Workflows' | 'Projects' | 'Nodes' | 'Integrations' | 'AI Providers' | 'Credentials' | 'Templates' | 'Pages';
  title: string;
  subtitle: string;
  badge?: string;
  run: () => void | Promise<void>;
}

interface StoredRecentItem {
  id: string;
  title: string;
  subtitle: string;
  route: AppRoute;
  workflowId?: string;
  projectId?: string;
}

function readRecentSearches(): StoredRecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredRecentItem[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(item: StoredRecentItem): StoredRecentItem[] {
  const prev = readRecentSearches().filter((x) => x.id !== item.id);
  const next = [item, ...prev].slice(0, 5);
  try {
    localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

type ParsedRoute =
  | { view: 'landing' }
  | { view: 'auth'; mode: AuthMode }
  | { view: 'app'; appRoute: AppRoute; workflowId?: string; projectId?: string };

function parseLocation(pathname: string, search: string): ParsedRoute {
  const params = new URLSearchParams(search);
  if (params.get('reset_token')) {
    return { view: 'auth', mode: 'reset' };
  }

  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return { view: 'landing' };
  if (clean === '/login') return { view: 'auth', mode: 'login' };
  if (clean === '/signup') return { view: 'auth', mode: 'register' };
  if (clean === '/dashboard') return { view: 'app', appRoute: 'dashboard' };
  if (clean === '/projects') return { view: 'app', appRoute: 'projects' };
  if (clean.startsWith('/projects/')) {
    const pid = decodeURIComponent(clean.slice('/projects/'.length));
    if (pid) return { view: 'app', appRoute: 'workflows', projectId: pid };
    return { view: 'app', appRoute: 'projects' };
  }
  if (clean === '/workflows') return { view: 'app', appRoute: 'workflows' };
  if (clean.startsWith('/workflows/')) {
    const id = decodeURIComponent(clean.slice('/workflows/'.length));
    if (id) return { view: 'app', appRoute: 'editor', workflowId: id };
    return { view: 'app', appRoute: 'workflows' };
  }
  if (clean === '/templates') return { view: 'app', appRoute: 'templates' };
  if (clean === '/ai-providers') return { view: 'app', appRoute: 'ai-providers' };
  if (clean === '/integrations') return { view: 'app', appRoute: 'integrations' };
  if (clean === '/credentials') return { view: 'app', appRoute: 'credentials' };
  if (clean === '/executions') return { view: 'app', appRoute: 'executions' };
  if (clean === '/insights') return { view: 'app', appRoute: 'insights' };
  if (clean === '/settings') return { view: 'app', appRoute: 'settings' };

  return { view: 'landing' };
}

function buildPath(
  view: 'landing' | 'auth' | 'app',
  authMode: AuthMode,
  appRoute: AppRoute,
  workflowId: string | null,
  projectId?: string
): string {
  if (view === 'landing') return '/';
  if (view === 'auth') return authMode === 'register' ? '/signup' : '/login';
  switch (appRoute) {
    case 'editor':
      return workflowId ? `/workflows/${encodeURIComponent(workflowId)}` : '/workflows';
    case 'projects':
      return '/projects';
    case 'workflows':
      return projectId ? `/projects/${encodeURIComponent(projectId)}` : '/workflows';
    case 'templates':
      return '/templates';
    case 'ai-providers':
      return '/ai-providers';
    case 'integrations':
      return '/integrations';
    case 'credentials':
      return '/credentials';
    case 'executions':
      return '/executions';
    case 'insights':
      return '/insights';
    case 'settings':
      return '/settings';
    default:
      return '/dashboard';
  }
}

function CroxRouter() {
  const { user, loading } = useAuth();

  const initial = parseLocation(window.location.pathname, window.location.search);

  const [view, setView] = useState<'landing' | 'auth' | 'app'>(initial.view);
  const [authMode, setAuthMode] = useState<AuthMode>(
    initial.view === 'auth' ? initial.mode : 'login'
  );
  const [resetToken, setResetToken] = useState(() =>
    new URLSearchParams(window.location.search).get('reset_token') || ''
  );
  const [appRoute, setAppRoute] = useState<AppRoute>(
    initial.view === 'app' ? initial.appRoute : 'dashboard'
  );
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(
    initial.view === 'app' ? initial.workflowId || null : null
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initial.view === 'app' ? initial.projectId || '' : ''
  );
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const [novaOpen, setNovaOpen] = useState(false);
  const [editorPatch, setEditorPatch] = useState<{
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    name?: string;
  } | null>(null);

  // Quick Search Command Palette state
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [quickSearchIndex, setQuickSearchIndex] = useState(0);
  const [searchWorkflows, setSearchWorkflows] = useState<WorkflowRecord[]>([]);
  const [searchTemplates, setSearchTemplates] = useState<WorkflowTemplate[]>([]);
  const [searchIntegrations, setSearchIntegrations] = useState<IntegrationDefinition[]>([]);
  const [searchProviders, setSearchProviders] = useState<AiProviderConfigRecord[]>([]);
  const [searchCredentials, setSearchCredentials] = useState<CredentialRecord[]>([]);
  const [recentSearches, setRecentSearches] = useState<StoredRecentItem[]>(() => readRecentSearches());
  const [searchLoading, setSearchLoading] = useState(false);

  // Structured New Workflow modal
  const [newWorkflowOpen, setNewWorkflowOpen] = useState(false);

  // Import Workflow JSON modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Quick New Project modal
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const loadProjects = useCallback(() => {
    if (!user) return;
    api.projects
      .list()
      .then((res) => setProjects(res.projects))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const pushRoute = useCallback(
    (
      nextView: 'landing' | 'auth' | 'app',
      nextAuthMode: AuthMode,
      nextAppRoute: AppRoute,
      nextWorkflowId: string | null = null,
      replace = false,
      nextProjectId = selectedProjectId
    ) => {
      setView(nextView);
      setAuthMode(nextAuthMode);
      setAppRoute(nextAppRoute);
      setActiveWorkflowId(nextWorkflowId);
      const targetPath = buildPath(nextView, nextAuthMode, nextAppRoute, nextWorkflowId, nextProjectId);
      if (window.location.pathname !== targetPath) {
        if (replace) {
          window.history.replaceState(null, '', targetPath);
        } else {
          window.history.pushState(null, '', targetPath);
        }
      }
    },
    [selectedProjectId]
  );

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseLocation(window.location.pathname, window.location.search);
      if (parsed.view === 'landing') {
        setView('landing');
      } else if (parsed.view === 'auth') {
        setAuthMode(parsed.mode);
        setView('auth');
      } else {
        setAppRoute(parsed.appRoute);
        setActiveWorkflowId(parsed.workflowId || null);
        if (parsed.projectId !== undefined) {
          setSelectedProjectId(parsed.projectId || '');
        }
        setView('app');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      setResetToken(token);
      setAuthMode('reset');
      setView('auth');
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      if (pendingTemplateId) {
        const tplId = pendingTemplateId;
        setPendingTemplateId(null);
        api.templates
          .install(tplId)
          .then((res) => {
            pushRoute('app', 'login', 'editor', res.workflow.id, true);
          })
          .catch(() => {
            pushRoute('app', 'login', 'templates', null, true);
          });
      } else if (view === 'auth' && authMode !== 'reset') {
        pushRoute('app', 'login', 'dashboard', null, true);
      }
    }
  }, [loading, user, view, authMode, pendingTemplateId, pushRoute]);

  useEffect(() => {
    if (!loading && !user && view === 'app') {
      pushRoute('auth', 'login', 'dashboard', null, true);
    }
  }, [loading, user, view, pushRoute]);

  const openQuickSearch = useCallback(() => {
    setQuickSearchOpen(true);
    setQuickSearchQuery('');
    setQuickSearchIndex(0);
    setSearchLoading(true);
    Promise.all([
      api.workflows.list().catch(() => ({ workflows: [] as WorkflowRecord[] })),
      api.templates.list().catch(() => ({ templates: [] as WorkflowTemplate[] })),
      api.integrations.list().catch(() => ({ integrations: [] as IntegrationDefinition[], connections: [] })),
      api.aiProviders.list().catch(() => ({ providers: [] as AiProviderConfigRecord[] })),
      api.credentials.list().catch(() => ({ credentials: [] as CredentialRecord[] })),
    ])
      .then(([wfRes, tplRes, intRes, provRes, credRes]) => {
        setSearchWorkflows(wfRes.workflows);
        setSearchTemplates(tplRes.templates);
        setSearchIntegrations(intRes.integrations);
        setSearchProviders(provRes.providers);
        setSearchCredentials(credRes.credentials);
      })
      .finally(() => setSearchLoading(false));
  }, []);

  useEffect(() => {
    if (view !== 'app' || !user) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openQuickSearch();
      } else if (e.key === 'Escape') {
        setQuickSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, user, openQuickSearch]);

  const openWorkflow = useCallback(
    (workflowId: string) => {
      pushRoute('app', authMode, 'editor', workflowId);
    },
    [authMode, pushRoute]
  );

  const navigateApp = useCallback(
    (route: AppRoute) => {
      pushRoute('app', authMode, route, null);
    },
    [authMode, pushRoute]
  );

  const searchItems = useMemo<SearchResultItem[]>(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    const items: SearchResultItem[] = [];

    if (!q) {
      items.push({
        id: 'action-new-workflow',
        group: 'Actions',
        title: 'Create new workflow',
        subtitle: 'Open workflow builder modal (blank, agent, orchestrator, webhook)',
        badge: 'Action',
        run: () => setNewWorkflowOpen(true),
      });
      items.push({
        id: 'action-nova',
        group: 'Actions',
        title: 'Describe workflow with NOVA AI',
        subtitle: 'Generate a multi-node graph from plain English',
        badge: 'AI',
        run: () => setNovaOpen(true),
      });

      recentSearches.forEach((recent) => {
        items.push({
          id: `recent-${recent.id}`,
          group: 'Recent',
          title: recent.title,
          subtitle: recent.subtitle,
          badge: 'Recent',
          run: () => {
            if (recent.workflowId) {
              openWorkflow(recent.workflowId);
            } else if (recent.projectId) {
              setSelectedProjectId(recent.projectId);
              pushRoute('app', authMode, 'workflows', null, false, recent.projectId);
            } else {
              navigateApp(recent.route);
            }
          },
        });
      });
    }

    const pages: Array<{ id: AppRoute; title: string; subtitle: string }> = [
      { id: 'dashboard', title: 'Overview', subtitle: 'Workspace dashboard & KPI metrics' },
      { id: 'projects', title: 'Projects', subtitle: 'Organize workflows into team folders' },
      { id: 'workflows', title: 'Workflows', subtitle: 'All saved automation pipelines' },
      { id: 'ai-providers', title: 'AI Providers & Models', subtitle: 'Multi-key vault, model discovery & backup failover' },
      { id: 'integrations', title: 'Integrations Directory', subtitle: 'Slack, GitHub, Notion, Jira, HubSpot & more' },
      { id: 'credentials', title: 'Credentials Vault', subtitle: 'Encrypted API keys, OAuth2 & SMTP configs' },
      { id: 'templates', title: 'Templates', subtitle: 'Ready-made multi-node automation blueprints' },
      { id: 'executions', title: 'Executions', subtitle: 'Run logs, latencies & trace outputs' },
      { id: 'insights', title: 'Insights', subtitle: 'Success rate & reliability metrics' },
      { id: 'settings', title: 'Settings', subtitle: 'Profile, theme, timezone & security' },
    ];

    pages
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q))
      .slice(0, q ? 4 : 3)
      .forEach((p) => {
        items.push({
          id: `page-${p.id}`,
          group: 'Pages',
          title: p.title,
          subtitle: p.subtitle,
          badge: 'Page',
          run: () => {
            setRecentSearches(saveRecentSearch({ id: `page-${p.id}`, title: p.title, subtitle: p.subtitle, route: p.id }));
            navigateApp(p.id);
          },
        });
      });

    searchWorkflows
      .filter((w) => !q || w.name.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q))
      .slice(0, 6)
      .forEach((wf) => {
        items.push({
          id: `wf-${wf.id}`,
          group: 'Workflows',
          title: wf.name,
          subtitle: wf.description || `${wf.nodes.length} nodes`,
          badge: wf.isActive ? 'Published' : 'Draft',
          run: () => {
            setRecentSearches(
              saveRecentSearch({
                id: `wf-${wf.id}`,
                title: wf.name,
                subtitle: `${wf.nodes.length} nodes`,
                route: 'editor',
                workflowId: wf.id,
              })
            );
            openWorkflow(wf.id);
          },
        });
      });

    projects
      .filter((p) => !p.isArchived && (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)))
      .slice(0, 4)
      .forEach((proj) => {
        items.push({
          id: `proj-${proj.id}`,
          group: 'Projects',
          title: proj.name,
          subtitle: proj.description || `${proj.workflowCount ?? 0} workflows`,
          badge: 'Project',
          run: () => {
            setRecentSearches(
              saveRecentSearch({
                id: `proj-${proj.id}`,
                title: proj.name,
                subtitle: proj.description || 'Project folder',
                route: 'workflows',
                projectId: proj.id,
              })
            );
            setSelectedProjectId(proj.id);
            pushRoute('app', authMode, 'workflows', null, false, proj.id);
          },
        });
      });

    if (q) {
      NODE_CATALOG.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.shortDescription.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q)
      )
        .slice(0, 5)
        .forEach((node) => {
          items.push({
            id: `node-${node.type}`,
            group: 'Nodes',
            title: node.label,
            subtitle: node.shortDescription,
            badge: node.category,
            run: () => setNewWorkflowOpen(true),
          });
        });

      searchIntegrations
        .filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.appId.toLowerCase().includes(q))
        .slice(0, 4)
        .forEach((app) => {
          items.push({
            id: `int-${app.appId}`,
            group: 'Integrations',
            title: app.name,
            subtitle: app.description,
            badge: app.availability === 'available' ? 'Available' : app.availability === 'requires_credentials' ? 'Requires credentials' : 'Coming soon',
            run: () => navigateApp('integrations'),
          });
        });

      searchProviders
        .filter(
          (p) =>
            p.displayName.toLowerCase().includes(q) ||
            p.providerId.toLowerCase().includes(q) ||
            p.discoveredModels.some((m) => m.id.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q))
        )
        .slice(0, 4)
        .forEach((prov) => {
          items.push({
            id: `prov-${prov.providerId}`,
            group: 'AI Providers',
            title: prov.displayName,
            subtitle: `${prov.keys.length} configured keys · Default ${prov.defaultModel}`,
            badge: prov.isPrimary ? 'Primary' : 'Provider',
            run: () => navigateApp('ai-providers'),
          });
        });

      searchCredentials
        .filter((c) => c.label.toLowerCase().includes(q) || c.type.toLowerCase().includes(q))
        .slice(0, 4)
        .forEach((cred) => {
          items.push({
            id: `cred-${cred.id}`,
            group: 'Credentials',
            title: cred.label,
            subtitle: `${cred.type} · ${cred.maskedPreview}`,
            badge: cred.isEnabled === false ? 'Disabled' : 'Active',
            run: () => navigateApp('credentials'),
          });
        });
    }

    searchTemplates
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((tpl) => {
        items.push({
          id: `tpl-${tpl.id}`,
          group: 'Templates',
          title: tpl.name,
          subtitle: tpl.category,
          badge: 'Install',
          run: async () => {
            const res = await api.templates.install(tpl.id, selectedProjectId || undefined);
            openWorkflow(res.workflow.id);
          },
        });
      });

    return items;
  }, [
    authMode,
    navigateApp,
    openWorkflow,
    projects,
    pushRoute,
    quickSearchQuery,
    recentSearches,
    searchCredentials,
    searchIntegrations,
    searchProviders,
    searchTemplates,
    searchWorkflows,
    selectedProjectId,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#0D0D0F]">
        <CroxLoader label="Loading CROX workspace..." />
      </div>
    );
  }

  const handleCreateStructuredWorkflow = async (payload: {
    name: string;
    description: string;
    projectId?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  }) => {
    const res = await api.workflows.create({
      name: payload.name,
      description: payload.description,
      projectId: payload.projectId || selectedProjectId || undefined,
      nodes: payload.nodes,
      edges: payload.edges,
    });
    openWorkflow(res.workflow.id);
  };

  const handleUseTemplateFromLanding = async (templateId: string) => {
    if (!user) {
      setPendingTemplateId(templateId);
      pushRoute('auth', 'register', 'dashboard', null);
      return;
    }
    const res = await api.templates.install(templateId);
    openWorkflow(res.workflow.id);
  };

  const handleNovaOpenInEditor = async (generated: NovaGenerationResult) => {
    if (appRoute === 'editor' && activeWorkflowId) {
      setEditorPatch({
        name: generated.name,
        nodes: generated.nodes,
        edges: generated.edges,
      });
      return;
    }
    const res = await api.workflows.create({
      name: generated.name,
      description: generated.description,
      ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
      nodes: generated.nodes,
      edges: generated.edges,
    });
    openWorkflow(res.workflow.id);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJsonText);
    } catch {
      setImportError('Invalid JSON payload. Paste a valid exported CROX workflow JSON object.');
      return;
    }
    setImporting(true);
    try {
      const res = await api.workflows.importJson(parsed, selectedProjectId || undefined);
      setImportModalOpen(false);
      setImportJsonText('');
      openWorkflow(res.workflow.id);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import workflow.');
    } finally {
      setImporting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await api.projects.create({
        name: projectName.trim(),
        description: projectDesc.trim(),
      });
      setProjectModalOpen(false);
      setProjectName('');
      setProjectDesc('');
      loadProjects();
      setSelectedProjectId(res.project.id);
      pushRoute('app', authMode, 'workflows', null, false, res.project.id);
    } finally {
      setCreatingProject(false);
    }
  };

  if (view === 'landing') {
    return (
      <LandingPage
        onNavigateAuth={(mode) => {
          pushRoute('auth', mode, 'dashboard', null);
        }}
        onEnterDashboard={() => {
          navigateApp('dashboard');
        }}
        onUseTemplate={(tplId) => void handleUseTemplateFromLanding(tplId)}
      />
    );
  }

  if (view === 'auth' || !user) {
    return (
      <AuthPage
        initialMode={authMode}
        initialResetToken={resetToken}
        onBackToLanding={() => pushRoute('landing', 'login', 'dashboard', null)}
        onSuccess={() => {
          navigateApp('dashboard');
        }}
      />
    );
  }

  // Full-screen Workflow Editor
  if (appRoute === 'editor' && activeWorkflowId) {
    return (
      <>
        <WorkflowEditorPage
          workflowId={activeWorkflowId}
          projects={projects}
          onBack={() => navigateApp('dashboard')}
          onOpenWorkflow={openWorkflow}
          externalNodesPatch={editorPatch}
          onClearExternalPatch={() => setEditorPatch(null)}
        />
        <NovaAssistant
          open={novaOpen}
          onClose={() => setNovaOpen(false)}
          onOpenOpenInEditor={handleNovaOpenInEditor}
          contextLabel="Apply Workflow to Canvas"
        />
      </>
    );
  }

  return (
    <>
      <AppShell
        activeRoute={appRoute}
        onNavigate={navigateApp}
        onOpenNova={() => setNovaOpen(true)}
        onQuickCreateWorkflow={() => setNewWorkflowOpen(true)}
        onOpenQuickSearch={openQuickSearch}
        onOpenCreateProject={() => setProjectModalOpen(true)}
        onOpenImportModal={() => {
          setImportError(null);
          setImportModalOpen(true);
        }}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(pid) => {
          setSelectedProjectId(pid);
          if (appRoute === 'workflows') {
            pushRoute('app', authMode, 'workflows', null, false, pid);
          }
        }}
      >
        {appRoute === 'dashboard' && (
          <DashboardPage
            title="Overview"
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onOpenWorkflow={openWorkflow}
            onExploreTemplates={() => navigateApp('templates')}
            onOpenNewWorkflowModal={() => setNewWorkflowOpen(true)}
            onOpenImportModal={() => {
              setImportError(null);
              setImportModalOpen(true);
            }}
          />
        )}

        {appRoute === 'projects' && (
          <ProjectsPage
            onOpenProjectWorkflows={(pid) => {
              setSelectedProjectId(pid);
              pushRoute('app', authMode, 'workflows', null, false, pid);
            }}
            onProjectsChanged={loadProjects}
          />
        )}

        {appRoute === 'workflows' && (
          <DashboardPage
            title="Workflows"
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={(pid) => {
              setSelectedProjectId(pid);
              pushRoute('app', authMode, 'workflows', null, false, pid);
            }}
            onOpenWorkflow={openWorkflow}
            onExploreTemplates={() => navigateApp('templates')}
            onOpenNewWorkflowModal={() => setNewWorkflowOpen(true)}
            onOpenImportModal={() => {
              setImportError(null);
              setImportModalOpen(true);
            }}
          />
        )}

        {appRoute === 'templates' && (
          <TemplatesPage
            selectedProjectId={selectedProjectId}
            onInstalled={openWorkflow}
          />
        )}
        {appRoute === 'ai-providers' && <AiProvidersPage />}
        {appRoute === 'integrations' && <IntegrationsPage />}
        {appRoute === 'credentials' && <CredentialsPage />}
        {appRoute === 'executions' && <ExecutionsPage />}
        {appRoute === 'insights' && <InsightsPage onOpenWorkflow={openWorkflow} />}
        {appRoute === 'settings' && (
          <SettingsPage onOpenAiProviders={() => navigateApp('ai-providers')} />
        )}
      </AppShell>

      <NovaAssistant
        open={novaOpen}
        onClose={() => setNovaOpen(false)}
        onOpenOpenInEditor={handleNovaOpenInEditor}
        contextLabel="Open in Workflow Editor"
      />

      <NewWorkflowModal
        open={newWorkflowOpen}
        projects={projects}
        defaultProjectId={selectedProjectId}
        onClose={() => setNewWorkflowOpen(false)}
        onCreate={handleCreateStructuredWorkflow}
      />

      {/* Quick Search / Command Palette Modal */}
      {quickSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-zinc-950/60 backdrop-blur-[2px]"
          onClick={() => setQuickSearchOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={quickSearchQuery}
                onChange={(e) => {
                  setQuickSearchQuery(e.target.value);
                  setQuickSearchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setQuickSearchIndex((prev) =>
                      searchItems.length ? (prev + 1) % searchItems.length : 0
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setQuickSearchIndex((prev) =>
                      searchItems.length ? (prev - 1 + searchItems.length) % searchItems.length : 0
                    );
                  } else if (e.key === 'Enter' && searchItems[quickSearchIndex]) {
                    e.preventDefault();
                    const picked = searchItems[quickSearchIndex];
                    setQuickSearchOpen(false);
                    void picked.run();
                  }
                }}
                placeholder="Search workflows, nodes, AI providers, integrations, credentials..."
                className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
              />
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-[10px] font-mono text-zinc-400">
                ↑↓ Enter
              </kbd>
              <button
                type="button"
                onClick={() => setQuickSearchOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-2 space-y-1">
              {searchLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
                </div>
              ) : searchItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No results match &ldquo;{quickSearchQuery}&rdquo;.
                </div>
              ) : (
                searchItems.map((item, idx) => {
                  const prevGroup = idx > 0 ? searchItems[idx - 1].group : null;
                  const showHeader = item.group !== prevGroup;
                  const isSelected = idx === quickSearchIndex;
                  const GroupIcon =
                    item.group === 'Workflows'
                      ? GitBranch
                      : item.group === 'Projects'
                        ? FolderKanban
                        : item.group === 'AI Providers'
                          ? Cpu
                          : item.group === 'Integrations'
                            ? Blocks
                            : item.group === 'Credentials'
                              ? KeyRound
                              : item.group === 'Templates'
                                ? LayoutGrid
                                : item.group === 'Actions'
                                  ? item.id === 'action-nova'
                                    ? Sparkles
                                    : Plus
                                  : ArrowRight;
                  return (
                    <div key={item.id}>
                      {showHeader && (
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          {item.group}
                        </p>
                      )}
                      <button
                        type="button"
                        onMouseEnter={() => setQuickSearchIndex(idx)}
                        onClick={() => {
                          setQuickSearchOpen(false);
                          void item.run();
                        }}
                        className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-rose-50 dark:bg-rose-950/30 text-zinc-900 dark:text-white'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5 min-w-0">
                          <GroupIcon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isSelected ? 'text-[#E11D48]' : 'text-zinc-400'
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium truncate">{item.title}</span>
                            <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                              {item.subtitle}
                            </span>
                          </span>
                        </span>
                        {item.badge && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import Workflow JSON Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleImportSubmit}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileUp className="w-4 h-4 text-[#E11D48]" />
                <h2 className="font-display text-lg font-semibold">Import Workflow JSON</h2>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Paste an exported CROX workflow JSON file below or upload a <code className="font-mono">.json</code> file.
            </p>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                file.text().then(setImportJsonText).catch(() => {});
              }}
              className="block w-full text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-200"
            />
            <textarea
              rows={8}
              required
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{"name": "My Workflow", "nodes": [...], "edges": [...]}'
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs font-mono"
            />
            {importError && <p className="text-xs text-red-600">{importError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importing || !importJsonText.trim()}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import & Open Editor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Create Project Modal */}
      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreateProject}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold">Create New Project</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Support Agents"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingProject || !projectName.trim()}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                {creatingProject ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CroxRouter />
    </AuthProvider>
  );
}
