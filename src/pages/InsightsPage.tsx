import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Loader2,
  Power,
} from 'lucide-react';
import { api } from '../services/api';
import { InsightsSummary } from '../types/workflow';

interface InsightsPageProps {
  onOpenWorkflow: (workflowId: string) => void;
}

export const InsightsPage: React.FC<InsightsPageProps> = ({ onOpenWorkflow }) => {
  const [insights, setInsights] = useState<InsightsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.workflows
      .insights()
      .then((res) => setInsights(res.insights))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load insights.'))
      .finally(() => setLoading(false));
  }, []);

  const maxDailyTotal = useMemo(() => {
    if (!insights?.dailySeries?.length) return 1;
    return Math.max(1, ...insights.dailySeries.map((d) => d.total));
  }, [insights]);

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error || 'Unable to compute workspace insights.'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Workspace Insights
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Real-time execution health, throughput, latency, and recent incidents across your workflows.
        </p>
      </div>

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Executions',
            value: insights.totalExecutions,
            sub: `${insights.successfulExecutions} passed · ${insights.failedExecutions} failed`,
            icon: Activity,
          },
          {
            label: 'Success Rate',
            value: `${insights.successRate}%`,
            sub: insights.totalExecutions === 0 ? 'No runs yet' : 'Across all persisted runs',
            icon: CheckCircle2,
          },
          {
            label: 'Avg Execution Time',
            value: `${insights.averageDurationMs}ms`,
            sub: 'Mean node pipeline latency',
            icon: Clock,
          },
          {
            label: 'Active Workflows',
            value: `${insights.activeWorkflows} / ${insights.totalWorkflows}`,
            sub: `${insights.totalProjects} projects configured`,
            icon: Power,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="p-4 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {card.label}
                </span>
                <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
                {card.value}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Daily Run Volume Bar Chart */}
      <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
              Daily Execution Volume (Last 14 Days)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Stacked breakdown of successful vs. failed runs
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Success
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#E11D48]" /> Failed
            </span>
          </div>
        </div>

        {insights.dailySeries.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            Execute a workflow to populate daily throughput metrics.
          </div>
        ) : (
          <div className="h-48 flex items-end gap-2 pt-4">
            {insights.dailySeries.map((day) => {
              const totalPct = Math.max(6, Math.round((day.total / maxDailyTotal) * 100));
              const successPct = day.total > 0 ? Math.round((day.success / day.total) * 100) : 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 group"
                  title={`${day.date}: ${day.total} total (${day.success} passed, ${day.failed} failed, avg ${day.avgDurationMs}ms)`}
                >
                  <div
                    className="w-full max-w-[28px] rounded-t-md overflow-hidden flex flex-col justify-end bg-zinc-100 dark:bg-zinc-800 transition-all"
                    style={{ height: `${totalPct}%` }}
                  >
                    {day.failed > 0 && (
                      <div
                        className="w-full bg-[#E11D48]"
                        style={{ height: `${100 - successPct}%` }}
                      />
                    )}
                    {day.success > 0 && (
                      <div
                        className="w-full bg-emerald-500"
                        style={{ height: `${successPct}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom 2-Column Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Workflows */}
        <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">
              Most Active Workflows
            </h2>
          </div>
          {insights.topWorkflows.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">No workflow runs recorded yet.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 bg-zinc-50/70 dark:bg-zinc-950/40">
                  <th className="py-2.5 px-4 font-medium">Workflow</th>
                  <th className="py-2.5 px-4 font-medium text-right">Runs</th>
                  <th className="py-2.5 px-4 font-medium text-right">Pass Rate</th>
                  <th className="py-2.5 px-4 font-medium text-right">Avg Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {insights.topWorkflows.map((wf) => {
                  const rate = wf.runs > 0 ? Math.round((wf.successCount / wf.runs) * 100) : 0;
                  return (
                    <tr
                      key={wf.workflowId}
                      onClick={() => onOpenWorkflow(wf.workflowId)}
                      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span className="truncate">{wf.name}</span>
                        <ArrowUpRight className="w-3 h-3 text-zinc-400 shrink-0" />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{wf.runs}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {rate}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-500">
                        {wf.avgDurationMs}ms
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Failures */}
        <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">
              Recent Failures
            </h2>
          </div>
          {insights.recentFailures.length === 0 ? (
            <div className="p-8 text-center text-xs text-emerald-600 dark:text-emerald-400">
              No execution failures recorded.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {insights.recentFailures.map((fail) => (
                <button
                  key={fail.executionId}
                  type="button"
                  onClick={() => onOpenWorkflow(fail.workflowId)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertCircle className="w-4 h-4 text-[#E11D48] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                        {fail.workflowName}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {fail.errorMessage || 'Execution failed'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                    {new Date(fail.startedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
