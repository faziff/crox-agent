import { CronExpressionParser } from 'cron-parser';
import {
  AgentOrchestratorConfig,
  AiAgentConfig,
  AiNodeConfig,
  AutofixOutputParserConfig,
  CodeNodeConfig,
  ConditionConfig,
  CroxFlowNode,
  CroxNodeType,
  ExecuteWorkflowConfig,
  HttpRequestConfig,
  IntegrationActionConfig,
  ScheduleTriggerConfig,
  SendEmailConfig,
  StopAndErrorConfig,
  StructuredOutputParserConfig,
  ToolHttpRequestConfig,
  ToolWorkflowConfig,
  ValidationIssue,
  WaitNodeConfig,
  WebhookNotifyConfig,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
} from '../../src/types/workflow.ts';
import { INTEGRATION_CATALOG } from './integrationService.ts';

export const TRIGGER_NODE_TYPES = new Set<CroxNodeType>([
  'manual_trigger',
  'webhook_trigger',
  'schedule_trigger',
  'chat_trigger',
  'form_trigger',
  'error_trigger',
]);

export const CHAT_MODEL_NODE_TYPES = new Set<CroxNodeType>([
  'gemini_chat_model',
  'openai_chat_model',
  'anthropic_chat_model',
]);
export const MEMORY_NODE_TYPES = new Set<CroxNodeType>([
  'simple_memory',
  'windowed_memory',
  'conversation_memory',
]);
export const OUTPUT_PARSER_NODE_TYPES = new Set<CroxNodeType>([
  'structured_output_parser',
  'autofix_output_parser',
]);
export const TOOL_NODE_TYPES = new Set<CroxNodeType>([
  'tool_calculator',
  'tool_http_request',
  'tool_datetime',
  'tool_workflow',
  'tool_custom',
]);

export const CLUSTER_SUBNODE_TYPES = new Set<CroxNodeType>([
  ...CHAT_MODEL_NODE_TYPES,
  ...MEMORY_NODE_TYPES,
  ...OUTPUT_PARSER_NODE_TYPES,
  ...TOOL_NODE_TYPES,
]);

const VALID_NODE_TYPES = new Set<CroxNodeType>([
  'manual_trigger',
  'webhook_trigger',
  'schedule_trigger',
  'chat_trigger',
  'form_trigger',
  'error_trigger',
  'ai_agent',
  'agent_orchestrator',
  'ai_node',
  'gemini_chat_model',
  'openai_chat_model',
  'anthropic_chat_model',
  'simple_memory',
  'windowed_memory',
  'conversation_memory',
  'structured_output_parser',
  'autofix_output_parser',
  'tool_calculator',
  'tool_http_request',
  'tool_datetime',
  'tool_workflow',
  'tool_custom',
  'http_request',
  'edit_fields',
  'set_data',
  'transform_data',
  'code_node',
  'filter_items',
  'sort_items',
  'limit_items',
  'aggregate_items',
  'split_out',
  'remove_duplicates',
  'json_operations',
  'datetime_operations',
  'condition',
  'switch_node',
  'merge_node',
  'loop_items',
  'wait_node',
  'stop_and_error',
  'execute_workflow',
  'noop',
  'send_email',
  'webhook_notify',
  'integration_action',
]);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
  executionOrder: string[];
  entryNodes: string[];
}

export function isClusterEdge(edge: WorkflowEdge, nodeMap: Map<string, CroxFlowNode>): boolean {
  if (edge.edgeKind && edge.edgeKind !== 'main') return true;
  if (
    edge.targetHandle === 'ai_languageModel' ||
    edge.targetHandle === 'ai_memory' ||
    edge.targetHandle === 'ai_tool' ||
    edge.targetHandle === 'ai_outputParser'
  ) {
    return true;
  }
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  const isAgentTarget = (n?: CroxFlowNode) =>
    n?.data.nodeType === 'ai_agent' || n?.data.nodeType === 'agent_orchestrator';
  if (src && CLUSTER_SUBNODE_TYPES.has(src.data.nodeType) && isAgentTarget(tgt)) {
    return true;
  }
  if (tgt && CLUSTER_SUBNODE_TYPES.has(tgt.data.nodeType) && isAgentTarget(src)) {
    return true;
  }
  return false;
}

