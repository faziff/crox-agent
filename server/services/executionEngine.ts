import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import nodemailer from 'nodemailer';
import {
  AggregateItemsConfig,
  AiNodeConfig,
  ChatTriggerConfig,
  CodeNodeConfig,
  ConditionConfig,
  CroxFlowNode,
  DateTimeOperationsConfig,
  EditFieldsConfig,
  ErrorTriggerConfig,
  ExecuteWorkflowConfig,
  FilterItemsConfig,
  FormTriggerConfig,
  HttpRequestConfig,
  IntegrationActionConfig,
  JsonOperationsConfig,
  LimitItemsConfig,
  LoopItemsConfig,
  ManualTriggerConfig,
  MergeNodeConfig,
  NodeExecutionResult,
  NodeExecutionStatus,
  NoopConfig,
  RemoveDuplicatesConfig,
  ScheduleTriggerConfig,
  SendEmailConfig,
  SetDataConfig,
  SortItemsConfig,
  SplitOutConfig,
  StopAndErrorConfig,
  SwitchNodeConfig,
  TransformDataConfig,
  WaitNodeConfig,
  WebhookNotifyConfig,
  WebhookTriggerConfig,
  WorkflowEdge,
  WorkflowExecutionRecord,
  WorkflowExecutionStatus,
  WorkflowNode,
  WorkflowRecord,
} from '../../src/types/workflow.ts';
import { config } from '../config.ts';
import { decryptCredentialPayload, generateRandomToken } from '../utils/crypto.ts';
import { assertSafeExternalUrl, safeFetch } from '../utils/ssrf.ts';
import { interpolateTemplate, resolvePath, sanitizeForStorage } from '../utils/templateVars.ts';
import { executeAgentOrchestrator, executeAiAgentNode, runSandboxedJs } from './aiAgentService.ts';
import { executeWithProviderFailover, resolveProviderApiKey } from './aiProviderService.ts';
import { executeIntegrationAction } from './integrationService.ts';
import { CLUSTER_SUBNODE_TYPES, TRIGGER_NODE_TYPES, isClusterEdge, validateWorkflowGraph } from './workflowValidator.ts';

const activeCancellationFlags = new Map<string, boolean>();

export function requestExecutionCancellation(executionId: string): boolean {
  if (activeCancellationFlags.has(executionId)) {
    activeCancellationFlags.set(executionId, true);
    return true;
  }
  return false;
}

interface CredentialSecretLookup {
  id: string;
  type: string;
  label: string;
  secretValue: string;
}

function getDecryptedCredential(
  db: Database.Database,
  userId: string,
  credentialId: string,
  secretsCollector: string[]
): CredentialSecretLookup | null {
  if (!credentialId) return null;
  const row = db
    .prepare(
      'SELECT id, type, label, encrypted_payload, iv, auth_tag, is_enabled FROM credentials WHERE id = ? AND user_id = ?'
    )
    .get(credentialId, userId) as
    | {
        id: string;
        type: string;
        label: string;
        encrypted_payload: string;
        iv: string;
        auth_tag: string;
        is_enabled?: number;
      }
    | undefined;

  if (!row) {
    throw new Error('Selected credential was not found or belongs to another user.');
  }
  if (row.is_enabled === 0) {
    throw new Error('Selected credential is currently disabled.');
  }
  const secretValue = decryptCredentialPayload(row.encrypted_payload, row.iv, row.auth_tag);
  secretsCollector.push(secretValue);
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    secretValue,
  };
}

function evaluateCondition(
  inputVariable: string,
  operator: string,
  comparisonValue: string,
  context: Record<string, unknown>
): { matched: boolean; resolvedValue: unknown } {
  const resolvedValue = inputVariable.includes('{{')
    ? interpolateTemplate(inputVariable, context)
    : resolvePath(context, inputVariable);

  const leftStr = resolvedValue === undefined || resolvedValue === null ? '' : String(resolvedValue);
  const rightStr = interpolateTemplate(comparisonValue || '', context);

  let matched = false;
  switch (operator) {
    case 'equals':
      matched = leftStr === rightStr;
      break;
    case 'not_equals':
      matched = leftStr !== rightStr;
      break;
    case 'contains':
      matched = leftStr.toLowerCase().includes(rightStr.toLowerCase());
      break;
    case 'not_contains':
      matched = !leftStr.toLowerCase().includes(rightStr.toLowerCase());
      break;
    case 'greater_than': {
      const l = Number(resolvedValue);
      const r = Number(rightStr);
      matched = !Number.isNaN(l) && !Number.isNaN(r) && l > r;
      break;
    }
    case 'less_than': {
      const l = Number(resolvedValue);
      const r = Number(rightStr);
      matched = !Number.isNaN(l) && !Number.isNaN(r) && l < r;
      break;
    }
    case 'exists':
      matched = resolvedValue !== undefined && resolvedValue !== null && leftStr !== '';
      break;
    case 'is_empty':
      matched = resolvedValue === undefined || resolvedValue === null || leftStr.trim() === '';
      break;
    default:
      matched = false;
  }

  return { matched, resolvedValue };
}

function extractItemsArray(context: Record<string, unknown>, itemsPath?: string): unknown[] {
  const raw = itemsPath?.trim() ? resolvePath(context, itemsPath.trim()) : context.prev;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return raw !== undefined && raw !== null ? [raw] : [];
}

async function runSubworkflowById(
  db: Database.Database,
  userId: string,
  targetWorkflowId: string,
  payload: unknown,
  nextDepth: number
): Promise<unknown> {
  if (nextDepth > 3) {
    throw new Error('Maximum nested sub-workflow depth (3) exceeded.');
  }

  const row = db
    .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .get(targetWorkflowId, userId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error(`Target workflow "${targetWorkflowId}" was not found or belongs to another user.`);
  }

  const subWorkflow: WorkflowRecord = {
    id: row.id as string,
    userId: row.user_id as string,
    projectId: (row.project_id as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string) || '',
    isActive: Boolean(row.is_active),
    nodes: JSON.parse((row.nodes_json as string) || '[]'),
    edges: JSON.parse((row.edges_json as string) || '[]'),
    settings: JSON.parse((row.settings_json as string) || '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}'),
    webhookSecret: row.webhook_secret as string,
    lastExecutionStatus: (row.last_execution_status as WorkflowRecord['lastExecutionStatus']) || null,
    lastExecutedAt: (row.last_executed_at as string | null) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };

  const exec = await executeWorkflow(db, subWorkflow, {
    triggerType: 'subworkflow',
    triggerPayload: payload,
    subworkflowDepth: nextDepth,
  });

  if (exec.status === 'failed') {
    throw new Error(exec.errorMessage || `Sub-workflow "${subWorkflow.name}" failed.`);
  }

  const successfulSteps = (exec.nodeResults || []).filter((r) => r.status === 'success');
  const lastStep = successfulSteps[successfulSteps.length - 1];
  return {
    executionId: exec.id,
    workflowId: subWorkflow.id,
    workflowName: subWorkflow.name,
    status: exec.status,
    output: lastStep?.output ?? null,
  };
}

