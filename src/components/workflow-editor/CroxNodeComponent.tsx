import React from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FastForward,
  Loader2,
  MinusCircle,
  Play,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import { getCatalogEntry } from '../../constants/nodeCatalog';
import { getCategoryIconBadgeClass, getNodeIcon } from '../../constants/nodeIcons';
import {
  ClusterRole,
  EdgeKind,
  NodeExecutionStatus,
  SwitchNodeConfig,
  WorkflowNodeData,
} from '../../types/workflow';
import { useEditorActions } from './EditorActionsContext';

function renderStatusLabel(status?: NodeExecutionStatus, durationMs?: number, simulated?: boolean) {
  if (!status) return null;
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Running</span>
        </span>
      );
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
          <CheckCircle2 className="w-3 h-3" />
          <span>{simulated ? 'Simulated' : 'Success'}</span>
          {typeof durationMs === 'number' && <span>· {durationMs}ms</span>}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48] dark:text-rose-400">
          <AlertCircle className="w-3 h-3" />
          <span>Failed</span>
        </span>
      );
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
          <MinusCircle className="w-3 h-3" />
          <span>Skipped</span>
        </span>
      );
    default:
      return <span className="text-[11px] font-medium text-zinc-400">Pending</span>;
  }
}

const AGENT_PORTS: Array<{
  id: EdgeKind;
  role: ClusterRole;
  label: string;
  leftPct: string;
  required?: boolean;
}> = [
  { id: 'ai_languageModel', role: 'languageModel', label: 'Model*', leftPct: '14%', required: true },
  { id: 'ai_memory', role: 'memory', label: 'Memory', leftPct: '38%' },
  { id: 'ai_tool', role: 'tool', label: 'Tools', leftPct: '62%' },
  { id: 'ai_outputParser', role: 'outputParser', label: 'Parser', leftPct: '86%' },
];

