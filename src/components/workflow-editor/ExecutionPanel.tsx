import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  MinusCircle,
  Wrench,
  X,
} from 'lucide-react';
import {
  AiAgentExecutionTrace,
  NodeExecutionResult,
  WorkflowExecutionRecord,
} from '../../types/workflow';

interface ExecutionPanelProps {
  execution: WorkflowExecutionRecord | null;
  recentExecutions?: WorkflowExecutionRecord[];
  onSelectExecution?: (executionId: string) => void;
  onFocusNode?: (nodeId: string) => void;
  onCancelExecution?: (executionId: string) => void;
  onClose: () => void;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  execution,
  recentExecutions = [],
  onSelectExecution,
  onFocusNode,
  onCancelExecution,
  onClose,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<'logs' | 'input' | 'output' | 'errors' | 'details'>('logs');
  const [selectedNodeResult, setSelectedNodeResult] = useState<NodeExecutionResult | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    if (execution?.nodeResults?.length) {
      setSelectedNodeResult(execution.nodeResults[0]);
      setExpanded(true);
    } else {
      setSelectedNodeResult(null);
    }
  }, [execution]);

  if (!execution) return null;

  const agentTrace =
    selectedNodeResult?.nodeType === 'ai_agent' &&
    selectedNodeResult.output &&
    typeof selectedNodeResult.output === 'object'
      ? ((selectedNodeResult.output as Record<string, unknown>).agentTrace as
          | AiAgentExecutionTrace
          | undefined)
      : undefined;

  const copyPayload = (payload: unknown) => {
    void navigator.clipboard.writeText(JSON.stringify(payload ?? null, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1200);
  };

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] flex flex-col shrink-0 z-20">
      {/* Header Bar */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <div className="flex items-center gap-2">
            {execution.status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#E11D48] shrink-0" />
            )}
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
              Logs · {execution.status}
            </span>
          </div>

          <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
            {execution.durationMs}ms · {execution.summary.successCount} ok ·{' '}
            {execution.summary.failedCount} err · {execution.summary.skippedCount} skipped
          </span>

          {recentExecutions.length > 1 && onSelectExecution && (
            <select
              aria-label="Select previous execution"
              value={execution.id}
              onChange={(e) => onSelectExecution(e.target.value)}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 text-[11px] font-mono text-zinc-700 dark:text-zinc-200"
            >
              {recentExecutions.slice(0, 10).map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {new Date(ex.startedAt).toLocaleTimeString()} · {ex.status} ({ex.durationMs}ms)
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(execution.status === 'running' || execution.status === 'queued') && onCancelExecution && (
            <button
              type="button"
              onClick={() => onCancelExecution(execution.id)}
              className="px-2 py-1 rounded-md border border-red-200 dark:border-red-900 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 mr-1"
            >
              Cancel Run
            </button>
          )}
          {(['logs', 'input', 'output', 'errors', 'details'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setExpanded(true);
              }}
              className={`hidden sm:inline-flex px-2 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {t}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
            aria-label={expanded ? 'Collapse execution panel' : 'Expand execution panel'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
            aria-label="Dismiss execution panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="h-[240px] grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left: Node Step List */}
          <div className="md:col-span-4 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
            {(execution.nodeResults || []).map((nr) => {
              const active = selectedNodeResult?.id === nr.id;
              return (
                <button
                  key={nr.id}
                  type="button"
                  onClick={() => {
                    setSelectedNodeResult(nr);
                    if (nr.status === 'failed') onFocusNode?.(nr.nodeId);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                    active ? 'bg-rose-50 dark:bg-rose-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {nr.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    {nr.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-[#E11D48] shrink-0" />}
                    {nr.status === 'skipped' && <MinusCircle className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-medium truncate ${
                          active ? 'text-[#E11D48] dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                      >
                        {nr.nodeName}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 truncate">
                        {nr.nodeType} · {nr.status}
                        {nr.status === 'success' ? (nr.simulated ? ' · simulated' : ' · live') : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-zinc-400 shrink-0">
                    {nr.durationMs}ms
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Detail View */}
          <div className="md:col-span-8 overflow-y-auto p-3.5 space-y-3 bg-zinc-50 dark:bg-zinc-950">
            {tab === 'errors' ? (
              <div className="space-y-2">
                {execution.errorMessage && (
                  <div className="p-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                    Workflow Error: {execution.errorMessage}
                  </div>
                )}
                {(execution.nodeResults || [])
                  .filter((r) => r.status === 'failed' || r.errorMessage)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedNodeResult(r);
                        onFocusNode?.(r.nodeId);
                      }}
                      className="w-full text-left p-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-zinc-900 hover:border-[#E11D48] text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2 transition-colors"
                    >
                      <span>
                        <strong>{r.nodeName}:</strong> {r.errorMessage}
                      </span>
                      {onFocusNode && (
                        <span className="text-[10px] font-medium text-zinc-500 shrink-0 underline">
                          Focus node
                        </span>
                      )}
                    </button>
                  ))}
                {!execution.errorMessage &&
                  !(execution.nodeResults || []).some((r) => r.status === 'failed') && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">No errors in this execution.</p>
                  )}
              </div>
            ) : tab === 'details' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-500">Execution ID</p>
                  <p className="font-mono text-[11px] truncate mt-0.5">{execution.id}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-500">Trigger Type</p>
                  <p className="font-medium capitalize mt-0.5">{execution.triggerType}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <p className="text-zinc-500">Duration</p>
                  <p className="font-mono tabular-nums mt-0.5">{execution.durationMs}ms</p>
                </div>
              </div>
            ) : selectedNodeResult ? (
              <>
                {selectedNodeResult.simulated && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Simulated execution step — configure external provider keys to switch to live delivery.
                    </span>
                  </div>
                )}

                {selectedNodeResult.errorMessage && (
                  <div className="p-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                    {selectedNodeResult.errorMessage}
                  </div>
                )}

                {/* AI Agent Tool Call Trace */}
                {agentTrace && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">
                        <Bot className="w-3.5 h-3.5 text-[#E11D48]" />
                        AI Agent Reasoning ({agentTrace.provider} · {agentTrace.model})
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {agentTrace.iterations} turn(s) · {agentTrace.loadedMessagesCount} memory msg(s)
                      </span>
                    </div>
                    {agentTrace.toolCalls.length > 0 ? (
                      <div className="space-y-1.5">
                        {agentTrace.toolCalls.map((tc, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] space-y-1"
                          >
                            <div className="flex items-center justify-between font-mono">
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                                <Wrench className="w-3 h-3" /> {tc.toolName} (turn {tc.iteration})
                              </span>
                              <span className="text-zinc-500">{tc.durationMs}ms</span>
                            </div>
                            <p className="font-mono text-zinc-500 truncate">
                              args: {JSON.stringify(tc.args)}
                            </p>
                            <p className="font-mono text-zinc-700 dark:text-zinc-300 truncate">
                              result: {tc.error ? `Error: ${tc.error}` : JSON.stringify(tc.result)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500">Direct model response (no tool invocations needed).</p>
                    )}
                  </div>
                )}

                {tab === 'input' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-zinc-500">Input Data</p>
                      <button
                        type="button"
                        onClick={() => copyPayload(selectedNodeResult.input)}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900"
                      >
                        {copiedJson ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Copy JSON</span>
                      </button>
                    </div>
                    <pre className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11px] font-mono overflow-x-auto max-h-40 text-zinc-800 dark:text-zinc-200">
                      {JSON.stringify(selectedNodeResult.input ?? null, null, 2)}
                    </pre>
                  </div>
                ) : tab === 'output' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-zinc-500">Output Data</p>
                      <button
                        type="button"
                        onClick={() => copyPayload(selectedNodeResult.output)}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900"
                      >
                        {copiedJson ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Copy JSON</span>
                      </button>
                    </div>
                    <pre className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11px] font-mono overflow-x-auto max-h-40 text-zinc-800 dark:text-zinc-200">
                      {JSON.stringify(selectedNodeResult.output ?? null, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Input Data</p>
                      <pre className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11px] font-mono overflow-x-auto max-h-36 text-zinc-800 dark:text-zinc-200">
                        {JSON.stringify(selectedNodeResult.input ?? null, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Output Data</p>
                        <button
                          type="button"
                          onClick={() => copyPayload(selectedNodeResult.output)}
                          className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-900"
                        >
                          {copiedJson ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11px] font-mono overflow-x-auto max-h-36 text-zinc-800 dark:text-zinc-200">
                        {JSON.stringify(selectedNodeResult.output ?? null, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-500">Select a node step to inspect input and output payloads.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