async function executeNodeAdapter(
  db: Database.Database,
  userId: string,
  workflowId: string,
  node: CroxFlowNode,
  allNodes: WorkflowNode[],
  allEdges: WorkflowEdge[],
  context: Record<string, unknown>,
  triggerPayload: unknown,
  secretsCollector: string[],
  subworkflowDepth: number,
  incomingOutputs?: unknown[]
): Promise<{ output: unknown; simulated: boolean; branch?: string }> {
  const nodeType = node.data.nodeType;

  switch (nodeType) {
    case 'manual_trigger': {
      const cfg = node.data.config as ManualTriggerConfig;
      let parsedSample: unknown = {};
      if (triggerPayload && Object.keys(triggerPayload as object).length > 0) {
        parsedSample = triggerPayload;
      } else if (cfg.samplePayload) {
        try {
          parsedSample = JSON.parse(cfg.samplePayload);
        } catch {
          parsedSample = { raw: cfg.samplePayload };
        }
      }
      return {
        simulated: false,
        output: {
          triggeredAt: new Date().toISOString(),
          mode: 'manual',
          body: parsedSample,
        },
      };
    }

    case 'webhook_trigger': {
      const cfg = node.data.config as WebhookTriggerConfig;
      let parsedSample: unknown = {};
      if (triggerPayload && Object.keys(triggerPayload as object).length > 0) {
        parsedSample = triggerPayload;
      } else if (cfg.samplePayload) {
        try {
          parsedSample = JSON.parse(cfg.samplePayload);
        } catch {
          parsedSample = { raw: cfg.samplePayload };
        }
      }
      return {
        simulated: false,
        output: {
          triggeredAt: new Date().toISOString(),
          method: cfg.method || 'POST',
          path: cfg.path || '/hook',
          body: parsedSample,
        },
      };
    }

    case 'schedule_trigger': {
      const cfg = node.data.config as ScheduleTriggerConfig;
      return {
        simulated: false,
        output: {
          triggeredAt: new Date().toISOString(),
          frequency: cfg.frequency,
          cronExpression: cfg.cronExpression,
          timezone: cfg.timezone || 'UTC',
          payload: triggerPayload || {},
        },
      };
    }

    case 'chat_trigger': {
      const cfg = node.data.config as ChatTriggerConfig;
      const payloadObj =
        triggerPayload && typeof triggerPayload === 'object' ? (triggerPayload as Record<string, unknown>) : {};
      const message = String(payloadObj.message || payloadObj.chatInput || cfg.sampleMessage || 'Hello!');
      const sessionId = String(payloadObj.sessionId || cfg.sessionKey || 'default');
      return {
        simulated: false,
        output: {
          triggeredAt: new Date().toISOString(),
          sessionId,
          chatInput: message,
          body: { message, sessionId, ...payloadObj },
        },
      };
    }

    case 'form_trigger': {
      const cfg = node.data.config as FormTriggerConfig;
      let submission: unknown = {};
      if (triggerPayload && Object.keys(triggerPayload as object).length > 0) {
        submission = triggerPayload;
      } else if (cfg.sampleSubmission) {
        try {
          submission = JSON.parse(cfg.sampleSubmission);
        } catch {
          submission = { raw: cfg.sampleSubmission };
        }
      }
      return {
        simulated: false,
        output: {
          triggeredAt: new Date().toISOString(),
          formTitle: cfg.formTitle || 'CROX Form',
          body: submission,
        },
      };
    }

    case 'error_trigger': {
      const cfg = node.data.config as ErrorTriggerConfig;
      let errPayload: unknown = {};
      if (triggerPayload && Object.keys(triggerPayload as object).length > 0) {
        errPayload = triggerPayload;
      } else if (cfg.sampleError) {
        try {
          errPayload = JSON.parse(cfg.sampleError);
        } catch {
          errPayload = { message: cfg.sampleError };
        }
      }
      return {
        simulated: false,
        output: {
          triggeredAt: new Date().toISOString(),
          error: errPayload,
          body: errPayload,
        },
      };
    }

    case 'ai_agent': {
      return executeAiAgentNode({
        db,
        userId,
        workflowId,
        agentNode: node,
        allNodes,
        allEdges,
        context,
        secretsCollector,
        subworkflowDepth,
        runSubworkflowFn: (targetId, payload, nextDepth) =>
          runSubworkflowById(db, userId, targetId, payload, nextDepth),
      });
    }

    case 'agent_orchestrator': {
      return executeAgentOrchestrator({
        db,
        userId,
        workflowId,
        orchestratorNode: node,
        allNodes,
        allEdges,
        context,
        secretsCollector,
        subworkflowDepth,
        runSubworkflowFn: (targetId, payload, nextDepth) =>
          runSubworkflowById(db, userId, targetId, payload, nextDepth),
      });
    }

    case 'ai_node': {
      const cfg = node.data.config as AiNodeConfig;
      const prompt = interpolateTemplate(cfg.prompt || '', context).trim();
      const sys = interpolateTemplate(cfg.systemInstruction || '', context).trim();

      if (!prompt) throw new Error('AI Node prompt cannot be empty.');

      const modelName = cfg.model || 'gemini-3.8-flash';

      if (cfg.credentialId) {
        const cred = getDecryptedCredential(db, userId, cfg.credentialId, secretsCollector);
        if (!cred?.secretValue?.trim()) {
          throw new Error('Selected AI credential is empty.');
        }
        const ai = new GoogleGenAI({
          apiKey: cred.secretValue.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            ...(sys ? { systemInstruction: sys } : {}),
            ...(cfg.outputFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
          },
        });
        const rawText = response.text || '';
        let parsed: unknown = rawText;
        if (cfg.outputFormat === 'json') {
          try {
            parsed = JSON.parse(rawText);
          } catch {
            parsed = rawText;
          }
        }
        return {
          simulated: false,
          output: { model: modelName, format: cfg.outputFormat || 'text', text: rawText, data: parsed },
        };
      }

      const probe = resolveProviderApiKey(db, userId, 'gemini');
      if (!probe.apiKey) {
        return {
          simulated: true,
          output: {
            simulated: true,
            notice:
              'Simulated AI output — no Gemini API key or AI Provider key is configured on the server.',
            model: modelName,
            promptPreview: prompt.slice(0, 240),
            text:
              cfg.outputFormat === 'json'
                ? {
                    summary: 'Simulated summary (configure GEMINI_API_KEY or add a key in AI Providers for live inference).',
                    inputLength: prompt.length,
                  }
                : `Simulated response for prompt (${prompt.length} chars). Configure GEMINI_API_KEY or an AI Provider key to run live inference.`,
          },
        };
      }

      const failoverRes = await executeWithProviderFailover({
        db,
        userId,
        primaryProviderId: 'gemini',
        requiredCapabilities: cfg.outputFormat === 'json' ? ['text', 'jsonMode'] : ['text'],
        runner: async (providerCfg, resolvedKey) => {
          if (resolvedKey) secretsCollector.push(resolvedKey);
          const chosenModel = providerCfg.providerId === 'gemini' ? modelName : providerCfg.defaultModel;
          if (providerCfg.protocol === 'gemini') {
            const ai = new GoogleGenAI({
              apiKey: resolvedKey!,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            });
            const response = await ai.models.generateContent({
              model: chosenModel,
              contents: prompt,
              config: {
                ...(sys ? { systemInstruction: sys } : {}),
                ...(cfg.outputFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
              },
            });
            return { text: response.text || '', model: chosenModel };
          }
          const base = providerCfg.baseUrl.replace(/\/+$/, '');
          await assertSafeExternalUrl(base);
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (resolvedKey) headers.Authorization = `Bearer ${resolvedKey}`;
          const resp = await safeFetch(`${base}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: chosenModel,
              messages: [...(sys ? [{ role: 'system', content: sys }] : []), { role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(20000),
          });
          if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`Provider error (${resp.status}): ${t.slice(0, 200)}`);
          }
          const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          return { text: json.choices?.[0]?.message?.content || '', model: chosenModel };
        },
      });

      const rawText = failoverRes.result.text;
      let parsed: unknown = rawText;
      if (cfg.outputFormat === 'json') {
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = rawText;
        }
      }

      return {
        simulated: false,
        output: {
          model: failoverRes.result.model,
          usedProvider: failoverRes.usedProviderId,
          failoverUsed: failoverRes.failoverUsed,
          format: cfg.outputFormat || 'text',
          text: rawText,
          data: parsed,
        },
      };
    }

    case 'edit_fields': {
      const cfg = node.data.config as EditFieldsConfig;
      const base: Record<string, unknown> =
        cfg.mode === 'merge' && context.prev && typeof context.prev === 'object' && !Array.isArray(context.prev)
          ? { ...(context.prev as Record<string, unknown>) }
          : {};

      for (const f of cfg.fields || []) {
        if (!f.name?.trim()) continue;
        const interpolated = interpolateTemplate(f.value || '', context);
        let typedVal: unknown = interpolated;
        if (f.type === 'number') {
          const n = Number(interpolated);
          typedVal = Number.isNaN(n) ? 0 : n;
        } else if (f.type === 'boolean') {
          typedVal = interpolated.toLowerCase() === 'true' || interpolated === '1';
        } else if (f.type === 'json') {
          try {
            typedVal = JSON.parse(interpolated);
          } catch {
            typedVal = interpolated;
          }
        }
        base[f.name.trim()] = typedVal;
      }
      return { simulated: false, output: base };
    }

    case 'set_data': {
      const cfg = node.data.config as SetDataConfig;
      const base: Record<string, unknown> =
        !cfg.keepOnlySet && context.prev && typeof context.prev === 'object' && !Array.isArray(context.prev)
          ? { ...(context.prev as Record<string, unknown>) }
          : {};

      for (const f of cfg.values || []) {
        if (!f.key?.trim()) continue;
        const interpolated = interpolateTemplate(f.value || '', context);
        let typedVal: unknown = interpolated;
        if (f.valueType === 'number') {
          const n = Number(interpolated);
          typedVal = Number.isNaN(n) ? 0 : n;
        } else if (f.valueType === 'boolean') {
          typedVal = interpolated.toLowerCase() === 'true' || interpolated === '1';
        } else if (f.valueType === 'json') {
          try {
            typedVal = JSON.parse(interpolated);
          } catch {
            typedVal = interpolated;
          }
        }
        base[f.key.trim()] = typedVal;
      }
      return { simulated: false, output: base };
    }

    case 'transform_data': {
      const cfg = node.data.config as TransformDataConfig;
      const base: Record<string, unknown> =
        cfg.mode === 'merge' && context.prev && typeof context.prev === 'object'
          ? { ...(context.prev as Record<string, unknown>) }
          : {};

      for (const mapping of cfg.mappings || []) {
        if (!mapping.targetField?.trim()) continue;
        let val: unknown;
        if (mapping.operation === 'static') {
          val = mapping.sourceExpression;
        } else if (mapping.operation === 'template' || mapping.sourceExpression.includes('{{')) {
          val = interpolateTemplate(mapping.sourceExpression, context);
        } else {
          val = resolvePath(context, mapping.sourceExpression);
        }

        if (mapping.operation === 'uppercase' && typeof val === 'string') val = val.toUpperCase();
        if (mapping.operation === 'lowercase' && typeof val === 'string') val = val.toLowerCase();
        if (mapping.operation === 'trim' && typeof val === 'string') val = val.trim();
        if (mapping.operation === 'json_parse' && typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch {
            // keep string
          }
        }
        base[mapping.targetField.trim()] = val;
      }

      return { simulated: false, output: base };
    }

    case 'code_node': {
      const cfg = node.data.config as CodeNodeConfig;
      if (!cfg.code?.trim()) {
        throw new Error('Code Node JavaScript snippet is empty.');
      }
      const result = await runSandboxedJs(
        cfg.code,
        {
          input: context.prev ?? null,
          prev: context.prev ?? null,
          trigger: context.trigger ?? null,
          nodes: context.nodes ?? {},
        },
        1000
      );
      return { simulated: false, output: result ?? {} };
    }

    case 'filter_items': {
      const cfg = node.data.config as FilterItemsConfig;
      const items = extractItemsArray(context, cfg.itemsPath);
      const filtered = items.filter((item) => {
        const itemCtx = { ...context, item };
        const fieldPath = cfg.field.startsWith('item.') ? cfg.field : `item.${cfg.field}`;
        return evaluateCondition(fieldPath, cfg.operator, cfg.value || '', itemCtx).matched;
      });
      return {
        simulated: false,
        output: {
          items: filtered,
          count: filtered.length,
          filteredOutCount: items.length - filtered.length,
        },
      };
    }

    case 'sort_items': {
      const cfg = node.data.config as SortItemsConfig;
      const items = [...extractItemsArray(context, cfg.itemsPath)];
      items.sort((a, b) => {
        const va = cfg.field ? resolvePath({ item: a }, `item.${cfg.field}`) : a;
        const vb = cfg.field ? resolvePath({ item: b }, `item.${cfg.field}`) : b;
        const na = Number(va);
        const nb = Number(vb);
        let cmp = 0;
        if (!Number.isNaN(na) && !Number.isNaN(nb) && va !== '' && vb !== '') {
          cmp = na - nb;
        } else {
          cmp = String(va ?? '').localeCompare(String(vb ?? ''));
        }
        return cfg.direction === 'desc' ? -cmp : cmp;
      });
      return { simulated: false, output: { items, count: items.length } };
    }

    case 'limit_items': {
      const cfg = node.data.config as LimitItemsConfig;
      const items = extractItemsArray(context, cfg.itemsPath);
      const offset = Math.max(Number(cfg.offset) || 0, 0);
      const limit = Math.max(Number(cfg.limit) || 10, 0);
      const sliced = items.slice(offset, offset + limit);
      return { simulated: false, output: { items: sliced, count: sliced.length } };
    }

    case 'aggregate_items': {
      const cfg = node.data.config as AggregateItemsConfig;
      const items = extractItemsArray(context, cfg.itemsPath);
      const values = cfg.field
        ? items.map((item) => resolvePath({ item }, `item.${cfg.field}`))
        : items;
      const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));

      let aggregated: unknown = null;
      switch (cfg.operation) {
        case 'count':
          aggregated = items.length;
          break;
        case 'sum':
          aggregated = nums.reduce((acc, n) => acc + n, 0);
          break;
        case 'avg':
          aggregated = nums.length > 0 ? nums.reduce((acc, n) => acc + n, 0) / nums.length : 0;
          break;
        case 'min':
          aggregated = nums.length > 0 ? Math.min(...nums) : null;
          break;
        case 'max':
          aggregated = nums.length > 0 ? Math.max(...nums) : null;
          break;
        case 'collect':
          aggregated = values;
          break;
      }

      const key = cfg.outputField?.trim() || 'result';
      return { simulated: false, output: { [key]: aggregated, itemCount: items.length } };
    }

    case 'split_out': {
      const cfg = node.data.config as SplitOutConfig;
      const items = extractItemsArray(context, cfg.itemsPath);
      const normalized = items.map((item, idx) =>
        cfg.includeParentFields && context.prev && typeof context.prev === 'object' && !Array.isArray(context.prev)
          ? { ...(context.prev as Record<string, unknown>), item, index: idx }
          : { item, index: idx }
      );
      return { simulated: false, output: { items: normalized, count: normalized.length } };
    }

    case 'remove_duplicates': {
      const cfg = node.data.config as RemoveDuplicatesConfig;
      const items = extractItemsArray(context, cfg.itemsPath);
      const seen = new Set<string>();
      const unique: unknown[] = [];
      for (const item of items) {
        const keyVal = cfg.keyField?.trim()
          ? resolvePath({ item }, `item.${cfg.keyField.trim()}`)
          : item;
        const serialized = JSON.stringify(keyVal ?? null);
        if (!seen.has(serialized)) {
          seen.add(serialized);
          unique.push(item);
        }
      }
      return {
        simulated: false,
        output: { items: unique, count: unique.length, removedCount: items.length - unique.length },
      };
    }

    case 'json_operations': {
      const cfg = node.data.config as JsonOperationsConfig;
      const target = cfg.sourcePath?.trim() ? resolvePath(context, cfg.sourcePath.trim()) : context.prev;
      if (cfg.operation === 'parse') {
        const parsed = typeof target === 'string' ? JSON.parse(target) : target;
        return { simulated: false, output: { data: parsed } };
      }
      if (cfg.operation === 'stringify') {
        return { simulated: false, output: { json: JSON.stringify(target ?? null, null, 2) } };
      }
      if (cfg.operation === 'pick') {
        const keys = (cfg.keys || '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        const picked: Record<string, unknown> = {};
        if (target && typeof target === 'object' && !Array.isArray(target)) {
          for (const k of keys) {
            picked[k] = (target as Record<string, unknown>)[k];
          }
        }
        return { simulated: false, output: picked };
      }
      // flatten
      const flattened: Record<string, unknown> = {};
      const walk = (obj: unknown, prefix: string) => {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            walk(v, prefix ? `${prefix}.${k}` : k);
          }
        } else if (prefix) {
          flattened[prefix] = obj;
        }
      };
      walk(target, '');
      return { simulated: false, output: flattened };
    }

    case 'datetime_operations': {
      const cfg = node.data.config as DateTimeOperationsConfig;
      const rawInput = cfg.inputExpression?.trim()
        ? interpolateTemplate(cfg.inputExpression, context)
        : new Date().toISOString();
      const baseDate = new Date(rawInput || Date.now());
      const tz = cfg.timezone || 'UTC';
      if (Number.isNaN(baseDate.getTime())) {
        throw new Error(`Invalid date value "${rawInput}"`);
      }
      if (cfg.operation === 'add_days') {
        const next = new Date(baseDate.getTime() + (Number(cfg.amount) || 0) * 86400000);
        return { simulated: false, output: { iso: next.toISOString(), epochMs: next.getTime() } };
      }
      if (cfg.operation === 'diff_days') {
        const diffDays = Math.round((Date.now() - baseDate.getTime()) / 86400000);
        return { simulated: false, output: { diffDays, baseIso: baseDate.toISOString() } };
      }
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(baseDate);
      return {
        simulated: false,
        output: { iso: baseDate.toISOString(), formatted, timezone: tz, epochMs: baseDate.getTime() },
      };
    }

    case 'condition': {
      const cfg = node.data.config as ConditionConfig;
      const { matched, resolvedValue } = evaluateCondition(
        cfg.inputVariable,
        cfg.operator,
        cfg.comparisonValue,
        context
      );
      return {
        simulated: false,
        branch: matched ? 'true' : 'false',
        output: {
          matched,
          branch: matched ? 'true' : 'false',
          operator: cfg.operator,
          evaluatedValue: resolvedValue ?? null,
          comparisonValue: cfg.comparisonValue,
        },
      };
    }

    case 'switch_node': {
      const cfg = node.data.config as SwitchNodeConfig;
      let matchedKey = 'default';
      let matchedLabel = 'Default';
      for (const rule of cfg.rules || []) {
        const { matched } = evaluateCondition(
          cfg.inputVariable,
          rule.operator,
          rule.comparisonValue,
          context
        );
        if (matched) {
          matchedKey = rule.outputKey;
          matchedLabel = rule.label;
          break;
        }
      }
      return {
        simulated: false,
        branch: matchedKey,
        output: {
          matchedBranch: matchedKey,
          matchedLabel,
          passthrough: context.prev ?? null,
        },
      };
    }

    case 'merge_node': {
      const cfg = node.data.config as MergeNodeConfig;
      const inputs = (incomingOutputs || []).filter((v) => v !== undefined);
      if (cfg.mode === 'first_non_empty') {
        return { simulated: false, output: inputs[0] ?? {} };
      }
      if (cfg.mode === 'append') {
        return { simulated: false, output: { items: inputs, count: inputs.length } };
      }
      const combined: Record<string, unknown> = {};
      for (const item of inputs) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          Object.assign(combined, item);
        }
      }
      return { simulated: false, output: combined };
    }

    case 'loop_items': {
      const cfg = node.data.config as LoopItemsConfig;
      const items = extractItemsArray(context, cfg.itemsPath).slice(0, Math.min(Math.max(Number(cfg.maxItems) || 50, 1), 500));
      const batchSize = Math.min(Math.max(Number(cfg.batchSize) || 1, 1), 100);
      const batches: unknown[][] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }
      return {
        simulated: false,
        output: {
          totalItems: items.length,
          batchCount: batches.length,
          batches,
          items,
        },
      };
    }

    case 'wait_node': {
      const cfg = node.data.config as WaitNodeConfig;
      const durationMs = Math.min(Math.max(Number(cfg.durationMs) || 500, 0), 10000);
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      return {
        simulated: false,
        output: {
          waitedMs: durationMs,
          resumedAt: new Date().toISOString(),
          passthrough: context.prev ?? null,
        },
      };
    }

    case 'stop_and_error': {
      const cfg = node.data.config as StopAndErrorConfig;
      const msg = interpolateTemplate(cfg.errorMessage || 'Workflow halted by Stop & Error node.', context);
      throw new Error(msg);
    }

    case 'execute_workflow': {
      const cfg = node.data.config as ExecuteWorkflowConfig;
      if (!cfg.targetWorkflowId?.trim()) {
        throw new Error('Target workflow ID is required for Execute Workflow.');
      }
      let payload: unknown = context.prev ?? {};
      if (cfg.payloadExpression?.trim()) {
        const rendered = interpolateTemplate(cfg.payloadExpression, context);
        try {
          payload = JSON.parse(rendered);
        } catch {
          payload = { raw: rendered };
        }
      }
      const res = await runSubworkflowById(
        db,
        userId,
        cfg.targetWorkflowId.trim(),
        payload,
        subworkflowDepth + 1
      );
      return { simulated: false, output: res };
    }

    case 'noop': {
      const cfg = node.data.config as NoopConfig;
      return {
        simulated: false,
        output: {
          note: cfg.note || 'No-op passthrough',
          data: context.prev ?? null,
        },
      };
    }

    case 'webhook_notify': {
      const cfg = node.data.config as WebhookNotifyConfig;
      const rawUrl = interpolateTemplate(cfg.webhookUrl || '', context).trim();
      const message = interpolateTemplate(cfg.message || '', context).trim();
      const username = interpolateTemplate(cfg.username || 'Crox Automation', context).trim();

      if (!rawUrl) {
        return {
          simulated: true,
          output: {
            simulated: true,
            notice:
              'Simulated notification — enter a Slack, Discord, or Teams incoming webhook URL to deliver live alerts.',
            platform: cfg.platform,
            username,
            message,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const urlObj = await assertSafeExternalUrl(rawUrl);
      const payload =
        cfg.platform === 'discord'
          ? { content: message, username }
          : cfg.platform === 'slack'
            ? { text: message, username }
            : { message, username, timestamp: new Date().toISOString(), data: context.prev ?? null };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await safeFetch(urlObj.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'CROX-Workflow-Engine/1.0' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const responseText = await res.text();
        if (!res.ok) {
          throw new Error(`Webhook notification failed (${res.status}): ${responseText.slice(0, 200)}`);
        }
        return {
          simulated: false,
          output: {
            delivered: true,
            platform: cfg.platform,
            status: res.status,
            message,
          },
        };
      } finally {
        clearTimeout(timer);
      }
    }

    case 'http_request': {
      const cfg = node.data.config as HttpRequestConfig;
      const rawUrl = interpolateTemplate(cfg.url || '', context);
      const urlObj = await assertSafeExternalUrl(rawUrl);

      for (const qp of cfg.queryParams || []) {
        if (qp.key?.trim()) {
          urlObj.searchParams.set(qp.key.trim(), interpolateTemplate(qp.value || '', context));
        }
      }

      const headers: Record<string, string> = {
        'User-Agent': 'CROX-Workflow-Engine/1.0',
      };
      for (const h of cfg.headers || []) {
        if (h.key?.trim()) {
          headers[h.key.trim()] = interpolateTemplate(h.value || '', context);
        }
      }

      if (cfg.credentialId) {
        const cred = getDecryptedCredential(db, userId, cfg.credentialId, secretsCollector);
        if (cred) {
          if (cred.type === 'api_key') {
            headers['X-API-Key'] = cred.secretValue;
          } else {
            headers['Authorization'] =
              cred.secretValue.startsWith('Bearer ') || cred.secretValue.startsWith('Basic ')
                ? cred.secretValue
                : `Bearer ${cred.secretValue}`;
          }
        }
      }

      const timeoutMs = Math.min(Math.max(Number(cfg.timeoutMs) || config.execution.defaultTimeoutMs, 1000), 30000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const method = cfg.method || 'GET';
      let body: string | undefined;
      if (method !== 'GET' && cfg.body?.trim()) {
        body = interpolateTemplate(cfg.body, context);
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      try {
        const response = await safeFetch(urlObj.toString(), {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        const text = await response.text();
        const truncated = text.length > 200_000 ? text.slice(0, 200_000) : text;
        let parsedBody: unknown = truncated;
        if (cfg.responseType !== 'text') {
          try {
            parsedBody = JSON.parse(truncated);
          } catch {
            parsedBody = truncated;
          }
        }

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText}: ${
              typeof parsedBody === 'string' ? parsedBody.slice(0, 300) : JSON.stringify(parsedBody).slice(0, 300)
            }`
          );
        }

        return {
          simulated: false,
          output: {
            status: response.status,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            data: parsedBody,
          },
        };
      } finally {
        clearTimeout(timer);
      }
    }

    case 'send_email': {
      const cfg = node.data.config as SendEmailConfig;
      const interpolatedTo = interpolateTemplate(cfg.to || '', context).trim();
      const to = interpolatedTo || (cfg.to?.includes('{{') ? 'demo-recipient@example.com' : '');
      const interpolatedSubject = interpolateTemplate(cfg.subject || '', context).trim();
      const subject = interpolatedSubject || (cfg.subject?.includes('{{') ? 'Crox Workflow Notification' : '');
      const body = interpolateTemplate(cfg.body || '', context);

      if (!to) throw new Error('Send Email recipient ("to") is required.');
      if (!subject) throw new Error('Send Email subject is required.');

      if (cfg.credentialId) {
        const cred = getDecryptedCredential(db, userId, cfg.credentialId, secretsCollector);
        if (cred) {
          let smtpCfg: { host?: string; port?: number; user?: string; pass?: string; from?: string };
          try {
            smtpCfg = JSON.parse(cred.secretValue);
          } catch {
            throw new Error(
              'Email SMTP credential must be valid JSON containing {"host","port","user","pass","from"}.'
            );
          }
          if (!smtpCfg.host || !smtpCfg.user || !smtpCfg.pass) {
            throw new Error('Email SMTP credential is missing host, user, or pass.');
          }
          const transporter = nodemailer.createTransport({
            host: smtpCfg.host,
            port: Number(smtpCfg.port || 587),
            secure: Number(smtpCfg.port) === 465,
            auth: { user: smtpCfg.user, pass: smtpCfg.pass },
          });
          const info = await transporter.sendMail({
            from: smtpCfg.from || smtpCfg.user,
            to,
            subject,
            text: cfg.isHtml ? undefined : body,
            html: cfg.isHtml ? body : undefined,
          });
          return {
            simulated: false,
            output: {
              delivered: true,
              messageId: info.messageId,
              to,
              subject,
            },
          };
        }
      }

      return {
        simulated: true,
        output: {
          simulated: true,
          notice:
            'Simulated email delivery — configure an Email SMTP credential in Credentials and link it to this node for real delivery.',
          to,
          subject,
          preview: body.slice(0, 500),
          timestamp: new Date().toISOString(),
        },
      };
    }

    case 'integration_action': {
      const cfg = node.data.config as IntegrationActionConfig;
      const resolvedParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.parameters || {})) {
        resolvedParams[k] = interpolateTemplate(String(v ?? ''), context);
      }
      if (cfg.credentialId) {
        getDecryptedCredential(db, userId, cfg.credentialId, secretsCollector);
      }
      return executeIntegrationAction({
        db,
        userId,
        appId: cfg.appId,
        actionId: cfg.actionId,
        credentialId: cfg.credentialId || '',
        resolvedParams,
      });
    }

    default:
      throw new Error(`Node type "${nodeType}" cannot be executed directly.`);
  }
}

