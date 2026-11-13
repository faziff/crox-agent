import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronUp,
  CopyPlus,
  Download,
  FolderInput,
  FolderPlus,
  Hand,
  History,
  LayoutGrid,
  Loader2,
  Map as MapIcon,
  Maximize2,
  MoreHorizontal,
  MousePointer,
  PanelLeft,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  Ungroup,
  X,
} from 'lucide-react';
import { FloatingPromptBar } from '../components/nova/FloatingPromptBar';
import { CroxNodeComponent } from '../components/workflow-editor/CroxNodeComponent';
import { EditorActionsProvider } from '../components/workflow-editor/EditorActionsContext';
import {
  PublishValidationModal,
  VersionHistoryDrawer,
  WorkflowSettingsModal,
} from '../components/workflow-editor/EditorModals';
import { ExecutionPanel } from '../components/workflow-editor/ExecutionPanel';
import { GroupNode } from '../components/workflow-editor/GroupNode';
import { NodeConfigPanel } from '../components/workflow-editor/NodeConfigPanel';
import { NodePickerPanel } from '../components/workflow-editor/NodePickerPanel';
import { StickyNoteNode } from '../components/workflow-editor/StickyNoteNode';
import {
  createStickyNoteNode,
  createWorkflowNode,
} from '../constants/nodeCatalog';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  ClusterRole,
  CredentialRecord,
  CroxFlowNode,
  CroxNodeType,
  EdgeKind,
  GroupNodeData,
  NovaGenerationResult,
  ProjectRecord,
  StickyNoteNodeData,
  ValidationIssue,
  WorkflowEdge,
  WorkflowEvaluationRecord,
  WorkflowExecutionRecord,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowRecord,
  WorkflowSettings,
  WorkflowVersionRecord,
} from '../types/workflow';
import { arrangeCanvasNodes } from '../utils/canvasLayout';

type CanvasNode = Node<Record<string, unknown>>;

const NODE_TYPES: NodeTypes = {
  croxNode: CroxNodeComponent,
  stickyNote: StickyNoteNode,
  group: GroupNode,
};

const CLUSTER_ROLE_HANDLES: Record<ClusterRole, EdgeKind> = {
  languageModel: 'ai_languageModel',
  memory: 'ai_memory',
  tool: 'ai_tool',
  outputParser: 'ai_outputParser',
};

const SUBNODE_ROLE_BY_TYPE: Partial<Record<CroxNodeType, ClusterRole>> = {
  gemini_chat_model: 'languageModel',
  openai_chat_model: 'languageModel',
  anthropic_chat_model: 'languageModel',
  simple_memory: 'memory',
  windowed_memory: 'memory',
  conversation_memory: 'memory',
  structured_output_parser: 'outputParser',
  autofix_output_parser: 'outputParser',
  tool_calculator: 'tool',
  tool_http_request: 'tool',
  tool_datetime: 'tool',
  tool_workflow: 'tool',
  tool_custom: 'tool',
};

const DEFAULT_SETTINGS: WorkflowSettings = {
  timeoutMs: 15000,
  retryOnFailure: false,
  maxRetries: 1,
  retryDelayMs: 400,
  timezone: 'UTC',
};

function isClusterEdgeClient(edge: Edge, nodeMap: Map<string, CanvasNode>): boolean {
  const edgeKind = edge.data?.edgeKind as EdgeKind | undefined;
  if (edgeKind && edgeKind !== 'main') return true;
  if (typeof edge.targetHandle === 'string' && edge.targetHandle.startsWith('ai_')) return true;
  if (edge.sourceHandle === 'cluster_source') return true;
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  const srcType =
    src?.type === 'croxNode' ? (src?.data?.nodeType as CroxNodeType | undefined) : undefined;
  const tgtType =
    tgt?.type === 'croxNode' ? (tgt?.data?.nodeType as CroxNodeType | undefined) : undefined;
  if (srcType && SUBNODE_ROLE_BY_TYPE[srcType] && tgtType === 'ai_agent') return true;
  if (tgtType && SUBNODE_ROLE_BY_TYPE[tgtType] && srcType === 'ai_agent') return true;
  return false;
}

function wouldCreateCycle(edges: Edge[], nodeMap: Map<string, CanvasNode>, source: string, target: string): boolean {
  if (source === target) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (isClusterEdgeClient(e, nodeMap)) continue;
    const list = adj.get(e.source) || [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const visited = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adj.get(cur) || []) {
      stack.push(next);
    }
  }
  return false;
}

function buildEdgeStyle(edge: { sourceHandle?: string | null; targetHandle?: string | null; edgeKind?: EdgeKind }) {
  const isCluster =
    (edge.edgeKind && edge.edgeKind !== 'main') ||
    (typeof edge.targetHandle === 'string' && edge.targetHandle.startsWith('ai_')) ||
    edge.sourceHandle === 'cluster_source';
  if (isCluster) {
    return { stroke: '#0D9488', strokeWidth: 2, strokeDasharray: '5 4' };
  }
  if (edge.sourceHandle === 'false') {
    return { stroke: '#71717A', strokeWidth: 2 };
  }
  return { stroke: '#E11D48', strokeWidth: 2 };
}

function mapEdgesToReactFlow(rawEdges: WorkflowEdge[]): Edge[] {
  return (rawEdges || []).map((e) => {
    const inferredKind: EdgeKind =
      e.edgeKind ||
      (e.targetHandle === 'ai_languageModel' ||
      e.targetHandle === 'ai_memory' ||
      e.targetHandle === 'ai_tool' ||
      e.targetHandle === 'ai_outputParser'
        ? (e.targetHandle as EdgeKind)
        : 'main');
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
      label: e.label,
      type: 'default',
      data: { edgeKind: inferredKind },
      style: buildEdgeStyle({
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        edgeKind: inferredKind,
      }),
    };
  });
}

function mapWorkflowNodesToReactFlow(rawNodes: WorkflowNode[]): CanvasNode[] {
  const mapped: CanvasNode[] = (rawNodes || []).map((n) => {
    if (n.type === 'group') {
      const width = n.style?.width || n.width || 460;
      const height = n.style?.height || n.height || 260;
      return {
        id: n.id,
        type: 'group',
        position: n.position,
        style: { width, height },
        width,
        height,
        hidden: Boolean(n.hidden),
        data: n.data as Record<string, unknown>,
      };
    }
    if (n.type === 'stickyNote') {
      return {
        id: n.id,
        type: 'stickyNote',
        position: n.position,
        parentId: n.parentId,
        extent: n.extent,
        hidden: Boolean(n.hidden),
        style: n.style || {
          width: n.width || 260,
          height: n.height || 150,
        },
        width: n.width,
        height: n.height,
        data: n.data as Record<string, unknown>,
      };
    }
    return {
      id: n.id,
      type: 'croxNode',
      position: n.position,
      parentId: n.parentId,
      extent: n.extent,
      hidden: Boolean(n.hidden),
      data: n.data as Record<string, unknown>,
    };
  });
  // React Flow v12 requires parent group nodes to appear before children
  return [
    ...mapped.filter((n) => n.type === 'group'),
    ...mapped.filter((n) => n.type !== 'group'),
  ];
}

function serializeCanvasNodes(rfNodes: CanvasNode[]): WorkflowNode[] {
  const ordered = [
    ...rfNodes.filter((n) => n.type === 'group'),
    ...rfNodes.filter((n) => n.type !== 'group'),
  ];
  return ordered.map((n) => {
    if (n.type === 'group') {
      const styleWidth =
        typeof n.style?.width === 'number'
          ? n.style.width
          : typeof n.measured?.width === 'number'
            ? n.measured.width
            : typeof n.width === 'number'
              ? n.width
              : 460;
      const styleHeight =
        typeof n.style?.height === 'number'
          ? n.style.height
          : typeof n.measured?.height === 'number'
            ? n.measured.height
            : typeof n.height === 'number'
              ? n.height
              : 260;
      return {
        id: n.id,
        type: 'group',
        position: n.position,
        style: { width: styleWidth, height: styleHeight },
        width: styleWidth,
        height: styleHeight,
        ...(n.hidden ? { hidden: true } : {}),
        data: n.data as GroupNodeData,
      };
    }
    if (n.type === 'stickyNote') {
      const styleWidth =
        typeof n.style?.width === 'number'
          ? n.style.width
          : typeof n.measured?.width === 'number'
            ? n.measured.width
            : typeof n.width === 'number'
              ? n.width
              : 260;
      const styleHeight =
        typeof n.style?.height === 'number'
          ? n.style.height
          : typeof n.measured?.height === 'number'
            ? n.measured.height
            : typeof n.height === 'number'
              ? n.height
              : 150;
      return {
        id: n.id,
        type: 'stickyNote',
        position: n.position,
        ...(n.parentId ? { parentId: n.parentId } : {}),
        ...(n.extent === 'parent' ? { extent: 'parent' as const } : {}),
        ...(n.hidden ? { hidden: true } : {}),
        style: { width: styleWidth, height: styleHeight },
        width: styleWidth,
        height: styleHeight,
        data: n.data as StickyNoteNodeData,
      };
    }

    const { executionStatus: _s, executionDurationMs: _d, simulated: _sim, ...restData } = n.data;
    return {
      id: n.id,
      type: 'croxNode',
      position: n.position,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      ...(n.extent === 'parent' ? { extent: 'parent' as const } : {}),
      ...(n.hidden ? { hidden: true } : {}),
      data: restData as WorkflowNodeData,
    };
  });
}

