import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Copy,
  Edit3,
  FileUp,
  FolderInput,
  GitBranch,
  MoreVertical,
  Play,
  Plus,
  Power,
  Search,
  Trash2,
} from 'lucide-react';
import { FloatingPromptBar } from '../components/nova/FloatingPromptBar';
import { api } from '../services/api';
import { ProjectRecord, WorkflowRecord } from '../types/workflow';

interface DashboardPageProps {
  title?: string;
  projects?: ProjectRecord[];
  selectedProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  onOpenWorkflow: (workflowId: string) => void;
  onExploreTemplates: () => void;
  onOpenImportModal?: () => void;
  onOpenNewWorkflowModal?: () => void;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  title = 'Overview',
  projects = [],
  selectedProjectId = '',
  onSelectProject,
  onOpenWorkflow,
  onExploreTemplates,
  onOpenImportModal,
  onOpenNewWorkflowModal,
}) => {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [stats, setStats] = useState({
    totalWorkflows: 0,
    activeWorkflows: 0,
    totalExecutions: 0,
    successfulExecutions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newProjectId, setNewProjectId] = useState(selectedProjectId || '');
  const [creating, setCreating] = useState(false);

  const [renameTarget, setRenameTarget] = useState<WorkflowRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [moveTarget, setMoveTarget] = useState<WorkflowRecord | null>(null);
  const [moveProjectId, setMoveProjectId] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<WorkflowRecord | null>(null);

  useEffect(() => {
    setNewProjectId(selectedProjectId || '');
  }, [selectedProjectId]);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.workflows.list(selectedProjectId || undefined);
      setWorkflows(res.workflows);
      setStats(res.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows.');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredWorkflows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workflows.filter((wf) => {
      if (statusFilter === 'active' && !wf.isActive) return false;
      if (statusFilter === 'inactive' && wf.isActive) return false;
      if (!q) return true;
      return (
        wf.name.toLowerCase().includes(q) ||
        (wf.description || '').toLowerCase().includes(q)
      );
    });
  }, [workflows, search, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await api.workflows.create({
        name: newName.trim(),
        description: newDescription.trim(),
        ...(newProjectId ? { projectId: newProjectId } : {}),
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      onOpenWorkflow(res.workflow.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow.');
    } finally {
      setCreating(false);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await api.workflows.update(renameTarget.id, { name: renameValue.trim() });
      setRenameTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed.');
    }
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveTarget || !moveProjectId) return;
    try {
      await api.workflows.moveToProject(moveTarget.id, moveProjectId);
      setMoveTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move workflow.');
    }
  };

  const handleToggleStatus = async (wf: WorkflowRecord) => {
    setMenuOpenId(null);
    try {
      await api.workflows.setStatus(wf.id, !wf.isActive);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update workflow status.');
    }
  };

  const handleDuplicate = async (wf: WorkflowRecord) => {
    setMenuOpenId(null);
    try {
      await api.workflows.duplicate(wf.id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to duplicate workflow.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await api.workflows.delete(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete workflow.');
    }
  };

  const activeProjects = projects.filter((p) => !p.isArchived);
  const currentProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex-1 flex flex-col min-h-full">
      <div className="p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6 flex-1 pb-24">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {currentProject ? `${title} · ${currentProject.name}` : title}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Design, test, and monitor your automated workflows and AI agents.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workflows..."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
              />
            </div>

            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Import JSON</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => (onOpenNewWorkflowModal ? onOpenNewWorkflowModal() : setShowCreateModal(true))}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium shadow-xs transition-all duration-150 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workflow</span>
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Workflows', value: stats.totalWorkflows, icon: GitBranch },
            { label: 'Active Workflows', value: stats.activeWorkflows, icon: Power },
            { label: 'Total Executions', value: stats.totalExecutions, icon: Activity },
            { label: 'Successful Runs', value: stats.successfulExecutions, icon: CheckCircle2 },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="p-4 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-start justify-between"
              >
                <div>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{metric.label}</p>
                  <p className="font-display text-2xl font-bold tabular-nums mt-1 text-zinc-900 dark:text-white">
                    {metric.value}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-xs underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              {(['all', 'active', 'inactive'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-150 whitespace-nowrap ${
                    statusFilter === tab
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeProjects.length > 0 && onSelectProject && (
              <select
                aria-label="Filter by project"
                value={selectedProjectId}
                onChange={(e) => onSelectProject(e.target.value)}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200"
              >
                <option value="">All Projects</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <span className="text-xs text-zinc-500 tabular-nums">
            {filteredWorkflows.length} {filteredWorkflows.length === 1 ? 'workflow' : 'workflows'}
          </span>
        </div>

        {/* Cards Grid / Empty State */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 animate-pulse"
              />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs text-center max-w-xl mx-auto space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center mx-auto">
              <GitBranch className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
                Your automation journey starts here
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Build a custom workflow from scratch, install a ready-made template, or describe what you need to NOVA below.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => (onOpenNewWorkflowModal ? onOpenNewWorkflowModal() : setShowCreateModal(true))}
                className="px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium transition-colors"
              >
                Create Your First Workflow
              </button>
              <button
                type="button"
                onClick={onExploreTemplates}
                className="px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Explore Templates
              </button>
            </div>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] text-center text-sm text-zinc-500">
            No workflows match your current search or filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredWorkflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => onOpenWorkflow(wf.id)}
                className="group cursor-pointer rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs hover:shadow-md hover:border-[#E11D48]/50 transition-all duration-150 p-5 flex flex-col justify-between gap-4 relative"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white group-hover:text-[#E11D48] truncate transition-colors">
                        {wf.name}
                      </h3>
                      <div className="flex items-center flex-wrap gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            wf.isActive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {wf.isActive ? 'Published' : 'Draft'}
                        </span>
                        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                        <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
                          {wf.nodes.length} {wf.nodes.length === 1 ? 'node' : 'nodes'}
                        </span>
                        {wf.projectName && (
                          <>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                            <span className="text-zinc-500 dark:text-zinc-400 truncate max-w-[110px]">
                              {wf.projectName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      className="relative shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setMenuOpenId(menuOpenId === wf.id ? null : wf.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        aria-label={`Actions for ${wf.name}`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menuOpenId === wf.id && (
                        <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-lg py-1 z-20 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              onOpenWorkflow(wf.id);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <Play className="w-3.5 h-3.5 text-[#E11D48]" /> Open Editor
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              setRenameTarget(wf);
                              setRenameValue(wf.name);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Rename
                          </button>
                          {activeProjects.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpenId(null);
                                setMoveTarget(wf);
                                setMoveProjectId(wf.projectId || activeProjects[0]?.id || '');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                            >
                              <FolderInput className="w-3.5 h-3.5" /> Move to Project
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDuplicate(wf)}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(wf)}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <Power className="w-3.5 h-3.5" /> {wf.isActive ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              setDeleteTarget(wf);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 min-h-[2rem]">
                    {wf.description ||
                      (wf.nodes.length > 0
                        ? wf.nodes
                            .filter((n) => n.type === 'croxNode')
                            .map((n) => (n.data as { label?: string }).label || '')
                            .join(' → ')
                        : 'Blank workflow canvas — click to add trigger and action nodes.')}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="tabular-nums">Updated {formatRelativeTime(wf.updatedAt)}</span>
                  {wf.lastExecutionStatus && (
                    <span
                      className={
                        wf.lastExecutionStatus === 'success'
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                          : wf.lastExecutionStatus === 'failed'
                            ? 'text-[#E11D48] font-medium'
                            : ''
                      }
                    >
                      Last run: {wf.lastExecutionStatus}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Floating AI Prompt Bar */}
      <FloatingPromptBar
        mode="dashboard"
        projectId={selectedProjectId || undefined}
        onOpenCreatedWorkflow={onOpenWorkflow}
      />

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold">Create New Workflow</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Workflow Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. AI Lead Qualification Agent"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
                />
              </div>
              {activeProjects.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Project
                  </label>
                  <select
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <option value="">Default (Personal)</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Briefly describe what this automation does"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create & Open Editor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold">Rename Workflow</h2>
            <input
              type="text"
              required
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium"
              >
                Save Name
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move to Project Modal */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleMoveSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold">Move Workflow</h2>
            <p className="text-xs text-zinc-500">
              Choose destination project for <strong>{moveTarget.name}</strong>:
            </p>
            <select
              value={moveProjectId}
              onChange={(e) => setMoveProjectId(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium"
              >
                Move Workflow
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl">
            <h2 className="font-display text-lg font-semibold">Delete Workflow</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Permanently delete <strong>{deleteTarget.name}</strong> and its execution history?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConfirm()}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