export async function testSingleNode(
  db: Database.Database,
  userId: string,
  node: WorkflowNode,
  sampleInput: unknown = {},
  contextNodes: WorkflowNode[] = [],
  contextEdges: WorkflowEdge[] = [],
  workflowId = 'test_workflow'
): Promise<{ output: unknown; simulated: boolean; durationMs: number; branch?: string }> {
  if (node.type === 'stickyNote' || node.type === 'group') {
    throw new Error('Sticky notes and groups cannot be executed directly.');
  }
  const flowNode = node as CroxFlowNode;
  if (CLUSTER_SUBNODE_TYPES.has(flowNode.data.nodeType)) {
    throw new Error('AI sub-nodes execute automatically through their parent AI Agent.');
  }

  const startMs = Date.now();
  const secretsCollector: string[] = [];
  const context: Record<string, unknown> = {
    trigger: { body: sampleInput, triggeredAt: new Date().toISOString() },
    prev: sampleInput,
    nodes: {},
  };
  const result = await executeNodeAdapter(
    db,
    userId,
    workflowId,
    flowNode,
    contextNodes.length > 0 ? contextNodes : [node],
    contextEdges,
    context,
    sampleInput,
    secretsCollector,
    0
  );
  return {
    output: sanitizeForStorage(result.output, secretsCollector),
    simulated: result.simulated,
    durationMs: Date.now() - startMs,
    branch: result.branch,
  };
}

