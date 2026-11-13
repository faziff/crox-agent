import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react';
import {
  ValidationIssue,
  WorkflowRecord,
  WorkflowSettings,
  WorkflowVersionRecord,
} from '../../types/workflow';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const WorkflowSettingsModal: React.FC<{
  open: boolean;
  settings: WorkflowSettings;
  workflows: WorkflowRecord[];
  currentWorkflowId: string;
  onSave: (next: WorkflowSettings) => void;
  onClose: () => void;
}> = ({ open, settings, workflows, currentWorkflowId, onSave, onClose }) => {
  const [draft, setDraft] = useState<WorkflowSettings>(settings);

  if (!open) return null;

  const otherWorkflows = workflows.filter((w) => w.id !== currentWorkflowId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
          onClose();
        }}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#E11D48]" />
            <h2 className="font-display text-base font-semibold">Workflow Settings</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Execution Timeout (ms)
              </label>
              <input
                type="number"
                min={1000}
                max={300000}
                value={draft.timeoutMs}
                onChange={(e) => setDraft({ ...draft, timeoutMs: Number(e.target.value) })}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Timezone
              </label>
              <select
                value={draft.timezone || 'UTC'}
                onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between pt-1 cursor-pointer">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Retry Failed Workflow Runs</span>
            <input
              type="checkbox"
              checked={draft.retryOnFailure}
              onChange={(e) => setDraft({ ...draft, retryOnFailure: e.target.checked })}
              className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
            />
          </label>

          {draft.retryOnFailure && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">Max Retries</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={draft.maxRetries}
                  onChange={(e) => setDraft({ ...draft, maxRetries: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">Retry Delay (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  value={draft.retryDelayMs ?? 400}
                  onChange={(e) => setDraft({ ...draft, retryDelayMs: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 font-mono"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Error Handler Workflow (runs if this workflow fails)
            </label>
            <select
              value={draft.errorWorkflowId || ''}
              onChange={(e) => setDraft({ ...draft, errorWorkflowId: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2"
            >
              <option value="">None</option>
              {otherWorkflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium"
          >
            Apply Settings
          </button>
        </div>
      </form>
    </div>
  );
};

export const VersionHistoryDrawer: React.FC<{
  open: boolean;
  versions: WorkflowVersionRecord[];
  loading: boolean;
  onCreateSnapshot: (note: string) => Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
  onClose: () => void;
}> = ({ open, versions, loading, onCreateSnapshot, onRestoreVersion, onClose }) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-[#141416] border-l border-zinc-200 dark:border-zinc-800 h-full flex flex-col shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#E11D48]" />
            <h2 className="font-display text-base font-semibold">Version History</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await onCreateSnapshot(note.trim() || 'Manual snapshot');
              setNote('');
            } finally {
              setSaving(false);
            }
          }}
          className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Snapshot note (e.g. Before adding AI parser)"
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Snapshot'}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#E11D48]" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">
              No saved versions yet. Snapshots are created automatically on publish or manually above.
            </p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                    v{v.versionNumber} · {v.note || 'Snapshot'}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {v.nodes.length} nodes
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>{new Date(v.createdAt).toLocaleString()}</span>
                  <button
                    type="button"
                    disabled={restoringId === v.id}
                    onClick={async () => {
                      setRestoringId(v.id);
                      try {
                        await onRestoreVersion(v.id);
                      } finally {
                        setRestoringId(null);
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[#E11D48] font-medium hover:underline disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{restoringId === v.id ? 'Restoring...' : 'Restore'}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const PublishValidationModal: React.FC<{
  open: boolean;
  issues: ValidationIssue[];
  onFocusNode: (nodeId: string) => void;
  onClose: () => void;
}> = ({ open, issues, onFocusNode, onClose }) => {
  if (!open) return null;

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Workflow Validation Report</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {issues.length === 0 ? (
          <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>All graph connections, triggers, and node configurations are valid and ready to publish.</span>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2">
            {errors.map((err) => (
              <div
                key={err.id}
                onClick={() => {
                  if (err.nodeId) {
                    onFocusNode(err.nodeId);
                    onClose();
                  }
                }}
                className={`p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2 ${
                  err.nodeId ? 'cursor-pointer hover:border-red-400' : ''
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{err.message}</p>
                  {err.nodeId && <p className="text-[11px] opacity-80 mt-0.5">Click to focus node</p>}
                </div>
              </div>
            ))}
            {warnings.map((w) => (
              <div
                key={w.id}
                onClick={() => {
                  if (w.nodeId) {
                    onFocusNode(w.nodeId);
                    onClose();
                  }
                }}
                className={`p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 ${
                  w.nodeId ? 'cursor-pointer hover:border-amber-400' : ''
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{w.message}</p>
                  {w.nodeId && <p className="text-[11px] opacity-80 mt-0.5">Click to inspect node</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