export const CroxNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const actions = useEditorActions();
  const entry = getCatalogEntry(nodeData.nodeType);
  const Icon = getNodeIcon(nodeData.nodeType);
  const clusterRole = entry.clusterRole;
  const isTrigger = nodeData.category === 'triggers';
  const isAgent = nodeData.nodeType === 'ai_agent' || nodeData.nodeType === 'agent_orchestrator';
  const isCondition = nodeData.nodeType === 'condition';
  const isSwitch = nodeData.nodeType === 'switch_node';
  const issues = actions.validationIssuesByNode[id] || [];
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = !hasError && issues.some((i) => i.severity === 'warning');

  const statusBorder =
    nodeData.executionStatus === 'failed'
      ? 'border-[#E11D48] ring-2 ring-[#E11D48]/20'
      : nodeData.executionStatus === 'success'
        ? 'border-emerald-500'
        : nodeData.executionStatus === 'running'
          ? 'border-blue-500 ring-2 ring-blue-500/15'
          : selected
            ? 'border-[#E11D48] ring-2 ring-[#E11D48]/20'
            : hasError
              ? 'border-red-400 dark:border-red-700'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700';

  const switchCfg = isSwitch ? (nodeData.config as SwitchNodeConfig) : null;
  const switchHandles = isSwitch
    ? [
        ...(switchCfg?.rules || []).map((r, idx) => ({
          id: r.outputKey || `case_${idx}`,
          label: r.label || `Case ${idx + 1}`,
        })),
        ...(switchCfg?.includeDefault !== false ? [{ id: 'default', label: 'Default' }] : []),
      ]
    : [];

  // Compact sub-node layout for Chat Model, Memory, Tools, Output Parser
  if (clusterRole) {
    return (
      <div
        className={`group relative w-[200px] rounded-xl bg-white dark:bg-[#141416] border border-dashed transition-all duration-150 shadow-xs ${statusBorder} ${
          nodeData.disabled ? 'opacity-50' : ''
        }`}
      >
        {/* Top Source Handle attaching UP to AI Agent */}
        <Handle
          id="cluster_source"
          type="source"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-zinc-700 dark:!bg-zinc-300 !border-2 !border-white dark:!border-[#141416]"
        />

        {/* Hover Quick Toolbar */}
        <div
          className="nodrag opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 right-0 flex items-center gap-0.5 rounded-lg bg-zinc-900 text-white px-1.5 py-1 shadow-md z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => actions.onTestNodeById(id)}
            className="p-1 hover:text-rose-400"
            title="Test node"
          >
            <Play className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => actions.onToggleDisableNode(id)}
            className="p-1 hover:text-amber-400"
            title={nodeData.disabled ? 'Enable node' : 'Disable node'}
          >
            <Power className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => actions.onDeleteNode(id)}
            className="p-1 hover:text-red-400"
            title="Delete node"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        <div className="p-2.5 flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${getCategoryIconBadgeClass(
              nodeData.category,
              clusterRole
            )}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-mono uppercase tracking-wide text-zinc-400 leading-none">
              {clusterRole}
            </p>
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50 truncate mt-1">
              {nodeData.label}
            </p>
          </div>
          {(hasError || hasWarning) && (
            <span title={issues.map((i) => i.message).join(' | ')} className="inline-flex shrink-0">
              <AlertTriangle
                className={`w-3.5 h-3.5 ${hasError ? 'text-red-500' : 'text-amber-500'}`}
              />
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative ${isAgent ? 'w-[300px]' : 'w-[244px]'} rounded-xl bg-white dark:bg-[#141416] border transition-all duration-150 shadow-xs ${statusBorder} ${
        nodeData.executionStatus === 'skipped' || nodeData.disabled ? 'opacity-55' : ''
      }`}
    >
      {/* Left Main Target Handle */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-zinc-400 dark:!bg-zinc-500 !border-2 !border-white dark:!border-[#141416]"
        />
      )}

      {/* Hover Quick Actions Bar */}
      <div
        className="nodrag opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 right-0 flex items-center gap-0.5 rounded-lg bg-zinc-900 text-white px-1.5 py-1 shadow-md z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => actions.onTestNodeById(id)}
          className="p-1 hover:text-rose-400"
          title="Test this step"
        >
          <Play className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => actions.onRunFromNodeById(id)}
          className="p-1 hover:text-emerald-400"
          title="Run workflow from here"
        >
          <FastForward className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => actions.onOpenAddNextNode(id)}
          className="p-1 hover:text-sky-400"
          title="Add connected next node"
        >
          <Plus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => actions.onToggleDisableNode(id)}
          className="p-1 hover:text-amber-400"
          title={nodeData.disabled ? 'Enable node' : 'Disable node'}
        >
          <Power className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => actions.onDeleteNode(id)}
          className="p-1 hover:text-red-400"
          title="Delete node"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="p-3.5 space-y-2">
        <div className="flex items-start gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getCategoryIconBadgeClass(
              nodeData.category
            )}`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500 leading-none truncate">
                {nodeData.nodeType.replace(/_/g, ' ')}
              </p>
              {(hasError || hasWarning) && (
                <span title={issues.map((i) => i.message).join(' | ')} className="inline-flex shrink-0">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 ${hasError ? 'text-red-500' : 'text-amber-500'}`}
                  />
                </span>
              )}
            </div>
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50 truncate mt-1">
              {nodeData.label}
            </p>
          </div>
        </div>

        {nodeData.disabled && (
          <span className="inline-block text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            Disabled
          </span>
        )}

        {nodeData.description && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">{nodeData.description}</p>
        )}

        {nodeData.executionStatus && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            {renderStatusLabel(nodeData.executionStatus, nodeData.executionDurationMs, nodeData.simulated)}
          </div>
        )}
      </div>

      {/* AI Agent / Orchestrator Bottom Cluster Ports */}
      {isAgent && (
        <div className="relative h-7 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 rounded-b-xl">
          {AGENT_PORTS.map((port) => (
            <React.Fragment key={port.id}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onOpenAttachClusterNode(id, port.role, port.id);
                }}
                style={{ left: port.leftPct, transform: 'translateX(-50%)' }}
                className="nodrag absolute top-1 text-[9px] font-mono font-medium text-zinc-500 hover:text-[#E11D48] transition-colors whitespace-nowrap"
                title={`Attach ${port.label.replace('*', '')} sub-node`}
              >
                + {port.label}
              </button>
              <Handle
                id={port.id}
                type="target"
                position={Position.Bottom}
                style={{ left: port.leftPct }}
                className={`!w-2.5 !h-2.5 !border-2 !border-white dark:!border-[#141416] ${
                  port.required ? '!bg-[#E11D48]' : '!bg-teal-600'
                }`}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Right Output Handles */}
      {isCondition ? (
        <div className="relative">
          <span className="absolute right-3.5 -top-[34px] text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 pointer-events-none">
            TRUE
          </span>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: -28 }}
            className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white dark:!border-[#141416]"
          />
          <span className="absolute right-3.5 -top-[14px] text-[10px] font-mono font-semibold text-zinc-400 pointer-events-none">
            FALSE
          </span>
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: -8 }}
            className="!w-2.5 !h-2.5 !bg-zinc-400 !border-2 !border-white dark:!border-[#141416]"
          />
        </div>
      ) : isSwitch ? (
        <div className="px-3 pb-2 space-y-1">
          {switchHandles.map((sh) => (
            <div key={sh.id} className="relative flex items-center justify-end h-4">
              <span className="text-[10px] font-mono text-zinc-500 pr-2 truncate max-w-[140px]">
                {sh.label}
              </span>
              <Handle
                id={sh.id}
                type="source"
                position={Position.Right}
                style={{ top: '50%', right: -5 }}
                className="!w-2.5 !h-2.5 !bg-[#E11D48] !border-2 !border-white dark:!border-[#141416]"
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-[#E11D48] !border-2 !border-white dark:!border-[#141416]"
        />
      )}
    </div>
  );
};