export async function executeWorkflow(
  db: Database.Database,
  workflow: WorkflowRecord,
  options: {
    triggerType: WorkflowExecutionRecord['triggerType'];
    triggerPayload?: unknown;
    runFromNodeId?: string;
    seedNodeOutputs?: Record<string, unknown>;
    subworkflowDepth?: number;
  }
): Promise<WorkflowExecutionRecord> {
  const executionId = `exec_${generateRandomToken(10)}`;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const subworkflowDepth = options.subworkflowDepth ?? 0;

  const functionalNodes = (workflow.nodes || []).filter(
    (n): n is CroxFlowNode => n.type !== 'stickyNote' && n.type !== 'group'
  );
  const mainNodes = functionalNodes.filter((n) => !CLUSTER_SUBNODE_TYPES.has(n.data.nodeType));

  const validation = validateWorkflowGraph(workflow.nodes, workflow.edges, { strictConfig: true });
  if (!validation.valid) {
    const summary = {
      totalNodes: mainNodes.length,
      successCount: 0,
      failedCount: 0,
      skippedCount: mainNodes.length,
    };
    const errMsg = validation.errors.join(' ');
    db.prepare(
      `INSERT INTO workflow_executions (id, workflow_id, user_id, trigger_type, status, started_at, completed_at, duration_ms, summary_json, error_message)
       VALUES (?, ?, ?, ?, 'failed', ?, ?, 0, ?, ?)`
    ).run(executionId, workflow.id, workflow.userId, options.triggerType, startedAt, startedAt, JSON.stringify(summary), errMsg);

    db.prepare('UPDATE workflows SET last_execution_status = ?, last_executed_at = ? WHERE id = ?').run(
      'failed',
      startedAt,
      workflow.id
    );

    return {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      userId: workflow.userId,
      triggerType: options.triggerType,
      status: 'failed',
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      summary,
      errorMessage: errMsg,
      nodeResults: [],
    };
  }

  const initialSummary = {
    totalNodes: mainNodes.length,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
  };

  db.prepare(
    `INSERT INTO workflow_executions (id, workflow_id, user_id, trigger_type, status, started_at, duration_ms, summary_json)
     VALUES (?, ?, ?, ?, 'running', ?, 0, ?)`
  ).run(executionId, workflow.id, workflow.userId, options.triggerType, startedAt, JSON.stringify(initialSummary));

  activeCancellationFlags.set(executionId, false);

  const nodeMap = new Map<string, CroxFlowNode>(functionalNodes.map((n) => [n.id, n]));
  const incomingEdgesMap = new Map<string, WorkflowEdge[]>();
  const outgoingEdgesMap = new Map<string, WorkflowEdge[]>();
  for (const n of mainNodes) {
    incomingEdgesMap.set(n.id, []);
    outgoingEdgesMap.set(n.id, []);
  }
  for (const e of workflow.edges) {
    if (isClusterEdge(e, nodeMap)) continue;
    incomingEdgesMap.get(e.target)?.push(e);
    outgoingEdgesMap.get(e.source)?.push(e);
  }

  // If runFromNodeId is specified, collect downstream nodes reachable from runFromNodeId
  let allowedPartialNodes: Set<string> | null = null;
  if (options.runFromNodeId && nodeMap.has(options.runFromNodeId)) {
    allowedPartialNodes = new Set<string>([options.runFromNodeId]);
    const queue = [options.runFromNodeId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const edge of outgoingEdgesMap.get(cur) || []) {
        if (!allowedPartialNodes.has(edge.target)) {
          allowedPartialNodes.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
  }

  const activatedEdgeIds = new Set<string>();
  const nodeOutputs = new Map<string, unknown>(Object.entries(options.seedNodeOutputs || {}));
  const nodeStatuses = new Map<string, NodeExecutionStatus>();
  const nodeResults: NodeExecutionResult[] = [];
  const secretsCollector: string[] = [];

  let overallStatus: WorkflowExecutionStatus = 'success';
  let overallError: string | null = null;
  let triggerOutput: unknown = options.triggerPayload || {};

  const maxWorkflowAttempts = workflow.settings?.retryOnFailure
    ? Math.min(Math.max(Number(workflow.settings.maxRetries) || 1, 1), 3) + 1
    : 1;

  const maxExecutionMs = Math.min(Math.max(Number(workflow.settings?.maxExecutionMs) || 45000, 3000), 120000);

  try {
    for (const nodeId of validation.executionOrder) {
      const node = nodeMap.get(nodeId)!;
      const incoming = incomingEdgesMap.get(nodeId) || [];

      if (Date.now() - startedMs > maxExecutionMs) {
        overallStatus = 'failed';
        overallError = `Workflow exceeded max execution timeout (${maxExecutionMs}ms).`;
        break;
      }

      if (activeCancellationFlags.get(executionId)) {
        overallStatus = 'cancelled';
        overallError = 'Execution was cancelled by user.';
        const skipNow = new Date().toISOString();
        nodeStatuses.set(nodeId, 'skipped');
        nodeResults.push({
          id: `nexec_${generateRandomToken(8)}`,
          executionId,
          nodeId,
          nodeName: node.data.label,
          nodeType: node.data.nodeType,
          status: 'skipped',
          input: null,
          output: null,
          errorMessage: 'Skipped due to execution cancellation.',
          durationMs: 0,
          startedAt: skipNow,
          completedAt: skipNow,
          simulated: false,
        });
        continue;
      }

      // Skip nodes excluded by partial Run From Selected Node mode
      if (allowedPartialNodes && !allowedPartialNodes.has(nodeId)) {
        if (TRIGGER_NODE_TYPES.has(node.data.nodeType)) {
          if (nodeOutputs.has(nodeId)) {
            triggerOutput = nodeOutputs.get(nodeId);
          } else {
            try {
              const seededTrig = await executeNodeAdapter(
                db,
                workflow.userId,
                workflow.id,
                node,
                workflow.nodes,
                workflow.edges,
                { trigger: triggerOutput, prev: triggerOutput, nodes: {} },
                options.triggerPayload,
                secretsCollector,
                subworkflowDepth,
                []
              );
              nodeOutputs.set(nodeId, seededTrig.output);
              triggerOutput = seededTrig.output;
            } catch {
              // ignore sample trigger parse fallback
            }
          }
        }
        const skipNow = new Date().toISOString();
        nodeStatuses.set(nodeId, 'skipped');
        for (const e of outgoingEdgesMap.get(nodeId) || []) {
          activatedEdgeIds.add(e.id);
        }
        nodeResults.push({
          id: `nexec_${generateRandomToken(8)}`,
          executionId,
          nodeId,
          nodeName: node.data.label,
          nodeType: node.data.nodeType,
          status: 'skipped',
          input: null,
          output: nodeOutputs.get(nodeId) ?? null,
          errorMessage: 'Bypassed (started from a downstream selected node).',
          durationMs: 0,
          startedAt: skipNow,
          completedAt: skipNow,
          simulated: false,
        });
        continue;
      }

      // Disabled node passthrough
      if (node.data.disabled) {
        const skipTime = new Date().toISOString();
        nodeStatuses.set(nodeId, 'skipped');
        for (const e of outgoingEdgesMap.get(nodeId) || []) {
          activatedEdgeIds.add(e.id);
        }
        nodeResults.push({
          id: `nexec_${generateRandomToken(8)}`,
          executionId,
          nodeId,
          nodeName: node.data.label,
          nodeType: node.data.nodeType,
          status: 'skipped',
          input: null,
          output: null,
          errorMessage: 'Node is disabled.',
          durationMs: 0,
          startedAt: skipTime,
          completedAt: skipTime,
          simulated: false,
        });
        continue;
      }

      const isRoot = incoming.length === 0;
      const hasActiveIncomingEdge = incoming.some((e) => activatedEdgeIds.has(e.id));

      if (!isRoot && !hasActiveIncomingEdge) {
        const skipTime = new Date().toISOString();
        const reason =
          overallStatus === 'failed'
            ? 'Skipped because an upstream node failed.'
            : 'Skipped because conditional branch was not taken.';
        nodeStatuses.set(nodeId, 'skipped');
        nodeResults.push({
          id: `nexec_${generateRandomToken(8)}`,
          executionId,
          nodeId,
          nodeName: node.data.label,
          nodeType: node.data.nodeType,
          status: 'skipped',
          input: null,
          output: null,
          errorMessage: reason,
          durationMs: 0,
          startedAt: skipTime,
          completedAt: skipTime,
          simulated: false,
        });
        continue;
      }

      const activeIncomingEdges = incoming.filter((e) => activatedEdgeIds.has(e.id));
      const incomingOutputs = activeIncomingEdges
        .map((e) => nodeOutputs.get(e.source))
        .filter((v) => v !== undefined);
      const lastSourceId = activeIncomingEdges[activeIncomingEdges.length - 1]?.source;
      const prevOutput = lastSourceId ? nodeOutputs.get(lastSourceId) : triggerOutput;

      const nodesContext: Record<string, unknown> = {};
      for (const [k, v] of nodeOutputs.entries()) {
        nodesContext[k] = v;
      }

      const context: Record<string, unknown> = {
        trigger: triggerOutput,
        prev: prevOutput,
        nodes: nodesContext,
      };

      const nodeStartMs = Date.now();
      const nodeStartedAt = new Date().toISOString();

      const ns = node.data.nodeSettings;
      const nodeMaxAttempts = ns?.retryOnFailure
        ? Math.min(Math.max(Number(ns.maxRetries) || 1, 1), 3) + 1
        : maxWorkflowAttempts;
      const waitBetweenMs = Math.min(Math.max(Number(ns?.waitBetweenRetriesMs) || 300, 50), 3000);

      let lastErr: unknown = null;
      let succeededResult: { output: unknown; simulated: boolean; branch?: string } | null = null;

      for (let attempt = 1; attempt <= nodeMaxAttempts; attempt++) {
        try {
          succeededResult = await executeNodeAdapter(
            db,
            workflow.userId,
            workflow.id,
            node,
            workflow.nodes,
            workflow.edges,
            context,
            options.triggerPayload,
            secretsCollector,
            subworkflowDepth,
            incomingOutputs
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < nodeMaxAttempts) {
            await new Promise((r) => setTimeout(r, waitBetweenMs * attempt));
          }
        }
      }

      const nodeEndMs = Date.now();
      const nodeCompletedAt = new Date().toISOString();

      if (succeededResult && !lastErr) {
        const finalOutput =
          (succeededResult.output === undefined || succeededResult.output === null) && ns?.alwaysOutputData
            ? { empty: true }
            : succeededResult.output;

        nodeStatuses.set(nodeId, 'success');
        nodeOutputs.set(nodeId, finalOutput);

        if (TRIGGER_NODE_TYPES.has(node.data.nodeType)) {
          triggerOutput = finalOutput;
        }

        const outgoing = outgoingEdgesMap.get(nodeId) || [];
        for (const edge of outgoing) {
          if (node.data.nodeType === 'condition') {
            const handle = edge.sourceHandle === 'false' ? 'false' : 'true';
            if (handle === succeededResult.branch) {
              activatedEdgeIds.add(edge.id);
            }
          } else if (node.data.nodeType === 'switch_node') {
            const handle = edge.sourceHandle || 'default';
            if (handle === succeededResult.branch) {
              activatedEdgeIds.add(edge.id);
            }
          } else {
            activatedEdgeIds.add(edge.id);
          }
        }

        nodeResults.push({
          id: `nexec_${generateRandomToken(8)}`,
          executionId,
          nodeId,
          nodeName: node.data.label,
          nodeType: node.data.nodeType,
          status: 'success',
          input: sanitizeForStorage(prevOutput, secretsCollector),
          output: sanitizeForStorage(finalOutput, secretsCollector),
          errorMessage: null,
          durationMs: nodeEndMs - nodeStartMs,
          startedAt: nodeStartedAt,
          completedAt: nodeCompletedAt,
          simulated: succeededResult.simulated,
        });
      } else {
        const message = lastErr instanceof Error ? lastErr.message : 'Node execution failed.';
        const shouldContinue = Boolean(ns?.continueOnFail || ns?.onError === 'continue');

        if (shouldContinue) {
          const errOut = { error: message, continuedOnFail: true };
          nodeStatuses.set(nodeId, 'failed');
          nodeOutputs.set(nodeId, errOut);
          for (const edge of outgoingEdgesMap.get(nodeId) || []) {
            activatedEdgeIds.add(edge.id);
          }
          nodeResults.push({
            id: `nexec_${generateRandomToken(8)}`,
            executionId,
            nodeId,
            nodeName: node.data.label,
            nodeType: node.data.nodeType,
            status: 'failed',
            input: sanitizeForStorage(prevOutput, secretsCollector),
            output: errOut,
            errorMessage: `${message} (continued on fail)`,
            durationMs: nodeEndMs - nodeStartMs,
            startedAt: nodeStartedAt,
            completedAt: nodeCompletedAt,
            simulated: false,
          });
        } else {
          overallStatus = 'failed';
          if (!overallError) {
            overallError = `Node "${node.data.label}" failed: ${message}`;
          }
          nodeStatuses.set(nodeId, 'failed');
          nodeResults.push({
            id: `nexec_${generateRandomToken(8)}`,
            executionId,
            nodeId,
            nodeName: node.data.label,
            nodeType: node.data.nodeType,
            status: 'failed',
            input: sanitizeForStorage(prevOutput, secretsCollector),
            output: null,
            errorMessage: message,
            durationMs: nodeEndMs - nodeStartMs,
            startedAt: nodeStartedAt,
            completedAt: nodeCompletedAt,
            simulated: false,
          });
        }
      }
    }
  } finally {
    activeCancellationFlags.delete(executionId);
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;

  const summary = {
    totalNodes: mainNodes.length,
    successCount: nodeResults.filter((r) => r.status === 'success').length,
    failedCount: nodeResults.filter((r) => r.status === 'failed').length,
    skippedCount: nodeResults.filter((r) => r.status === 'skipped').length,
  };

  const insertNodeExec = db.prepare(
    `INSERT INTO node_executions (id, execution_id, node_id, node_name, node_type, status, input_json, output_json, error_message, duration_ms, started_at, completed_at, simulated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const nr of nodeResults) {
      insertNodeExec.run(
        nr.id,
        nr.executionId,
        nr.nodeId,
        nr.nodeName,
        nr.nodeType,
        nr.status,
        nr.input !== undefined ? JSON.stringify(nr.input) : null,
        nr.output !== undefined ? JSON.stringify(nr.output) : null,
        nr.errorMessage,
        nr.durationMs,
        nr.startedAt,
        nr.completedAt,
        nr.simulated ? 1 : 0
      );
    }

    db.prepare(
      `UPDATE workflow_executions
       SET status = ?, completed_at = ?, duration_ms = ?, summary_json = ?, error_message = ?
       WHERE id = ?`
    ).run(overallStatus, completedAt, durationMs, JSON.stringify(summary), overallError, executionId);

    db.prepare('UPDATE workflows SET last_execution_status = ?, last_executed_at = ? WHERE id = ?').run(
      overallStatus,
      completedAt,
      workflow.id
    );
  });
  tx();

  // Optional Error Workflow trigger on failure (depth-guarded)
  if (
    overallStatus === 'failed' &&
    workflow.settings?.errorWorkflowId &&
    workflow.settings.errorWorkflowId !== workflow.id &&
    subworkflowDepth < 1 &&
    options.triggerType !== 'error'
  ) {
    try {
      const errRow = db
        .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
        .get(workflow.settings.errorWorkflowId, workflow.userId) as Record<string, unknown> | undefined;
      if (errRow) {
        const errWf: WorkflowRecord = {
          id: errRow.id as string,
          userId: errRow.user_id as string,
          projectId: (errRow.project_id as string | null) ?? null,
          name: errRow.name as string,
          description: (errRow.description as string) || '',
          isActive: Boolean(errRow.is_active),
          nodes: JSON.parse((errRow.nodes_json as string) || '[]'),
          edges: JSON.parse((errRow.edges_json as string) || '[]'),
          settings: JSON.parse((errRow.settings_json as string) || '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}'),
          webhookSecret: errRow.webhook_secret as string,
          lastExecutionStatus: null,
          lastExecutedAt: null,
          createdAt: errRow.created_at as string,
          updatedAt: errRow.updated_at as string,
        };
        await executeWorkflow(db, errWf, {
          triggerType: 'error',
          triggerPayload: {
            failedWorkflowId: workflow.id,
            failedWorkflowName: workflow.name,
            executionId,
            errorMessage: overallError,
            failedAt: completedAt,
          },
          subworkflowDepth: subworkflowDepth + 1,
        });
      }
    } catch {
      // ignore error-workflow cascading failures
    }
  }

  return {
    id: executionId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    userId: workflow.userId,
    triggerType: options.triggerType,
    status: overallStatus,
    startedAt,
    completedAt,
    durationMs,
    summary,
    errorMessage: overallError,
    nodeResults,
  };
}
