import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  MinusCircle,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { WorkflowExecutionRecord, WorkflowRecord } from '../types/workflow';

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export const ExecutionsPage: React.FC = () => {
  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');
  const [offset, setOffset] = useState(0);
  const limit = 15;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<WorkflowExecutionRecord | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.workflows
      .list()
      .then((res) => setWorkflows(res.workflows))
      .catch(() => {});
  }, []);

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.executions.list({
        limit,
        offset,
        status: statusFilter,
        ...(workflowFilter !== 'all' ? { workflowId: workflowFilter } : {}),
      });
      setExecutions(res.executions);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution history.');
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter, workflowFilter]);

  useEffect(() => {
    void loadExecutions();
  }, [loadExecutions]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await api.executions.get(id);
      setSelectedDetail(res.execution);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution report.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const renderStatus = (status: WorkflowExecutionRecord['status']) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Success
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E11D48] dark:text-rose-400">
            <AlertCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <Clock className="w-3.5 h-3.5" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Execution History
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Inspect persisted workflow runs, step payloads, agent tool traces, and timing metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by workflow"
            value={workflowFilter}
            onChange={(e) => {
              setWorkflowFilter(e.target.value);
              setOffset(0);
            }}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200"
          >
            <option value="all">All Workflows</option>
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setOffset(0);
            }}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-14 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
        </div>
      ) : executions.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs text-center space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center mx-auto">
            <Activity className="w-5 h-5" />
          </div>
          <h2 className="font-display text-base font-semibold">No executions recorded yet</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Test or run a workflow in the editor, or trigger a webhook, to inspect run logs here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50/70 dark:bg-zinc-950/40">
                  <th className="py-3 px-4 font-medium">Workflow Name</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Trigger</th>
                  <th className="py-3 px-4 font-medium">Started</th>
                  <th className="py-3 px-4 font-medium text-right">Duration</th>
                  <th className="py-3 px-4 font-medium text-right">Steps</th>
                  <th className="py-3 px-4 font-medium text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {executions.map((ex) => (
                  <tr key={ex.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                    <td className="py-3.5 px-4 font-medium text-zinc-900 dark:text-white">
                      {ex.workflowName}
                    </td>
                    <td className="py-3.5 px-4">{renderStatus(ex.status)}</td>
                    <td className="py-3.5 px-4 text-xs text-zinc-600 dark:text-zinc-300 capitalize">
                      {ex.triggerType}
                    </td>
                    <td
                      className="py-3.5 px-4 text-xs text-zinc-500 tabular-nums"
                      title={new Date(ex.startedAt).toLocaleString()}
                    >
                      {formatRelative(ex.startedAt)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-right text-zinc-600 dark:text-zinc-300">
                      {ex.durationMs}ms
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-right text-zinc-600 dark:text-zinc-300">
                      {ex.summary.totalNodes}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => void openDetail(ex.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-[#E11D48] dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > limit && (
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
              <span className="tabular-nums">
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - limit))}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset((o) => o + limit)}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Slide-Over */}
      {(selectedDetail || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="w-full max-w-2xl bg-white dark:bg-[#141416] border-l border-zinc-200 dark:border-zinc-800 h-full flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold">
                  {selectedDetail ? selectedDetail.workflowName : 'Loading execution...'}
                </h2>
                {selectedDetail && (
                  <p className="text-xs font-mono text-zinc-500 mt-0.5">
                    {selectedDetail.id} · {selectedDetail.durationMs}ms
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
              </div>
            ) : (
              selectedDetail && (
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <p className="text-zinc-500">Status</p>
                      <div className="mt-1">{renderStatus(selectedDetail.status)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <p className="text-zinc-500">Succeeded</p>
                      <p className="mt-1 font-mono font-semibold tabular-nums">
                        {selectedDetail.summary.successCount}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <p className="text-zinc-500">Failed</p>
                      <p className="mt-1 font-mono font-semibold tabular-nums">
                        {selectedDetail.summary.failedCount}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                      <p className="text-zinc-500">Skipped</p>
                      <p className="mt-1 font-mono font-semibold tabular-nums">
                        {selectedDetail.summary.skippedCount}
                      </p>
                    </div>
                  </div>

                  {selectedDetail.errorMessage && (
                    <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                      {selectedDetail.errorMessage}
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="font-display text-sm font-semibold">Step Execution Logs</h3>
                    {(selectedDetail.nodeResults || []).map((nr, idx) => (
                      <div
                        key={nr.id}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                      >
                        <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <span className="font-mono text-zinc-400">{idx + 1}.</span>
                            {nr.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                            {nr.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-[#E11D48]" />}
                            {nr.status === 'skipped' && <MinusCircle className="w-3.5 h-3.5 text-zinc-400" />}
                            <span>{nr.nodeName}</span>
                            {nr.simulated && (
                              <span className="font-normal text-amber-700 dark:text-amber-400">
                                · Simulated
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                            {nr.durationMs}ms
                          </span>
                        </div>
                        <div className="p-3.5 space-y-2.5 text-xs">
                          {nr.errorMessage && (
                            <p className="text-red-600 dark:text-red-400">{nr.errorMessage}</p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <p className="text-[11px] text-zinc-500 mb-1">Input</p>
                              <pre className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] overflow-x-auto max-h-36">
                                {JSON.stringify(nr.input ?? null, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[11px] text-zinc-500 mb-1">Output</p>
                              <pre className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] overflow-x-auto max-h-36">
                                {JSON.stringify(nr.output ?? null, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