export function validateWorkflowGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options: { strictConfig?: boolean } = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const pushIssue = (
    severity: 'error' | 'warning',
    code: string,
    message: string,
    nodeId?: string
  ) => {
    issues.push({
      id: `${code}_${nodeId || 'graph'}_${issues.length}`,
      severity,
      code,
      message,
      nodeId,
    });
  };

  const functionalNodes = (nodes || []).filter(
    (n): n is CroxFlowNode => n.type !== 'stickyNote' && n.type !== 'group'
  );

  if (!Array.isArray(nodes) || functionalNodes.length === 0) {
    pushIssue('error', 'EMPTY_WORKFLOW', 'Workflow must contain at least one functional node.');
    return {
      valid: false,
      errors: issues.filter((i) => i.severity === 'error').map((i) => i.message),
      warnings: [],
      issues,
      executionOrder: [],
      entryNodes: [],
    };
  }

  const nodeMap = new Map<string, CroxFlowNode>();
  const allIdSet = new Set<string>();
  for (const raw of nodes) {
    if (raw.id) allIdSet.add(raw.id);
  }

  for (const node of functionalNodes) {
    if (!node.id || typeof node.id !== 'string') {
      pushIssue('error', 'INVALID_NODE_ID', 'Every node must have a valid string ID.');
      continue;
    }
    if (nodeMap.has(node.id)) {
      pushIssue('error', 'DUPLICATE_NODE_ID', `Duplicate node ID detected: ${node.id}`, node.id);
      continue;
    }
    const data = node.data as WorkflowNodeData | undefined;
    const nodeType = data?.nodeType;
    if (!nodeType || !VALID_NODE_TYPES.has(nodeType)) {
      pushIssue(
        'error',
        'UNSUPPORTED_NODE_TYPE',
        `Unsupported node type on node "${data?.label || node.id}".`,
        node.id
      );
      continue;
    }
    nodeMap.set(node.id, node);
  }

  // Separate main workflow DAG edges from AI Agent cluster attachment edges
  const mainEdges: WorkflowEdge[] = [];
  const clusterEdges: WorkflowEdge[] = [];

  for (const edge of edges || []) {
    if (!edge.source || !edge.target) {
      pushIssue('error', 'INVALID_EDGE', 'Every edge must define source and target node IDs.');
      continue;
    }
    if (edge.source === edge.target) {
      pushIssue(
        'error',
        'SELF_CONNECTION',
        `Self-connections are not allowed on node "${nodeMap.get(edge.source)?.data?.label || edge.source}".`,
        edge.source
      );
      continue;
    }
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      pushIssue('error', 'MISSING_EDGE_ENDPOINT', `Edge "${edge.id}" references a missing source or target node.`);
      continue;
    }
    if (isClusterEdge(edge, nodeMap)) {
      clusterEdges.push(edge);
    } else {
      mainEdges.push(edge);
    }
  }

  // Validate AI Agent cluster attachments
  const agentCounts = new Map<
    string,
    { languageModel: number; memory: number; outputParser: number; tools: number }
  >();

  for (const edge of clusterEdges) {
    const srcNode = nodeMap.get(edge.source)!;
    const tgtNode = nodeMap.get(edge.target)!;

    // Determine which side is sub-node and which side is agent
    const subNode = CLUSTER_SUBNODE_TYPES.has(srcNode.data.nodeType) ? srcNode : tgtNode;
    const agentNode = subNode.id === srcNode.id ? tgtNode : srcNode;

    if (agentNode.data.nodeType !== 'ai_agent' && agentNode.data.nodeType !== 'agent_orchestrator') {
      pushIssue(
        'error',
        'INVALID_CLUSTER_TARGET',
        `Sub-node "${subNode.data.label}" must attach to an AI Agent or Agent Orchestrator node.`,
        subNode.id
      );
      continue;
    }

    const counts = agentCounts.get(agentNode.id) || {
      languageModel: 0,
      memory: 0,
      outputParser: 0,
      tools: 0,
    };

    const handle = edge.targetHandle || edge.edgeKind || '';
    const subType = subNode.data.nodeType;

    if (CHAT_MODEL_NODE_TYPES.has(subType)) {
      if (handle && handle !== 'ai_languageModel') {
        pushIssue(
          'error',
          'INCOMPATIBLE_HANDLE',
          `Chat Model "${subNode.data.label}" must connect to the Agent's Chat Model port.`,
          subNode.id
        );
      }
      counts.languageModel += 1;
    } else if (MEMORY_NODE_TYPES.has(subType)) {
      if (handle && handle !== 'ai_memory') {
        pushIssue(
          'error',
          'INCOMPATIBLE_HANDLE',
          `Memory "${subNode.data.label}" must connect to the Agent's Memory port.`,
          subNode.id
        );
      }
      counts.memory += 1;
    } else if (OUTPUT_PARSER_NODE_TYPES.has(subType)) {
      if (handle && handle !== 'ai_outputParser') {
        pushIssue(
          'error',
          'INCOMPATIBLE_HANDLE',
          `Output Parser "${subNode.data.label}" must connect to the Agent's Output Parser port.`,
          subNode.id
        );
      }
      counts.outputParser += 1;
    } else if (TOOL_NODE_TYPES.has(subType)) {
      if (handle && handle !== 'ai_tool') {
        pushIssue(
          'error',
          'INCOMPATIBLE_HANDLE',
          `Tool "${subNode.data.label}" must connect to the Agent's Tools port.`,
          subNode.id
        );
      }
      counts.tools += 1;
    } else {
      pushIssue(
        'error',
        'INVALID_CLUSTER_SUBNODE',
        `Node "${subNode.data.label}" cannot be attached as an AI Agent sub-node.`,
        subNode.id
      );
    }

    agentCounts.set(agentNode.id, counts);
  }

  for (const [agentId, counts] of agentCounts.entries()) {
    const agentLabel = nodeMap.get(agentId)?.data.label || agentId;
    if (counts.languageModel > 1) {
      pushIssue(
        'error',
        'MULTIPLE_CHAT_MODELS',
        `AI Agent "${agentLabel}" supports at most one Chat Model attachment.`,
        agentId
      );
    }
    if (counts.memory > 1) {
      pushIssue(
        'error',
        'MULTIPLE_MEMORY_NODES',
        `AI Agent "${agentLabel}" supports at most one Memory attachment.`,
        agentId
      );
    }
    if (counts.outputParser > 1) {
      pushIssue(
        'error',
        'MULTIPLE_OUTPUT_PARSERS',
        `AI Agent "${agentLabel}" supports at most one Output Parser attachment.`,
        agentId
      );
    }
  }

  // Linear DAG topological sort ONLY across non-subnode workflow nodes & mainEdges
  const mainNodeIds = Array.from(nodeMap.values())
    .filter((n) => !CLUSTER_SUBNODE_TYPES.has(n.data.nodeType))
    .map((n) => n.id);
  const mainNodeSet = new Set(mainNodeIds);

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of mainNodeIds) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of mainEdges) {
    const sourceNode = nodeMap.get(edge.source)!;
    const targetNode = nodeMap.get(edge.target)!;

    if (CLUSTER_SUBNODE_TYPES.has(sourceNode.data.nodeType) || CLUSTER_SUBNODE_TYPES.has(targetNode.data.nodeType)) {
      pushIssue(
        'error',
        'SUBNODE_IN_MAIN_FLOW',
        `AI sub-node "${CLUSTER_SUBNODE_TYPES.has(sourceNode.data.nodeType) ? sourceNode.data.label : targetNode.data.label}" can only connect to an AI Agent port.`,
        CLUSTER_SUBNODE_TYPES.has(sourceNode.data.nodeType) ? sourceNode.id : targetNode.id
      );
      continue;
    }

    if (sourceNode.data.nodeType === 'condition') {
      if (edge.sourceHandle !== 'true' && edge.sourceHandle !== 'false') {
        pushIssue(
          'warning',
          'IMPLICIT_CONDITION_BRANCH',
          `Condition node "${sourceNode.data.label}" has an edge without an explicit true/false branch handle; defaulting to true branch.`,
          sourceNode.id
        );
      }
    }

    if (mainNodeSet.has(edge.source) && mainNodeSet.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const executionOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    executionOrder.push(current);
    for (const neighbor of adjacency.get(current) || []) {
      const nextDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (executionOrder.length !== mainNodeIds.length) {
    pushIssue(
      'error',
      'CYCLE_DETECTED',
      'Workflow contains a cycle (circular loop). Cycles are not supported in CROX execution graphs.'
    );
  }

  const mainNodes = functionalNodes.filter((n) => !CLUSTER_SUBNODE_TYPES.has(n.data.nodeType));
  const triggerNodes = mainNodes.filter((n) => TRIGGER_NODE_TYPES.has(n.data.nodeType));
  const rootNodes = mainNodes.filter((n) => mainEdges.every((e) => e.target !== n.id));
  const entryNodes = (triggerNodes.length > 0 ? triggerNodes : rootNodes).map((n) => n.id);

  if (triggerNodes.length === 0) {
    pushIssue(
      'warning',
      'MISSING_TRIGGER',
      'No Trigger node found. Manual execution will start from root action nodes.'
    );
  }

  // Reachability check from entryNodes
  if (mainNodes.length > 1 && entryNodes.length > 0) {
    const reachable = new Set<string>(entryNodes);
    const bfs = [...entryNodes];
    while (bfs.length > 0) {
      const cur = bfs.shift()!;
      for (const next of adjacency.get(cur) || []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          bfs.push(next);
        }
      }
    }
    for (const n of mainNodes) {
      if (!reachable.has(n.id) && n.data.nodeType !== 'error_trigger') {
        pushIssue(
          'warning',
          'UNREACHABLE_NODE',
          `Node "${n.data.label}" is disconnected from trigger flow and will be skipped.`,
          n.id
        );
      }
    }
  }

  // Strict per-node configuration validation
  if (options.strictConfig) {
    for (const node of functionalNodes) {
      if (node.data.disabled) continue;
      const cfg = node.data?.config;
      const label = node.data?.label || node.id;
      switch (node.data?.nodeType) {
        case 'ai_agent': {
          const c = cfg as AiAgentConfig;
          const counts = agentCounts.get(node.id);
          if (!counts || counts.languageModel === 0) {
            pushIssue(
              'error',
              'AGENT_MISSING_MODEL',
              `AI Agent "${label}" requires a connected Chat Model sub-node (Gemini, Anthropic, or OpenAI-compatible).`,
              node.id
            );
          }
          if (!c?.prompt?.trim()) {
            pushIssue('error', 'AGENT_MISSING_PROMPT', `AI Agent "${label}" requires a prompt.`, node.id);
          }
          break;
        }
        case 'agent_orchestrator': {
          const c = cfg as AgentOrchestratorConfig;
          const counts = agentCounts.get(node.id);
          const hasSubWorkflows = Array.isArray(c?.agentWorkflowIds) && c.agentWorkflowIds.length > 0;
          if ((!counts || counts.languageModel === 0) && !hasSubWorkflows) {
            pushIssue(
              'error',
              'ORCHESTRATOR_UNCONFIGURED',
              `Agent Orchestrator "${label}" requires at least one sub-agent workflow or an attached Chat Model.`,
              node.id
            );
          }
          if (!c?.goal?.trim()) {
            pushIssue('error', 'AGENT_MISSING_PROMPT', `Agent Orchestrator "${label}" requires an orchestration goal.`, node.id);
          }
          break;
        }
        case 'structured_output_parser':
        case 'autofix_output_parser': {
          const c = cfg as StructuredOutputParserConfig | AutofixOutputParserConfig;
          try {
            JSON.parse(c?.schemaJson || '{}');
          } catch {
            pushIssue(
              'error',
              'INVALID_JSON_SCHEMA',
              `Output Parser "${label}" must contain a valid JSON Schema object.`,
              node.id
            );
          }
          break;
        }
        case 'tool_http_request': {
          const c = cfg as ToolHttpRequestConfig;
          if (!c?.url?.trim()) {
            pushIssue('error', 'TOOL_MISSING_URL', `HTTP Tool "${label}" requires a URL.`, node.id);
          }
          break;
        }
        case 'tool_workflow': {
          const c = cfg as ToolWorkflowConfig;
          if (!c?.targetWorkflowId?.trim()) {
            pushIssue(
              'error',
              'TOOL_MISSING_WORKFLOW',
              `Workflow Tool "${label}" requires a Target Workflow ID.`,
              node.id
            );
          }
          break;
        }
        case 'http_request': {
          const c = cfg as HttpRequestConfig;
          if (!c?.url?.trim()) {
            pushIssue('error', 'HTTP_MISSING_URL', `HTTP Request "${label}" requires a Request URL.`, node.id);
          }
          break;
        }
        case 'send_email': {
          const c = cfg as SendEmailConfig;
          if (!c?.to?.trim()) {
            pushIssue('error', 'EMAIL_MISSING_TO', `Send Email "${label}" requires a recipient email address.`, node.id);
          }
          if (!c?.subject?.trim()) {
            pushIssue('error', 'EMAIL_MISSING_SUBJECT', `Send Email "${label}" requires an email subject.`, node.id);
          }
          break;
        }
        case 'condition': {
          const c = cfg as ConditionConfig;
          if (!c?.inputVariable?.trim()) {
            pushIssue(
              'error',
              'CONDITION_MISSING_VAR',
              `Condition "${label}" requires an input variable path.`,
              node.id
            );
          }
          break;
        }
        case 'schedule_trigger': {
          const c = cfg as ScheduleTriggerConfig;
          try {
            CronExpressionParser.parse(c?.cronExpression || '0 9 * * *', { tz: c?.timezone || 'UTC' });
          } catch {
            pushIssue(
              'error',
              'INVALID_CRON',
              `Schedule Trigger "${label}" has an invalid cron expression.`,
              node.id
            );
          }
          break;
        }
        case 'ai_node': {
          const c = cfg as AiNodeConfig;
          if (!c?.prompt?.trim()) {
            pushIssue('error', 'AI_MISSING_PROMPT', `AI Node "${label}" requires a prompt.`, node.id);
          }
          break;
        }
        case 'code_node': {
          const c = cfg as CodeNodeConfig;
          if (!c?.code?.trim()) {
            pushIssue('error', 'CODE_EMPTY', `Code Node "${label}" requires JavaScript code.`, node.id);
          }
          break;
        }
        case 'webhook_notify': {
          const c = cfg as WebhookNotifyConfig;
          if (!c?.webhookUrl?.trim()) {
            pushIssue(
              'warning',
              'WEBHOOK_NOTIFY_SIMULATED',
              `Webhook Notification "${label}" has no Webhook URL; runs will be simulated until configured.`,
              node.id
            );
          }
          if (!c?.message?.trim()) {
            pushIssue('error', 'WEBHOOK_NOTIFY_EMPTY_MSG', `Webhook Notification "${label}" requires a message.`, node.id);
          }
          break;
        }
        case 'wait_node': {
          const c = cfg as WaitNodeConfig;
          if (Number(c?.durationMs) < 0 || Number(c?.durationMs) > 10000) {
            pushIssue(
              'error',
              'WAIT_OUT_OF_RANGE',
              `Wait / Delay "${label}" duration must be between 0 and 10000 ms.`,
              node.id
            );
          }
          break;
        }
        case 'stop_and_error': {
          const c = cfg as StopAndErrorConfig;
          if (!c?.errorMessage?.trim()) {
            pushIssue(
              'warning',
              'STOP_ERROR_DEFAULT',
              `Stop & Error "${label}" will emit a generic failure message if none is provided.`,
              node.id
            );
          }
          break;
        }
        case 'execute_workflow': {
          const c = cfg as ExecuteWorkflowConfig;
          if (!c?.targetWorkflowId?.trim()) {
            pushIssue(
              'error',
              'SUBWORKFLOW_MISSING_ID',
              `Execute Workflow "${label}" requires a target workflow ID.`,
              node.id
            );
          }
          break;
        }
        case 'integration_action': {
          const c = cfg as IntegrationActionConfig;
          if (!c?.appId?.trim() || !c?.actionId?.trim()) {
            pushIssue(
              'error',
              'INTEGRATION_UNCONFIGURED',
              `Integration Action "${label}" requires an App and Action selection.`,
              node.id
            );
            break;
          }
          const appDef = INTEGRATION_CATALOG.find((d) => d.appId === c.appId);
          if (!appDef) {
            pushIssue(
              'error',
              'INTEGRATION_UNKNOWN',
              `Integration "${c.appId}" on node "${label}" is not recognized.`,
              node.id
            );
          } else if (appDef.availability === 'coming_soon') {
            pushIssue(
              'error',
              'INTEGRATION_COMING_SOON',
              `${appDef.name} on node "${label}" is marked Coming Soon and cannot be executed directly yet.`,
              node.id
            );
          } else if (appDef.availability === 'requires_credentials' && !c.credentialId?.trim()) {
            pushIssue(
              'error',
              'INTEGRATION_MISSING_CREDENTIAL',
              `Integration Action "${label}" (${appDef.name}) requires selecting an encrypted credential.`,
              node.id
            );
          }
          break;
        }
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').map((i) => i.message);
  const warnings = issues.filter((i) => i.severity === 'warning').map((i) => i.message);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
    executionOrder,
    entryNodes,
  };
}
