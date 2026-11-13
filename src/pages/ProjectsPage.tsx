import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Edit3,
  FolderGit2,
  FolderKanban,
  FolderPlus,
  Loader2,
  Power,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { ProjectRecord } from '../types/workflow';

interface ProjectsPageProps {
  onOpenProjectWorkflows: (projectId: string) => void;
  onProjectsChanged?: () => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  onOpenProjectWorkflows,
  onProjectsChanged,
}) => {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<ProjectRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setError(null);
      const res = await api.projects.list();
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const visibleProjects = useMemo(() => {
    return projects.filter((p) => (showArchived ? true : !p.isArchived));
  }, [projects, showArchived]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.projects.create({ name: name.trim(), description: description.trim() });
      setCreateOpen(false);
      setName('');
      setDescription('');
      await loadProjects();
      onProjectsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editName.trim()) return;
    setSaving(true);
    try {
      await api.projects.update(editTarget.id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      setEditTarget(null);
      await loadProjects();
      onProjectsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (proj: ProjectRecord) => {
    try {
      await api.projects.update(proj.id, { isArchived: !proj.isArchived });
      await loadProjects();
      onProjectsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update archive state.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.projects.delete(deleteTarget.id);
      setDeleteTarget(null);
      await loadProjects();
      onProjectsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete project.');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Projects
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Organize workflows by team, client, or automation environment.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
            />
            <span>Show archived</span>
          </label>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium shadow-xs transition-colors whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleProjects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => onOpenProjectWorkflows(proj.id)}
              className={`group cursor-pointer rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 hover:border-[#E11D48]/50 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between gap-4 ${
                proj.isArchived ? 'opacity-65' : ''
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center shrink-0">
                      <FolderKanban className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white group-hover:text-[#E11D48] truncate transition-colors">
                        {proj.name}
                      </h2>
                      <p className="text-[11px] font-mono text-zinc-500">
                        {proj.isDefault ? 'Default Project' : proj.isArchived ? 'Archived' : 'Workspace Project'}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 min-h-[2rem]">
                  {proj.description || 'Shared project folder for automated workflows.'}
                </p>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-xs text-zinc-500 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <FolderGit2 className="w-3.5 h-3.5" />
                    {proj.workflowCount ?? 0} workflows
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Power className="w-3.5 h-3.5" />
                    {proj.activeWorkflowCount ?? 0} active
                  </span>
                </div>

                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setEditTarget(proj);
                      setEditName(proj.name);
                      setEditDescription(proj.description || '');
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title="Edit project"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {!proj.isDefault && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleToggleArchive(proj)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title={proj.isArchived ? 'Restore project' : 'Archive project'}
                      >
                        {proj.isArchived ? (
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        ) : (
                          <Archive className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(proj)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold">Create Project</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Growth Automations"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/25 focus:border-[#E11D48]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Lead routing, CRM sync, and AI agents"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Project Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleEdit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold">Edit Project</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !editName.trim()}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Project Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl">
            <h2 className="font-display text-lg font-semibold">Delete Project</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Delete <strong>{deleteTarget.name}</strong>? Existing workflows inside it will be safely moved back to your default Personal project.
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
                onClick={() => void handleDelete()}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