function serializeCanvasEdges(rfEdges: Edge[]): WorkflowEdge[] {
  return rfEdges.map((e) => {
    const inferredKind: EdgeKind =
      (e.data?.edgeKind as EdgeKind | undefined) ||
      (e.targetHandle === 'ai_languageModel' ||
      e.targetHandle === 'ai_memory' ||
      e.targetHandle === 'ai_tool' ||
      e.targetHandle === 'ai_outputParser'
        ? (e.targetHandle as EdgeKind)
        : 'main');
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
      label: typeof e.label === 'string' ? e.label : undefined,
      edgeKind: inferredKind,
    };
  });
}

function computeClientValidation(rfNodes: CanvasNode[], rfEdges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const functional = rfNodes.filter((n) => n.type !== 'stickyNote' && n.type !== 'group');
  if (functional.length === 0) {
    issues.push({
      id: 'empty_wf',
      severity: 'error',
      code: 'EMPTY_WORKFLOW',
      message: 'Add at least one trigger or action node before running or publishing.',
    });
    return issues;
  }

  const nodeMap = new Map(functional.map((n) => [n.id, n]));
  const hasTrigger = functional.some((n) => (n.data as WorkflowNodeData).category === 'triggers');
  if (!hasTrigger) {
    issues.push({
      id: 'missing_trigger',
      severity: 'warning',
      code: 'MISSING_TRIGGER',
      message: 'No Trigger node found. Manual runs will start from root nodes.',
    });
  }

  for (const n of functional) {
    const data = n.data as WorkflowNodeData;
    if (data.disabled) continue;
    const role = SUBNODE_ROLE_BY_TYPE[data.nodeType];

    if (role) {
      const attached = rfEdges.some((e) => {
        if (e.source !== n.id && e.target !== n.id) return false;
        const otherId = e.source === n.id ? e.target : e.source;
        const other = nodeMap.get(otherId);
        return other && (other.data as WorkflowNodeData).nodeType === 'ai_agent';
      });
      if (!attached) {
        issues.push({
          id: `orphan_subnode_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'ORPHAN_SUBNODE',
          message: `AI sub-node "${data.label}" must be attached to an AI Agent port.`,
        });
      }
      continue;
    }

    if (data.nodeType === 'ai_agent') {
      const cfg = data.config as { prompt?: string };
      const hasModel = rfEdges.some((e) => {
        if (e.target === n.id && e.targetHandle === 'ai_languageModel') return true;
        if (e.source === n.id && e.sourceHandle === 'ai_languageModel') return true;
        const otherId = e.target === n.id ? e.source : e.source === n.id ? e.target : null;
        if (!otherId) return false;
        const other = nodeMap.get(otherId);
        const otherType = (other?.data as WorkflowNodeData | undefined)?.nodeType;
        return Boolean(otherType && SUBNODE_ROLE_BY_TYPE[otherType] === 'languageModel');
      });
      if (!hasModel) {
        issues.push({
          id: `agent_no_model_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'AGENT_MISSING_MODEL',
          message: `AI Agent "${data.label}" requires a connected Chat Model sub-node.`,
        });
      }
      if (!cfg?.prompt?.trim()) {
        issues.push({
          id: `agent_no_prompt_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'AGENT_MISSING_PROMPT',
          message: `AI Agent "${data.label}" requires a prompt.`,
        });
      }
    } else if (data.nodeType === 'ai_node') {
      const cfg = data.config as { prompt?: string };
      if (!cfg?.prompt?.trim()) {
        issues.push({
          id: `ai_no_prompt_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'AI_MISSING_PROMPT',
          message: `AI Node "${data.label}" requires a prompt.`,
        });
      }
    } else if (data.nodeType === 'http_request') {
      const cfg = data.config as { url?: string };
      if (!cfg?.url?.trim()) {
        issues.push({
          id: `http_no_url_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'HTTP_MISSING_URL',
          message: `HTTP Request "${data.label}" requires a URL.`,
        });
      }
    } else if (data.nodeType === 'send_email') {
      const cfg = data.config as { to?: string; subject?: string };
      if (!cfg?.to?.trim() || !cfg?.subject?.trim()) {
        issues.push({
          id: `email_incomplete_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'EMAIL_INCOMPLETE',
          message: `Send Email "${data.label}" requires recipient and subject.`,
        });
      }
    } else if (data.nodeType === 'condition') {
      const cfg = data.config as { inputVariable?: string };
      if (!cfg?.inputVariable?.trim()) {
        issues.push({
          id: `cond_no_var_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'CONDITION_MISSING_VAR',
          message: `Condition "${data.label}" requires an input variable path.`,
        });
      }
    } else if (data.nodeType === 'execute_workflow') {
      const cfg = data.config as { targetWorkflowId?: string };
      if (!cfg?.targetWorkflowId?.trim()) {
        issues.push({
          id: `subwf_no_id_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'SUBWORKFLOW_MISSING_ID',
          message: `Execute Sub-Workflow "${data.label}" requires a target workflow.`,
        });
      }
    } else if (data.nodeType === 'integration_action') {
      const cfg = data.config as { appId?: string; actionId?: string };
      if (!cfg?.appId?.trim() || !cfg?.actionId?.trim()) {
        issues.push({
          id: `integration_incomplete_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'INTEGRATION_INCOMPLETE',
          message: `Integration "${data.label}" requires selecting an app and action.`,
        });
      }
    } else if (data.nodeType === 'agent_orchestrator') {
      const cfg = data.config as { goal?: string; agentWorkflowIds?: string[] };
      if (!cfg?.goal?.trim()) {
        issues.push({
          id: `orch_no_goal_${n.id}`,
          nodeId: n.id,
          severity: 'error',
          code: 'ORCHESTRATOR_MISSING_GOAL',
          message: `Agent Orchestrator "${data.label}" requires an orchestration goal.`,
        });
      } else if (!Array.isArray(cfg?.agentWorkflowIds) || cfg.agentWorkflowIds.length === 0) {
        issues.push({
          id: `orch_no_agents_${n.id}`,
          nodeId: n.id,
          severity: 'warning',
          code: 'ORCHESTRATOR_NO_AGENTS',
          message: `Agent Orchestrator "${data.label}" has no delegated sub-agent workflows selected yet.`,
        });
      }
    }
  }

  return issues;
}

interface EditorInnerProps {
  workflowId: string;
  projects?: ProjectRecord[];
  onBack: () => void;
  onOpenWorkflow?: (workflowId: string) => void;
  externalNodesPatch?: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; name?: string } | null;
  onClearExternalPatch?: () => void;
}

interface QuickPickerContext {
  open: boolean;
  sourceNodeId?: string;
  sourceHandle?: string;
  sourceNodeType?: CroxNodeType | null;
  agentNodeId?: string;
  clusterRoleFilter?: ClusterRole | null;
  targetHandle?: EdgeKind;
}

const WorkflowEditorInner: React.FC<EditorInnerProps> = ({
  workflowId,
  projects = [],
  onBack,
  onOpenWorkflow,
  externalNodesPatch,
  onClearExternalPatch,
}) => {
  const { screenToFlowPosition, fitView, setCenter, zoomTo } = useReactFlow();
  const { theme } = useAuth();

  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [allWorkflows, setAllWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'editor' | 'executions' | 'evaluations'>('editor');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [runState, setRunState] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [latestExecution, setLatestExecution] = useState<WorkflowExecutionRecord | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(false);

  const [workflowExecutions, setWorkflowExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [evaluations, setEvaluations] = useState<WorkflowEvaluationRecord[]>([]);
  const [evaluating, setEvaluating] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [emptyHelperDismissed, setEmptyHelperDismissed] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select');
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPos: { x: number; y: number };
    nodeId?: string;
  } | null>(null);

  const [quickPicker, setQuickPicker] = useState<QuickPickerContext>({ open: false });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<WorkflowVersionRecord[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [confirmDeleteWorkflow, setConfirmDeleteWorkflow] = useState(false);
  const [moveProjectId, setMoveProjectId] = useState('');

  const historyRef = useRef<Array<{ nodes: CanvasNode[]; edges: Edge[] }>>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const clipboardNodeRef = useRef<CanvasNode | null>(null);
  const promptBarContainerRef = useRef<HTMLDivElement | null>(null);

  const pushHistory = useCallback((nextNodes: CanvasNode[], nextEdges: Edge[]) => {
    if (skipHistoryRef.current) return;
    const sliced = historyRef.current.slice(0, historyIndexRef.current + 1);
    sliced.push({
      nodes: JSON.parse(JSON.stringify(nextNodes)),
      edges: JSON.parse(JSON.stringify(nextEdges)),
    });
    if (sliced.length > 35) sliced.shift();
    historyRef.current = sliced;
    historyIndexRef.current = sliced.length - 1;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorBanner(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setInspectorOpen(false);
    setMoreMenuOpen(false);
    setConfirmDeleteWorkflow(false);

    Promise.all([
      api.workflows.get(workflowId),
      api.credentials.list(),
      api.workflows.list(),
      api.workflows.executions(workflowId).catch(() => ({ executions: [] })),
    ])
      .then(([wfRes, credRes, wfListRes, execRes]) => {
        if (!active) return;
        const wf = wfRes.workflow;
        setWorkflow(wf);
        setWorkflowName(wf.name);
        setMoveProjectId(wf.projectId || '');
        const rfNodes = mapWorkflowNodesToReactFlow(wf.nodes);
        const rfEdges = mapEdgesToReactFlow(wf.edges);
        setNodes(rfNodes);
        setEdges(rfEdges);
        setCredentials(credRes.credentials);
        setAllWorkflows(wfListRes.workflows);
        setWorkflowExecutions(execRes.executions);
        setLatestExecution(execRes.executions[0] || null);
        setSaveState('saved');
        historyRef.current = [
          {
            nodes: JSON.parse(JSON.stringify(rfNodes)),
            edges: JSON.parse(JSON.stringify(rfEdges)),
          },
        ];
        historyIndexRef.current = 0;
        setTimeout(() => fitView({ padding: 0.25 }), 60);
      })
      .catch((err) => {
        if (!active) return;
        setErrorBanner(err instanceof Error ? err.message : 'Failed to load workflow.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [workflowId, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (activeTab === 'executions') {
      api.workflows
        .executions(workflowId)
        .then((res) => setWorkflowExecutions(res.executions))
        .catch(() => {});
    } else if (activeTab === 'evaluations') {
      api.workflows
        .evaluations(workflowId)
        .then((res) => setEvaluations(res.evaluations))
        .catch(() => {});
    }
  }, [activeTab, workflowId]);

  const applyGeneratedWorkflow = useCallback(
    (generated: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; name?: string }) => {
      const rfNodes = mapWorkflowNodesToReactFlow(generated.nodes);
      const rfEdges = mapEdgesToReactFlow(generated.edges);
      setNodes(rfNodes);
      setEdges(rfEdges);
      if (
        generated.name &&
        (!workflowName || workflowName === 'My workflow' || workflowName === 'Untitled Workflow')
      ) {
        setWorkflowName(generated.name);
      }
      setSaveState('unsaved');
      pushHistory(rfNodes, rfEdges);
      setTimeout(() => fitView({ padding: 0.25 }), 60);
    },
    [workflowName, setNodes, setEdges, pushHistory, fitView]
  );

  useEffect(() => {
    if (!externalNodesPatch) return;
    applyGeneratedWorkflow(externalNodesPatch);
    onClearExternalPatch?.();
  }, [externalNodesPatch, onClearExternalPatch, applyGeneratedWorkflow]);

  const handleApplyPromptBar = useCallback(
    (generated: NovaGenerationResult) => {
      applyGeneratedWorkflow({
        name: generated.name,
        nodes: generated.nodes,
        edges: generated.edges,
      });
    },
    [applyGeneratedWorkflow]
  );

  const allSerializedNodes = useMemo(() => serializeCanvasNodes(nodes), [nodes]);
  const allSerializedEdges = useMemo(() => serializeCanvasEdges(edges), [edges]);

  const selectedNode = useMemo<CroxFlowNode | null>(() => {
    const found = nodes.find((n) => n.id === selectedNodeId && n.type === 'croxNode');
    return found ? (found as unknown as CroxFlowNode) : null;
  }, [nodes, selectedNodeId]);

  const latestNodeResult = useMemo(() => {
    if (!selectedNodeId || !latestExecution?.nodeResults) return null;
    return latestExecution.nodeResults.find((r) => r.nodeId === selectedNodeId) || null;
  }, [selectedNodeId, latestExecution]);

  const validationIssues = useMemo(
    () => computeClientValidation(nodes, edges),
    [nodes, edges]
  );

  const validationIssuesByNode = useMemo(() => {
    const map: Record<string, ValidationIssue[]> = {};
    for (const issue of validationIssues) {
      if (!issue.nodeId) continue;
      if (!map[issue.nodeId]) map[issue.nodeId] = [];
      map[issue.nodeId].push(issue);
    }
    return map;
  }, [validationIssues]);

  const applyExecutionVisuals = useCallback(
    (exec: WorkflowExecutionRecord) => {
      setLatestExecution(exec);
      setLogsExpanded(true);
      const resultByNode = new Map((exec.nodeResults || []).map((r) => [r.nodeId, r]));
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type !== 'croxNode') return n;
          const nr = resultByNode.get(n.id);
          return {
            ...n,
            data: {
              ...n.data,
              executionStatus: nr ? nr.status : undefined,
              executionDurationMs: nr ? nr.durationMs : undefined,
              simulated: nr ? nr.simulated : false,
            },
          };
        })
      );
    },
    [setNodes]
  );

  const handleSave = useCallback(
    async (opts?: { saveVersion?: boolean; versionNote?: string }): Promise<WorkflowRecord | null> => {
      if (!workflow) return null;
      setSaveState('saving');
      setErrorBanner(null);

      try {
        const cleanNodes = serializeCanvasNodes(nodes);
        const cleanEdges = serializeCanvasEdges(edges);

        const res = await api.workflows.update(workflow.id, {
          name: workflowName.trim() || 'Untitled Workflow',
          nodes: cleanNodes,
          edges: cleanEdges,
          settings: workflow.settings,
          ...(opts?.saveVersion ? { saveVersion: true, versionNote: opts.versionNote } : {}),
        });

        setWorkflow(res.workflow);
        setWorkflowName(res.workflow.name);
        setSaveState('saved');
        return res.workflow;
      } catch (err) {
        setSaveState('unsaved');
        setErrorBanner(err instanceof Error ? err.message : 'Failed to save workflow.');
        return null;
      }
    },
    [workflow, workflowName, nodes, edges]
  );

  const handleToggleActive = async () => {
    if (!workflow) return;
    setErrorBanner(null);

    if (!workflow.isActive) {
      const blockingErrors = validationIssues.filter((i) => i.severity === 'error');
      if (blockingErrors.length > 0) {
        setValidationOpen(true);
        setErrorBanner(
          `Resolve ${blockingErrors.length} validation error${blockingErrors.length === 1 ? '' : 's'} before publishing.`
        );
        return;
      }
    }

    let targetWorkflow = workflow;
    if (saveState === 'unsaved') {
      const saved = await handleSave();
      if (!saved) return;
      targetWorkflow = saved;
    }

    try {
      const res = await api.workflows.setStatus(targetWorkflow.id, !targetWorkflow.isActive);
      setWorkflow(res.workflow);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to change publish status.');
    }
  };

  const handleExecute = useCallback(
    async (mode: 'manual' | 'test') => {
      if (!workflow) return;
      setErrorBanner(null);
      let targetWorkflow = workflow;
      if (saveState === 'unsaved') {
        const saved = await handleSave();
        if (!saved) return;
        targetWorkflow = saved;
      }

      setRunState('running');
      setNodes((prev) =>
        prev.map((n) =>
          n.type !== 'croxNode'
            ? n
            : {
                ...n,
                data: { ...n.data, executionStatus: 'pending', executionDurationMs: undefined, simulated: false },
              }
        )
      );

      try {
        const res = await api.workflows.run(targetWorkflow.id, mode);
        const exec = res.execution;
        setRunState(exec.status === 'success' ? 'completed' : 'failed');
        applyExecutionVisuals(exec);
        setWorkflowExecutions((prev) => [exec, ...prev.filter((p) => p.id !== exec.id)].slice(0, 20));
      } catch (err) {
        setRunState('failed');
        setErrorBanner(err instanceof Error ? err.message : 'Workflow execution failed.');
      }
    },
    [workflow, saveState, handleSave, setNodes, applyExecutionVisuals]
  );

  const handleRunFromNode = useCallback(
    async (nodeId: string) => {
      if (!workflow) return;
      setErrorBanner(null);
      let targetWorkflow = workflow;
      if (saveState === 'unsaved') {
        const saved = await handleSave();
        if (!saved) return;
        targetWorkflow = saved;
      }
      setRunState('running');
      try {
        const res = await api.workflows.runFromNode(targetWorkflow.id, nodeId);
        const exec = res.execution;
        setRunState(exec.status === 'success' ? 'completed' : 'failed');
        applyExecutionVisuals(exec);
        setWorkflowExecutions((prev) => [exec, ...prev.filter((p) => p.id !== exec.id)].slice(0, 20));
      } catch (err) {
        setRunState('failed');
        setErrorBanner(err instanceof Error ? err.message : 'Failed partial execution from node.');
      }
    },
    [workflow, saveState, handleSave, applyExecutionVisuals]
  );

  const handleTestNodeById = useCallback(
    async (nodeId: string) => {
      const target = nodes.find((n) => n.id === nodeId && n.type === 'croxNode');
      if (!target || !workflow) return;
      setSelectedNodeId(nodeId);
      setInspectorOpen(true);
      setErrorBanner(null);

      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'running' } } : n
        )
      );

      try {
        const cleanTarget = serializeCanvasNodes([target])[0];
        const res = await api.workflows.testNode(
          workflow.id,
          cleanTarget,
          undefined,
          allSerializedNodes,
          allSerializedEdges
        );
        const stepResult = res.result;
        const syntheticExec: WorkflowExecutionRecord = {
          id: `step_${Date.now()}`,
          workflowId: workflow.id,
          userId: workflow.userId,
          triggerType: 'test',
          status: 'success',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: stepResult.durationMs,
          summary: { totalNodes: 1, successCount: 1, failedCount: 0, skippedCount: 0 },
          errorMessage: null,
          nodeResults: [
            {
              id: `nr_${nodeId}`,
              executionId: 'step_test',
              nodeId,
              nodeName: String((target.data as WorkflowNodeData).label || nodeId),
              nodeType: (target.data as WorkflowNodeData).nodeType,
              status: 'success',
              input: {},
              output: stepResult.output,
              errorMessage: null,
              durationMs: stepResult.durationMs,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              simulated: stepResult.simulated,
            },
          ],
        };
        setLatestExecution(syntheticExec);
        setLogsExpanded(true);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    executionStatus: 'success',
                    executionDurationMs: stepResult.durationMs,
                    simulated: stepResult.simulated,
                  },
                }
              : n
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Node test failed.';
        setErrorBanner(msg);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, executionStatus: 'failed' } } : n
          )
        );
      }
    },
    [nodes, workflow, allSerializedNodes, allSerializedEdges, setNodes]
  );

  const handleRunEvaluation = async (runTest: boolean) => {
    if (!workflow) return;
    setEvaluating(true);
    setErrorBanner(null);
    if (saveState === 'unsaved') {
      await handleSave();
    }
    try {
      const res = await api.workflows.evaluate(workflow.id, runTest);
      setEvaluations((prev) => [res.evaluation, ...prev]);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        setErrorBanner('Self-connections are not allowed.');
        return;
      }

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const srcNode = nodeMap.get(connection.source);
      const tgtNode = nodeMap.get(connection.target);
      if (!srcNode || !tgtNode) return;
      if (srcNode.type !== 'croxNode' || tgtNode.type !== 'croxNode') return;

      const srcType = (srcNode.data as WorkflowNodeData).nodeType;
      const tgtType = (tgtNode.data as WorkflowNodeData).nodeType;
      const srcRole = SUBNODE_ROLE_BY_TYPE[srcType];
      const tgtRole = SUBNODE_ROLE_BY_TYPE[tgtType];

      const isClusterAttempt =
        Boolean(srcRole) ||
        Boolean(tgtRole) ||
        Boolean(connection.targetHandle?.startsWith('ai_')) ||
        Boolean(connection.sourceHandle?.startsWith('ai_')) ||
        connection.sourceHandle === 'cluster_source';

      if (isClusterAttempt) {
        let subNode = srcNode;
        let agentNode = tgtNode;
        let portHandle = connection.targetHandle || '';

        if ((srcType === 'ai_agent' || srcType === 'agent_orchestrator') && tgtRole) {
          subNode = tgtNode;
          agentNode = srcNode;
          portHandle = connection.sourceHandle || CLUSTER_ROLE_HANDLES[tgtRole];
        }

        const subType = (subNode.data as WorkflowNodeData).nodeType;
        const subRole = SUBNODE_ROLE_BY_TYPE[subType];

        const agentNodeType = (agentNode.data as WorkflowNodeData).nodeType;
        if ((agentNodeType !== 'ai_agent' && agentNodeType !== 'agent_orchestrator') || !subRole) {
          setErrorBanner('AI sub-nodes (Chat Models, Memory, Tools, Parsers) can only connect to an AI Agent or Orchestrator port.');
          return;
        }

        const expectedHandle = CLUSTER_ROLE_HANDLES[subRole];
        const resolvedHandle = (portHandle && portHandle.startsWith('ai_') ? portHandle : expectedHandle) as EdgeKind;
        if (resolvedHandle !== expectedHandle) {
          setErrorBanner(
            `"${(subNode.data as WorkflowNodeData).label}" cannot connect to "${resolvedHandle}". Use the matching ${subRole} port.`
          );
          return;
        }

        if (subRole !== 'tool') {
          const alreadyConnected = edges.some(
            (e) =>
              (e.target === agentNode.id && e.targetHandle === expectedHandle) ||
              (e.source === agentNode.id && e.sourceHandle === expectedHandle)
          );
          if (alreadyConnected) {
            setErrorBanner(`This ${agentNodeType === 'agent_orchestrator' ? 'Orchestrator' : 'AI Agent'} already has a ${subRole} node connected. Remove it first to swap.`);
            return;
          }
        }

        setErrorBanner(null);
        const newClusterEdge: Edge = {
          id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          source: subNode.id,
          target: agentNode.id,
          sourceHandle: 'cluster_source',
          targetHandle: expectedHandle,
          type: 'default',
          data: { edgeKind: expectedHandle },
          style: buildEdgeStyle({ targetHandle: expectedHandle, edgeKind: expectedHandle }),
        };

        setEdges((eds) => {
          const next = addEdge(newClusterEdge, eds);
          pushHistory(nodes, next);
          return next;
        });
        setSaveState('unsaved');
        return;
      }

      if (wouldCreateCycle(edges, nodeMap, connection.source, connection.target)) {
        setErrorBanner('Circular loop detected. Cycles are not supported in workflow graphs.');
        return;
      }

      setErrorBanner(null);
      const label =
        connection.sourceHandle === 'true'
          ? 'True'
          : connection.sourceHandle === 'false'
            ? 'False'
            : connection.sourceHandle && connection.sourceHandle !== 'main'
              ? connection.sourceHandle
              : undefined;

      const newEdge: Edge = {
        id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        type: 'default',
        label,
        data: { edgeKind: 'main' as EdgeKind },
        style: buildEdgeStyle({ sourceHandle: connection.sourceHandle, edgeKind: 'main' }),
      };

      setEdges((eds) => {
        const next = addEdge(newEdge, eds);
        pushHistory(nodes, next);
        return next;
      });
      setSaveState('unsaved');
    },
    [edges, nodes, setEdges, pushHistory]
  );

  const addNodeAtPosition = useCallback(
    (nodeType: CroxNodeType, pos: { x: number; y: number }): CanvasNode => {
      const created = createWorkflowNode(nodeType, pos) as unknown as CanvasNode;
      setNodes((prev) => {
        const next = [...prev, created];
        pushHistory(next, edges);
        return next;
      });
      setSelectedNodeId(created.id);
      setInspectorOpen(true);
      setSaveState('unsaved');
      return created;
    },
    [edges, setNodes, pushHistory]
  );

  const handleAddStickyNote = useCallback(
    (pos?: { x: number; y: number }) => {
      const targetPos = pos || {
        x: 180 + (nodes.length % 4) * 45,
        y: 80 + (nodes.length % 3) * 45,
      };
      const note = createStickyNoteNode(targetPos) as unknown as CanvasNode;
      setNodes((prev) => {
        const next = [...prev, note];
        pushHistory(next, edges);
        return next;
      });
      setSelectedNodeId(note.id);
      setInspectorOpen(false);
      setSaveState('unsaved');
    },
    [nodes.length, edges, setNodes, pushHistory]
  );

  const handleQuickPickSelect = useCallback(
    (nodeType: CroxNodeType) => {
      const ctx = quickPicker;
      setQuickPicker({ open: false });

      if (ctx.agentNodeId && ctx.targetHandle) {
        const agent = nodes.find((n) => n.id === ctx.agentNodeId);
        const portOffsets: Record<string, number> = {
          ai_languageModel: -165,
          ai_memory: -55,
          ai_tool: 70,
          ai_outputParser: 185,
        };
        const basePos = agent?.position || { x: 400, y: 200 };
        const samePortCount = edges.filter(
          (e) => e.target === ctx.agentNodeId && e.targetHandle === ctx.targetHandle
        ).length;
        const pos = {
          x: basePos.x + (portOffsets[ctx.targetHandle] ?? 0) + samePortCount * 35,
          y: basePos.y + 195 + samePortCount * 85,
        };
        const created = createWorkflowNode(nodeType, pos) as unknown as CanvasNode;
        const newEdge: Edge = {
          id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          source: created.id,
          target: ctx.agentNodeId,
          sourceHandle: 'cluster_source',
          targetHandle: ctx.targetHandle,
          type: 'default',
          data: { edgeKind: ctx.targetHandle },
          style: buildEdgeStyle({ targetHandle: ctx.targetHandle, edgeKind: ctx.targetHandle }),
        };
        setNodes((prev) => {
          const nextNodes = [...prev, created];
          const nextEdges = addEdge(newEdge, edges);
          setEdges(nextEdges);
          pushHistory(nextNodes, nextEdges);
          return nextNodes;
        });
        setSelectedNodeId(created.id);
        setInspectorOpen(true);
        setSaveState('unsaved');
        return;
      }

      if (ctx.sourceNodeId) {
        const src = nodes.find((n) => n.id === ctx.sourceNodeId);
        const basePos = src?.position || { x: 240, y: 200 };
        const existingOut = edges.filter((e) => e.source === ctx.sourceNodeId).length;
        const branchOffset =
          ctx.sourceHandle === 'false' ? 110 : ctx.sourceHandle === 'true' ? -70 : existingOut * 95;
        const pos = {
          x: basePos.x + 310,
          y: basePos.y + branchOffset,
        };
        const created = createWorkflowNode(nodeType, pos) as unknown as CanvasNode;
        const newEdge: Edge = {
          id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          source: ctx.sourceNodeId,
          target: created.id,
          sourceHandle: ctx.sourceHandle || undefined,
          type: 'default',
          label:
            ctx.sourceHandle === 'true'
              ? 'True'
              : ctx.sourceHandle === 'false'
                ? 'False'
                : undefined,
          data: { edgeKind: 'main' as EdgeKind },
          style: buildEdgeStyle({ sourceHandle: ctx.sourceHandle, edgeKind: 'main' }),
        };
        setNodes((prev) => {
          const nextNodes = [...prev, created];
          const nextEdges = addEdge(newEdge, edges);
          setEdges(nextEdges);
          pushHistory(nextNodes, nextEdges);
          return nextNodes;
        });
        setSelectedNodeId(created.id);
        setInspectorOpen(true);
        setSaveState('unsaved');
        return;
      }

      addNodeAtPosition(nodeType, {
        x: 160 + nodes.length * 46,
        y: 150 + (nodes.length % 4) * 58,
      });
    },
    [quickPicker, nodes, edges, setNodes, setEdges, pushHistory, addNodeAtPosition]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/crox-node') as CroxNodeType;
      if (!nodeType) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeAtPosition(nodeType, position);
    },
    [screenToFlowPosition, addNodeAtPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleChangeNode = useCallback(
    (nodeId: string, updater: (node: WorkflowNode) => WorkflowNode) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? (updater(n as unknown as WorkflowNode) as unknown as CanvasNode) : n))
      );
      setSaveState('unsaved');
    },
    [setNodes]
  );

  const handleUpdateStickyNote = useCallback(
    (nodeId: string, patch: Partial<StickyNoteNodeData>) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      setSaveState('unsaved');
    },
    [setNodes]
  );

  const handleUpdateGroupNode = useCallback(
    (nodeId: string, patch: Partial<GroupNodeData>) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      setSaveState('unsaved');
    },
    [setNodes]
  );

  const handleGroupSelectedNodes = useCallback(
    (anchorPos?: { x: number; y: number }) => {
      const candidates = nodes.filter(
        (n) => n.selected && n.type !== 'group' && !n.parentId
      );
      const groupId = `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      if (candidates.length >= 2) {
        const padding = 44;
        const headerOffset = 54;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const c of candidates) {
          const w = c.measured?.width ?? (typeof c.width === 'number' ? c.width : 240);
          const h = c.measured?.height ?? (typeof c.height === 'number' ? c.height : 110);
          minX = Math.min(minX, c.position.x);
          minY = Math.min(minY, c.position.y);
          maxX = Math.max(maxX, c.position.x + w);
          maxY = Math.max(maxY, c.position.y + h);
        }

        const gx = Math.round(minX - padding);
        const gy = Math.round(minY - headerOffset);
        const gw = Math.max(320, Math.round(maxX - minX + padding * 2));
        const gh = Math.max(220, Math.round(maxY - minY + padding + headerOffset));

        const groupNode: CanvasNode = {
          id: groupId,
          type: 'group',
          position: { x: gx, y: gy },
          style: { width: gw, height: gh },
          width: gw,
          height: gh,
          data: { title: 'Step Group', color: 'zinc', collapsed: false },
        };

        const candidateIds = new Set(candidates.map((c) => c.id));
        const updatedChildren = nodes.map((n) =>
          candidateIds.has(n.id)
            ? {
                ...n,
                parentId: groupId,
                extent: 'parent' as const,
                selected: false,
                position: {
                  x: Math.round(n.position.x - gx),
                  y: Math.round(n.position.y - gy),
                },
              }
            : n
        );
        const nextNodes = [
          groupNode,
          ...updatedChildren.filter((n) => n.type === 'group'),
          ...updatedChildren.filter((n) => n.type !== 'group'),
        ];
        setNodes(nextNodes);
        pushHistory(nextNodes, edges);
        setSelectedNodeId(groupId);
        setInspectorOpen(false);
        setSaveState('unsaved');
        return;
      }

      const pos = anchorPos || {
        x: 160 + (nodes.filter((n) => n.type === 'group').length % 3) * 60,
        y: 120 + (nodes.filter((n) => n.type === 'group').length % 3) * 50,
      };
      const emptyGroup: CanvasNode = {
        id: groupId,
        type: 'group',
        position: pos,
        style: { width: 460, height: 260 },
        width: 460,
        height: 260,
        data: { title: 'Workflow Group', color: 'zinc', collapsed: false },
      };
      const nextNodes = [emptyGroup, ...nodes];
      setNodes(nextNodes);
      pushHistory(nextNodes, edges);
      setSelectedNodeId(groupId);
      setInspectorOpen(false);
      setSaveState('unsaved');
    },
    [nodes, edges, setNodes, pushHistory]
  );

  const handleToggleCollapseGroup = useCallback(
    (groupId: string) => {
      const targetGroup = nodes.find((n) => n.id === groupId && n.type === 'group');
      if (!targetGroup) return;
      const isCollapsed = Boolean((targetGroup.data as GroupNodeData).collapsed);
      const nextCollapsed = !isCollapsed;

      const currentHeight =
        typeof targetGroup.style?.height === 'number'
          ? targetGroup.style.height
          : typeof targetGroup.height === 'number'
            ? targetGroup.height
            : 260;
      const currentWidth =
        typeof targetGroup.style?.width === 'number'
          ? targetGroup.style.width
          : typeof targetGroup.width === 'number'
            ? targetGroup.width
            : 460;
      const savedExpandedHeight =
        typeof targetGroup.data?.expandedHeight === 'number'
          ? targetGroup.data.expandedHeight
          : currentHeight;
      const nextHeight = nextCollapsed ? 56 : Math.max(180, savedExpandedHeight);

      const childIds = new Set(nodes.filter((n) => n.parentId === groupId).map((n) => n.id));
      const nextNodes = nodes.map((n) => {
        if (n.id === groupId) {
          return {
            ...n,
            style: { width: currentWidth, height: nextHeight },
            height: nextHeight,
            data: {
              ...n.data,
              collapsed: nextCollapsed,
              expandedHeight: nextCollapsed ? currentHeight : savedExpandedHeight,
            },
          };
        }
        if (childIds.has(n.id)) {
          return { ...n, hidden: nextCollapsed };
        }
        return n;
      });

      const nextEdges = edges.map((e) =>
        childIds.has(e.source) || childIds.has(e.target) ? { ...e, hidden: nextCollapsed } : e
      );

      setNodes(nextNodes);
      setEdges(nextEdges);
      pushHistory(nextNodes, nextEdges);
      setSaveState('unsaved');
    },
    [nodes, edges, setNodes, setEdges, pushHistory]
  );

  const handleUngroupNode = useCallback(
    (groupId: string) => {
      const groupNode = nodes.find((n) => n.id === groupId && n.type === 'group');
      if (!groupNode) return;
      const childIds = new Set(nodes.filter((n) => n.parentId === groupId).map((n) => n.id));

      const nextNodes = nodes
        .filter((n) => n.id !== groupId)
        .map((n) => {
          if (n.parentId !== groupId) return n;
          const { parentId: _p, extent: _ex, ...rest } = n;
          return {
            ...rest,
            hidden: false,
            position: {
              x: Math.round(groupNode.position.x + n.position.x),
              y: Math.round(groupNode.position.y + n.position.y),
            },
          };
        });

      const nextEdges = edges.map((e) =>
        childIds.has(e.source) || childIds.has(e.target) ? { ...e, hidden: false } : e
      );

      setNodes(nextNodes);
      setEdges(nextEdges);
      pushHistory(nextNodes, nextEdges);
      if (selectedNodeId === groupId) setSelectedNodeId(null);
      setSaveState('unsaved');
    },
    [nodes, edges, selectedNodeId, setNodes, setEdges, pushHistory]
  );

  const handleAutoArrange = useCallback(() => {
    const arranged = arrangeCanvasNodes(nodes, edges);
    setNodes(arranged);
    pushHistory(arranged, edges);
    setSaveState('unsaved');
    setTimeout(() => void fitView({ padding: 0.22, duration: 250 }), 40);
  }, [nodes, edges, setNodes, pushHistory, fitView]);

  const handleCancelExecution = useCallback(async (execId: string) => {
    try {
      const res = await api.executions.cancel(execId);
      setLatestExecution(res.execution);
      setWorkflowExecutions((prev) =>
        prev.map((e) => (e.id === execId ? res.execution : e))
      );
      setRunState('idle');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to cancel execution.');
    }
  }, []);

  const handleToggleDisableNode = useCallback(
    (nodeId: string) => {
      setNodes((prev) => {
        const next = prev.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, disabled: !n.data.disabled } } : n
        );
        pushHistory(next, edges);
        return next;
      });
      setSaveState('unsaved');
    },
    [edges, setNodes, pushHistory]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (!target) return;
      const newId = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const copy: CanvasNode = {
        ...JSON.parse(JSON.stringify(target)),
        id: newId,
        position: { x: target.position.x + 40, y: target.position.y + 60 },
        data: {
          ...JSON.parse(JSON.stringify(target.data)),
          ...(target.type === 'croxNode'
            ? {
                label: `${String(target.data.label || 'Node')} (Copy)`,
                executionStatus: undefined,
                executionDurationMs: undefined,
              }
            : {}),
        },
      };
      setNodes((prev) => {
        const next = [...prev, copy];
        pushHistory(next, edges);
        return next;
      });
      setSelectedNodeId(newId);
      setSaveState('unsaved');
    },
    [nodes, edges, setNodes, pushHistory]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (target?.type === 'group') {
        handleUngroupNode(nodeId);
        return;
      }
      setNodes((prev) => {
        const nextNodes = prev.filter((n) => n.id !== nodeId);
        const nextEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
        setEdges(nextEdges);
        pushHistory(nextNodes, nextEdges);
        return nextNodes;
      });
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
        setInspectorOpen(false);
      }
      setSaveState('unsaved');
    },
    [nodes, edges, selectedNodeId, setNodes, setEdges, pushHistory, handleUngroupNode]
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snap = historyRef.current[historyIndexRef.current];
    skipHistoryRef.current = true;
    setNodes(JSON.parse(JSON.stringify(snap.nodes)));
    setEdges(JSON.parse(JSON.stringify(snap.edges)));
    setSaveState('unsaved');
    setTimeout(() => {
      skipHistoryRef.current = false;
    }, 0);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    skipHistoryRef.current = true;
    setNodes(JSON.parse(JSON.stringify(snap.nodes)));
    setEdges(JSON.parse(JSON.stringify(snap.edges)));
    setSaveState('unsaved');
    setTimeout(() => {
      skipHistoryRef.current = false;
    }, 0);
  }, [setNodes, setEdges]);

  // Guarded keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        setQuickPicker({ open: false });
        setMoreMenuOpen(false);
        setSettingsModalOpen(false);
        setVersionsOpen(false);
        setValidationOpen(false);
        setContextMenu(null);
        return;
      }

      if (isEditing) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key.toLowerCase() === 'c' && selectedNodeId) {
        const found = nodes.find((n) => n.id === selectedNodeId);
        if (found) clipboardNodeRef.current = JSON.parse(JSON.stringify(found));
      } else if (mod && e.key.toLowerCase() === 'v' && clipboardNodeRef.current) {
        e.preventDefault();
        const src = clipboardNodeRef.current;
        const newId = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const copy: CanvasNode = {
          ...JSON.parse(JSON.stringify(src)),
          id: newId,
          position: { x: src.position.x + 48, y: src.position.y + 56 },
        };
        clipboardNodeRef.current = copy;
        setNodes((prev) => {
          const next = [...prev, copy];
          pushHistory(next, edges);
          return next;
        });
        setSelectedNodeId(newId);
        setSaveState('unsaved');
      } else if (e.key === 'Tab' && activeTab === 'editor') {
        e.preventDefault();
        setQuickPicker({ open: true });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, selectedNodeId, nodes, edges, setNodes, pushHistory, handleSave, handleUndo, handleRedo]);

  const openVersionsDrawer = async () => {
    setVersionsOpen(true);
    setVersionsLoading(true);
    try {
      const res = await api.workflows.versions(workflowId);
      setVersions(res.versions);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleExportJson = async () => {
    setMoreMenuOpen(false);
    try {
      const res = await api.workflows.exportJson(workflowId);
      const blob = new Blob([JSON.stringify(res.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(workflowName || 'crox-workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to export workflow JSON.');
    }
  };

  const handleDuplicateWorkflow = async () => {
    setMoreMenuOpen(false);
    try {
      const res = await api.workflows.duplicate(workflowId);
      onOpenWorkflow?.(res.workflow.id);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to duplicate workflow.');
    }
  };

  const handleMoveProject = async (targetProjectId: string) => {
    if (!targetProjectId) return;
    setMoveProjectId(targetProjectId);
    try {
      const res = await api.workflows.moveToProject(workflowId, targetProjectId);
      setWorkflow(res.workflow);
      setMoreMenuOpen(false);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to move workflow.');
    }
  };

  const handleDeleteWorkflow = async () => {
    try {
      await api.workflows.delete(workflowId);
      onBack();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete workflow.');
    }
  };

  const focusNodeOnCanvas = useCallback(
    (nodeId: string) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (!target) return;
      setSelectedNodeId(nodeId);
      if (target.type === 'croxNode') setInspectorOpen(true);
      const parentGroup = target.parentId ? nodes.find((g) => g.id === target.parentId) : null;
      const absX = (parentGroup?.position.x || 0) + target.position.x;
      const absY = (parentGroup?.position.y || 0) + target.position.y;
      void setCenter(absX + 120, absY + 40, { zoom: 1.05, duration: 300 });
    },
    [nodes, setCenter]
  );

  const editorActionsValue = useMemo(
    () => ({
      onTestNodeById: (id: string) => void handleTestNodeById(id),
      onRunFromNodeById: (id: string) => void handleRunFromNode(id),
      onToggleDisableNode: handleToggleDisableNode,
      onDeleteNode: handleDeleteNode,
      onOpenAddNextNode: (sourceNodeId: string, sourceHandle?: string) => {
        const src = nodes.find((n) => n.id === sourceNodeId);
        const srcType =
          src && src.type === 'croxNode' ? (src.data as WorkflowNodeData).nodeType : null;
        setQuickPicker({
          open: true,
          sourceNodeId,
          sourceHandle,
          sourceNodeType: srcType,
        });
      },
      onOpenAttachClusterNode: (agentNodeId: string, role: ClusterRole, targetHandle: EdgeKind) => {
        setQuickPicker({
          open: true,
          agentNodeId,
          clusterRoleFilter: role,
          targetHandle,
        });
      },
      onUpdateStickyNote: handleUpdateStickyNote,
      onUpdateGroupNode: handleUpdateGroupNode,
      onToggleCollapseGroup: handleToggleCollapseGroup,
      onUngroupNode: handleUngroupNode,
      validationIssuesByNode,
    }),
    [
      nodes,
      handleTestNodeById,
      handleRunFromNode,
      handleToggleDisableNode,
      handleDeleteNode,
      handleUpdateStickyNote,
      handleUpdateGroupNode,
      handleToggleCollapseGroup,
      handleUngroupNode,
      validationIssuesByNode,
    ]
  );

  const projectDisplayName =
    workflow?.projectName ||
    projects.find((p) => p.id === workflow?.projectId)?.name ||
    'Personal';

  const errorCount = validationIssues.filter((i) => i.severity === 'error').length;
  const warningCount = validationIssues.filter((i) => i.severity === 'warning').length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#0D0D0F]">
        <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
      </div>
    );
  }

  return (
    <EditorActionsProvider value={editorActionsValue}>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#FAFAFA] dark:bg-[#0D0D0F] text-zinc-900 dark:text-zinc-100">
        {/* Top Bar */}
        <header className="h-[58px] px-3 sm:px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] flex items-center justify-between gap-2 shrink-0 z-30">
          {/* Left: Back + Palette Toggle + Project Breadcrumb + Workflow Name */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (saveState === 'unsaved') {
                  setShowLeaveConfirm(true);
                } else {
                  onBack();
                }
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Overview</span>
            </button>

            <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

            <button
              type="button"
              onClick={() => setPaletteOpen((o) => !o)}
              className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                paletteOpen
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={paletteOpen ? 'Hide node library' : 'Show node library'}
              aria-label="Toggle node library"
            >
              <PanelLeft className="w-4 h-4" />
            </button>

            <span className="hidden lg:inline-flex items-center text-xs text-zinc-400 truncate max-w-[120px]">
              {projectDisplayName}
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">/</span>
            </span>

            {editingName ? (
              <input
                type="text"
                autoFocus
                value={workflowName}
                onChange={(e) => {
                  setWorkflowName(e.target.value);
                  setSaveState('unsaved');
                }}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    setEditingName(false);
                  }
                }}
                aria-label="Workflow Name"
                className="text-sm font-semibold text-zinc-900 dark:text-white bg-zinc-50 dark:bg-zinc-950 border border-[#E11D48] rounded-lg px-2.5 py-1 min-w-[140px] max-w-[230px] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-0 max-w-[220px]"
                title="Click to rename workflow"
              >
                <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  {workflowName || 'Untitled Workflow'}
                </span>
                <Pencil className="w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}

            <span
              className={`hidden xl:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
                saveState === 'saving'
                  ? 'bg-rose-50 text-[#E11D48] dark:bg-rose-950/40 dark:text-rose-300'
                  : saveState === 'unsaved'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {saveState === 'saving' ? 'Saving...' : saveState === 'unsaved' ? 'Unsaved' : 'Saved'}
            </span>
          </div>

          {/* Center Tabs */}
          <div className="hidden md:flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
            {(['editor', 'executions', 'evaluations'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1 rounded-lg text-xs font-medium capitalize transition-all duration-150 whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-white dark:bg-[#1C1C20] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden xl:flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndexRef.current <= 0}
                className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35 transition-colors"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndexRef.current >= historyRef.current.length - 1}
                className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35 border-l border-zinc-200 dark:border-zinc-800 transition-colors"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedEdgeId && (
              <button
                type="button"
                onClick={() => {
                  setEdges((prev) => {
                    const next = prev.filter((e) => e.id !== selectedEdgeId);
                    pushHistory(nodes, next);
                    return next;
                  });
                  setSelectedEdgeId(null);
                  setSaveState('unsaved');
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Delete selected connection"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setValidationOpen(true)}
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                errorCount > 0
                  ? 'border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                  : warningCount > 0
                    ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
              title="Workflow Validation Report"
            >
              {errorCount > 0 || warningCount > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="font-mono tabular-nums">{errorCount + warningCount}</span>
                </>
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void openVersionsDrawer()}
              className="hidden lg:inline-flex p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              title="Version History"
              aria-label="Version History"
            >
              <History className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="hidden lg:inline-flex p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              title="Workflow Settings"
              aria-label="Workflow Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {/* Publish / Draft Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(workflow?.isActive)}
              onClick={() => void handleToggleActive()}
              className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              <span
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  workflow?.isActive ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    workflow?.isActive ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span
                className={`text-xs font-medium ${
                  workflow?.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {workflow?.isActive ? 'Published' : 'Draft'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveState === 'saving'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
              title="Save (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExecute('test')}
              disabled={runState === 'running' || nodes.filter((n) => n.type === 'croxNode').length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium shadow-xs disabled:opacity-45 transition-all duration-150 whitespace-nowrap"
            >
              {runState === 'running' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>Test Workflow</span>
            </button>

            {/* More Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((o) => !o)}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                aria-label="More workflow actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {moreMenuOpen && (
                <div
                  className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-50 text-xs"
                  onMouseLeave={() => {
                    setMoreMenuOpen(false);
                    setConfirmDeleteWorkflow(false);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      void openVersionsDrawer();
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <History className="w-3.5 h-3.5 text-zinc-400" /> Version History
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setSettingsModalOpen(true);
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Settings className="w-3.5 h-3.5 text-zinc-400" /> Workflow Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicateWorkflow()}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <CopyPlus className="w-3.5 h-3.5 text-zinc-400" /> Duplicate Workflow
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportJson()}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" /> Export JSON
                  </button>

                  {projects.length > 0 && (
                    <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 mt-1 space-y-1">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                        <FolderInput className="w-3 h-3" /> Move to Project
                      </span>
                      <select
                        value={moveProjectId}
                        onChange={(e) => void handleMoveProject(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 text-xs"
                      >
                        {projects
                          .filter((p) => !p.isArchived)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1">
                    {!confirmDeleteWorkflow ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWorkflow(true)}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete Workflow
                      </button>
                    ) : (
                      <div className="px-3 py-2 space-y-1.5">
                        <p className="text-[11px] text-red-600 font-medium">Permanently delete this workflow?</p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDeleteWorkflow()}
                            className="flex-1 py-1 rounded bg-red-600 text-white text-[11px] font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteWorkflow(false)}
                            className="flex-1 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-[11px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {errorBanner && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 flex items-center justify-between gap-3 text-xs text-red-700 dark:text-red-300 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button type="button" onClick={() => setErrorBanner(null)} className="font-medium underline shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Body */}
        {activeTab === 'editor' ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 flex min-h-0 overflow-hidden relative">
              {/* Left Collapsible Node Library */}
              <NodePickerPanel
                open={paletteOpen}
                mode="sidebar"
                onSelectNode={(nodeType) =>
                  addNodeAtPosition(nodeType, {
                    x: 140 + nodes.length * 46,
                    y: 140 + (nodes.length % 4) * 58,
                  })
                }
                onAddStickyNote={() => handleAddStickyNote()}
                onClose={() => setPaletteOpen(false)}
              />

              {/* Center React Flow Canvas */}
              <div className="flex-1 relative min-w-0 min-h-0 bg-white dark:bg-[#0D0D0F]">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  panOnDrag={interactionMode === 'pan' ? true : [1, 2]}
                  selectionOnDrag={interactionMode === 'select'}
                  onNodesChange={(changes) => {
                    onNodesChange(changes);
                    if (changes.some((c) => c.type === 'position' || c.type === 'remove' || c.type === 'dimensions')) {
                      setSaveState('unsaved');
                    }
                  }}
                  onEdgesChange={(changes) => {
                    onEdgesChange(changes);
                    if (changes.some((c) => c.type === 'remove')) {
                      setSaveState('unsaved');
                    }
                  }}
                  onConnect={handleConnect}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onNodeClick={(_e, node) => {
                    setContextMenu(null);
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                    setInspectorOpen(node.type === 'croxNode');
                  }}
                  onEdgeClick={(_e, edge) => {
                    setContextMenu(null);
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                    setInspectorOpen(false);
                  }}
                  onPaneClick={() => {
                    setContextMenu(null);
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                    setInspectorOpen(false);
                  }}
                  onPaneContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      flowPos: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                    });
                  }}
                  onNodeContextMenu={(e, node) => {
                    e.preventDefault();
                    setSelectedNodeId(node.id);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      flowPos: node.position,
                      nodeId: node.id,
                    });
                  }}
                  deleteKeyCode={['Backspace', 'Delete']}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1.15}
                    color={theme === 'dark' ? '#27272A' : '#E4E4E7'}
                  />
                  <Controls position="bottom-right" showInteractive={false} className="!mb-20 !mr-3" />
                  {minimapVisible && (
                    <MiniMap
                      pannable
                      zoomable
                      nodeColor={(n) =>
                        n.type === 'stickyNote' ? '#F59E0B' : n.type === 'group' ? '#71717A' : '#E11D48'
                      }
                      className="hidden xl:block !bottom-20 !right-14"
                    />
                  )}
                </ReactFlow>

                {/* Floating Top-Right Canvas Action Rail */}
                <div className="absolute top-3.5 right-3.5 z-20 flex flex-col gap-1 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#141416]/95 shadow-sm backdrop-blur-xs">
                  <button
                    type="button"
                    onClick={() => setQuickPicker({ open: true })}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-[#E11D48] transition-colors"
                    title="Add Node (Tab)"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPicker({ open: true })}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Search Nodes"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddStickyNote()}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600 transition-colors"
                    title="Add Sticky Note"
                  >
                    <StickyNote className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGroupSelectedNodes()}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Group Selected Nodes / Add Group Frame"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoArrange}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Auto-Arrange Layout"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>

                  <div className="my-0.5 h-px bg-zinc-200 dark:bg-zinc-800" />

                  <button
                    type="button"
                    onClick={() => setInteractionMode((m) => (m === 'select' ? 'pan' : 'select'))}
                    className={`p-2 rounded-lg transition-colors ${
                      interactionMode === 'pan'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400'
                        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                    title={interactionMode === 'select' ? 'Selection Mode (click to switch to Pan)' : 'Pan Mode (click to switch to Select)'}
                  >
                    {interactionMode === 'pan' ? <Hand className="w-4 h-4" /> : <MousePointer className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void zoomTo(1, { duration: 200 })}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Reset Zoom (100%)"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMinimapVisible((v) => !v)}
                    className={`hidden xl:inline-flex p-2 rounded-lg transition-colors ${
                      minimapVisible
                        ? 'text-[#E11D48] bg-rose-50/80 dark:bg-rose-950/30 dark:text-rose-400'
                        : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                    title={minimapVisible ? 'Hide Minimap' : 'Show Minimap'}
                  >
                    <MapIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setValidationOpen(true)}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Validate Workflow"
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void fitView({ padding: 0.25, duration: 250 })}
                    className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="Fit View"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Right-click Canvas / Node Context Menu */}
                {contextMenu && (
                  <div
                    style={{
                      left: Math.min(
                        contextMenu.x,
                        typeof window !== 'undefined' ? window.innerWidth - 220 : contextMenu.x
                      ),
                      top: Math.min(
                        contextMenu.y,
                        typeof window !== 'undefined' ? window.innerHeight - 260 : contextMenu.y
                      ),
                    }}
                    className="fixed z-50 w-52 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] shadow-xl py-1.5 text-xs"
                    onMouseLeave={() => setContextMenu(null)}
                  >
                    {contextMenu.nodeId ? (
                      (() => {
                        const targetNode = nodes.find((n) => n.id === contextMenu.nodeId);
                        if (!targetNode) return null;
                        if (targetNode.type === 'group') {
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  handleToggleCollapseGroup(targetNode.id);
                                  setContextMenu(null);
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                {(targetNode.data as GroupNodeData).collapsed ? 'Expand Group' : 'Collapse Group'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleUngroupNode(targetNode.id);
                                  setContextMenu(null);
                                }}
                                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              >
                                <Ungroup className="w-3.5 h-3.5 text-zinc-400" /> Ungroup Nodes
                              </button>
                            </>
                          );
                        }
                        return (
                          <>
                            {targetNode.type === 'croxNode' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedNodeId(targetNode.id);
                                    setInspectorOpen(true);
                                    setContextMenu(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                  Inspect Parameters
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleTestNodeById(targetNode.id);
                                    setContextMenu(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                  Test This Step
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleRunFromNode(targetNode.id);
                                    setContextMenu(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                  Run Workflow From Here
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleToggleDisableNode(targetNode.id);
                                    setContextMenu(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                  {targetNode.data.disabled ? 'Enable Node' : 'Disable Node'}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                handleDuplicateNode(targetNode.id);
                                setContextMenu(null);
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleDeleteNode(targetNode.id);
                                setContextMenu(null);
                              }}
                              className="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              Delete
                            </button>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            setQuickPicker({ open: true });
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Add Node...
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleAddStickyNote(contextMenu.flowPos);
                            setContextMenu(null);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Add Sticky Note Here
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleGroupSelectedNodes(contextMenu.flowPos);
                            setContextMenu(null);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Create Group Frame
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleAutoArrange();
                            setContextMenu(null);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Auto-Arrange Layout
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setContextMenu(null);
                            void fitView({ padding: 0.25, duration: 250 });
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Fit View
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Empty Canvas Prompt */}
                {nodes.length === 0 && !emptyHelperDismissed && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 pb-24">
                    <div className="pointer-events-auto relative flex flex-col items-center text-center max-w-md rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-[#141416]/95 backdrop-blur-xs p-7 shadow-sm space-y-4">
                      <button
                        type="button"
                        onClick={() => setEmptyHelperDismissed(true)}
                        aria-label="Dismiss helper"
                        className="absolute top-3 right-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div>
                        <p className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                          Start building your workflow
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          Add a trigger step, describe your automation to NOVA below, or place a planning note.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setQuickPicker({ open: true })}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add first step...</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const input = promptBarContainerRef.current?.querySelector('input');
                            input?.focus();
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#E11D48]" />
                          <span>Build with AI</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddStickyNote()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-amber-300 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50/70 dark:hover:bg-amber-950/20 transition-colors"
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                          <span>Sticky Note</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Floating NOVA Prompt Bar */}
                <div ref={promptBarContainerRef} className="pointer-events-none absolute bottom-4 inset-x-0 z-20 px-4">
                  <FloatingPromptBar
                    mode="editor"
                    onApplyToCanvas={handleApplyPromptBar}
                    placeholder="Describe a workflow or AI Agent pipeline to generate on this canvas..."
                  />
                </div>
              </div>

              {/* Right Node Configuration Inspector */}
              {inspectorOpen && selectedNode && (
                <aside className="w-[340px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 overflow-hidden z-20 shadow-sm">
                  <NodeConfigPanel
                    node={selectedNode}
                    allNodes={allSerializedNodes}
                    allEdges={allSerializedEdges}
                    allWorkflows={allWorkflows}
                    workflowId={workflow?.id || workflowId}
                    webhookSecret={workflow?.webhookSecret || ''}
                    workflowIsActive={Boolean(workflow?.isActive)}
                    credentials={credentials}
                    latestNodeResult={latestNodeResult}
                    latestExecution={latestExecution}
                    onCredentialCreated={(cred) => setCredentials((prev) => [cred, ...prev])}
                    onChangeNode={handleChangeNode}
                    onDuplicateNode={handleDuplicateNode}
                    onDeleteNode={handleDeleteNode}
                    onRunFromHere={(id) => void handleRunFromNode(id)}
                    onClose={() => {
                      setInspectorOpen(false);
                      setSelectedNodeId(null);
                    }}
                  />
                </aside>
              )}
            </div>

            {/* Bottom Execution Log Drawer */}
            {latestExecution && logsExpanded ? (
              <ExecutionPanel
                execution={latestExecution}
                recentExecutions={workflowExecutions}
                onSelectExecution={async (execId) => {
                  try {
                    const res = await api.executions.get(execId);
                    applyExecutionVisuals(res.execution);
                  } catch {
                    const found = workflowExecutions.find((e) => e.id === execId);
                    if (found) applyExecutionVisuals(found);
                  }
                }}
                onFocusNode={focusNodeOnCanvas}
                onCancelExecution={(execId) => void handleCancelExecution(execId)}
                onClose={() => setLogsExpanded(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setLogsExpanded((v) => !v)}
                className="h-9 px-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 shrink-0 transition-colors"
              >
                <span className="font-medium">
                  Execution Logs
                  {latestExecution && (
                    <>
                      {' · '}
                      <span
                        className={
                          latestExecution.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-[#E11D48]'
                        }
                      >
                        Last run {latestExecution.status} ({latestExecution.durationMs}ms)
                      </span>
                    </>
                  )}
                </span>
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : activeTab === 'executions' ? (
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                  Workflow Executions
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Recent runs triggered manually, via webhook, schedule, chat, or sub-workflow. Click any run to inspect its canvas trace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleExecute('manual')}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium transition-colors whitespace-nowrap"
              >
                Run Live Now
              </button>
            </div>

            {workflowExecutions.length === 0 ? (
              <div className="p-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] text-center text-sm text-zinc-500">
                No executions recorded for this workflow yet.
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] divide-y divide-zinc-200 dark:divide-zinc-800 shadow-xs">
                {workflowExecutions.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={async () => {
                      const res = await api.executions.get(ex.id).catch(() => ({ execution: ex }));
                      applyExecutionVisuals(res.execution);
                      setActiveTab('editor');
                    }}
                    className="w-full text-left p-4 flex items-center justify-between gap-4 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-medium">
                        {ex.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-[#E11D48]" />
                        )}
                        <span className="capitalize text-zinc-900 dark:text-white">{ex.status}</span>
                        <span className="text-zinc-500">· {ex.triggerType}</span>
                      </div>
                      <p className="font-mono text-[11px] text-zinc-400">{ex.id}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums text-zinc-500">
                      <p>{ex.durationMs}ms</p>
                      <p className="text-[11px]">{new Date(ex.startedAt).toLocaleString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                  Workflow Evaluations
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Verify DAG integrity, AI Agent cluster ports, trigger coverage, and end-to-end execution health.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunEvaluation(true)}
                disabled={evaluating}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {evaluating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Run Full Evaluation</span>
              </button>
            </div>

            {evaluations.length === 0 ? (
              <div className="p-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] text-center text-sm text-zinc-500">
                No evaluations run yet. Click &ldquo;Run Full Evaluation&rdquo; to audit and test this workflow.
              </div>
            ) : (
              <div className="space-y-4">
                {evaluations.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] p-4 space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-semibold capitalize ${
                          ev.status === 'passed'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ev.status === 'warnings'
                              ? 'text-amber-500'
                              : 'text-[#E11D48]'
                        }`}
                      >
                        Evaluation {ev.status}
                      </span>
                      <span className="font-mono tabular-nums text-zinc-500">
                        {ev.durationMs}ms · {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {ev.checks.map((chk, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-start gap-2.5 text-xs"
                        >
                          {chk.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle
                              className={`w-4 h-4 shrink-0 mt-0.5 ${
                                chk.severity === 'warning' ? 'text-amber-500' : 'text-[#E11D48]'
                              }`}
                            />
                          )}
                          <div>
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">{chk.name}</p>
                            <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">{chk.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Node Picker Modal (triggered by Tab, + Port, + Next, Empty Canvas) */}
        <NodePickerPanel
          open={quickPicker.open}
          mode="modal"
          sourceNodeType={quickPicker.sourceNodeType}
          clusterRoleFilter={quickPicker.clusterRoleFilter}
          onSelectNode={handleQuickPickSelect}
          onAddStickyNote={
            quickPicker.clusterRoleFilter
              ? undefined
              : () => {
                  setQuickPicker({ open: false });
                  handleAddStickyNote();
                }
          }
          onClose={() => setQuickPicker({ open: false })}
        />

        {/* Workflow Settings Modal */}
        <WorkflowSettingsModal
          open={settingsModalOpen}
          settings={workflow?.settings || DEFAULT_SETTINGS}
          workflows={allWorkflows}
          currentWorkflowId={workflow?.id || workflowId}
          onSave={(nextSettings) => {
            if (!workflow) return;
            setWorkflow({ ...workflow, settings: nextSettings });
            setSaveState('unsaved');
          }}
          onClose={() => setSettingsModalOpen(false)}
        />

        {/* Version History Drawer */}
        <VersionHistoryDrawer
          open={versionsOpen}
          versions={versions}
          loading={versionsLoading}
          onCreateSnapshot={async (note) => {
            if (saveState === 'unsaved') {
              await handleSave({ saveVersion: true, versionNote: note });
            } else {
              await api.workflows.createVersion(workflowId, note);
            }
            const res = await api.workflows.versions(workflowId);
            setVersions(res.versions);
          }}
          onRestoreVersion={async (versionId) => {
            const res = await api.workflows.restoreVersion(workflowId, versionId);
            const restored = res.workflow;
            setWorkflow(restored);
            setWorkflowName(restored.name);
            const rfNodes = mapWorkflowNodesToReactFlow(restored.nodes);
            const rfEdges = mapEdgesToReactFlow(restored.edges);
            setNodes(rfNodes);
            setEdges(rfEdges);
            pushHistory(rfNodes, rfEdges);
            setSaveState('saved');
            setVersionsOpen(false);
            setTimeout(() => fitView({ padding: 0.25 }), 60);
          }}
          onClose={() => setVersionsOpen(false)}
        />

        {/* Validation Report Modal */}
        <PublishValidationModal
          open={validationOpen}
          issues={validationIssues}
          onFocusNode={focusNodeOnCanvas}
          onClose={() => setValidationOpen(false)}
        />

        {/* Unsaved Changes Confirmation Modal */}
        {showLeaveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl">
              <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                Unsaved Changes
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                You have unsaved edits in &ldquo;{workflowName}&rdquo;. Would you like to save before returning to your overview?
              </p>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    onBack();
                  }}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Discard Edits
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const saved = await handleSave();
                    if (saved) {
                      setShowLeaveConfirm(false);
                      onBack();
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium transition-colors"
                >
                  Save &amp; Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </EditorActionsProvider>
  );
};

export const WorkflowEditorPage: React.FC<EditorInnerProps> = (props) => (
  <ReactFlowProvider>
    <WorkflowEditorInner {...props} />
  </ReactFlowProvider>
);
