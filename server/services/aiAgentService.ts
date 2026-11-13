import Database from 'better-sqlite3';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AgentOrchestratorConfig,
  AiAgentConfig,
  AiAgentExecutionTrace,
  AiAgentToolCallTrace,
  AiProviderId,
  AnthropicChatModelConfig,
  AutofixOutputParserConfig,
  ConversationMemoryConfig,
  CroxFlowNode,
  GeminiChatModelConfig,
  OpenAiChatModelConfig,
  SimpleMemoryConfig,
  StructuredOutputParserConfig,
  ToolCalculatorConfig,
  ToolCustomConfig,
  ToolDateTimeConfig,
  ToolHttpRequestConfig,
  ToolWorkflowConfig,
  WindowedMemoryConfig,
  WorkflowEdge,
  WorkflowNode,
} from '../../src/types/workflow.ts';
import { getGeminiApiKey } from '../config.ts';
import { decryptCredentialPayload, generateRandomToken } from '../utils/crypto.ts';
import { assertSafeExternalUrl, safeFetch } from '../utils/ssrf.ts';
import { interpolateTemplate } from '../utils/templateVars.ts';
import {
  ProviderExecutionError,
  classifyProviderError,
  executeWithProviderFailover,
  getProviderDefinition,
  resolveProviderApiKey,
} from './aiProviderService.ts';
import {
  CHAT_MODEL_NODE_TYPES,
  CLUSTER_SUBNODE_TYPES,
  MEMORY_NODE_TYPES,
  OUTPUT_PARSER_NODE_TYPES,
  TOOL_NODE_TYPES,
  isClusterEdge,
} from './workflowValidator.ts';

export interface StoredMemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AgentAttachmentBundle {
  chatModel: CroxFlowNode | null;
  memory: CroxFlowNode | null;
  outputParser: CroxFlowNode | null;
  tools: CroxFlowNode[];
}

export function resolveAgentAttachments(
  agentNodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): AgentAttachmentBundle {
  const functionalNodes = nodes.filter(
    (n): n is CroxFlowNode => n.type !== 'stickyNote' && n.type !== 'group'
  );
  const nodeMap = new Map(functionalNodes.map((n) => [n.id, n]));

  let chatModel: CroxFlowNode | null = null;
  let memory: CroxFlowNode | null = null;
  let outputParser: CroxFlowNode | null = null;
  const tools: CroxFlowNode[] = [];

  for (const edge of edges || []) {
    if (!isClusterEdge(edge, nodeMap)) continue;
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) continue;

    let subNode: CroxFlowNode | null = null;
    if (tgt.id === agentNodeId && CLUSTER_SUBNODE_TYPES.has(src.data.nodeType)) {
      subNode = src;
    } else if (src.id === agentNodeId && CLUSTER_SUBNODE_TYPES.has(tgt.data.nodeType)) {
      subNode = tgt;
    }
    if (!subNode || subNode.data.disabled) continue;

    if (CHAT_MODEL_NODE_TYPES.has(subNode.data.nodeType)) {
      chatModel = subNode;
    } else if (MEMORY_NODE_TYPES.has(subNode.data.nodeType)) {
      memory = subNode;
    } else if (OUTPUT_PARSER_NODE_TYPES.has(subNode.data.nodeType)) {
      outputParser = subNode;
    } else if (TOOL_NODE_TYPES.has(subNode.data.nodeType)) {
      tools.push(subNode);
    }
  }

  return { chatModel, memory, outputParser, tools };
}

/**
 * Safe recursive-descent mathematical expression evaluator (NO eval / Function).
 */
export function evalSafeMathExpression(expr: string): number {
  const cleaned = String(expr || '').trim();
  if (!cleaned || cleaned.length > 250) {
    throw new Error('Math expression is empty or exceeds maximum length.');
  }

  let pos = 0;
  const peek = () => cleaned[pos] || '';
  const skipWs = () => {
    while (pos < cleaned.length && /\s/.test(cleaned[pos])) pos++;
  };

  function parseExpression(): number {
    let val = parseTerm();
    while (true) {
      skipWs();
      const ch = peek();
      if (ch === '+') {
        pos++;
        val += parseTerm();
      } else if (ch === '-') {
        pos++;
        val -= parseTerm();
      } else {
        break;
      }
    }
    return val;
  }

  function parseTerm(): number {
    let val = parsePower();
    while (true) {
      skipWs();
      const ch = peek();
      if (ch === '*') {
        pos++;
        val *= parsePower();
      } else if (ch === '/') {
        pos++;
        const d = parsePower();
        if (d === 0) throw new Error('Division by zero.');
        val /= d;
      } else if (ch === '%') {
        pos++;
        const d = parsePower();
        if (d === 0) throw new Error('Modulo by zero.');
        val %= d;
      } else {
        break;
      }
    }
    return val;
  }

  function parsePower(): number {
    const base = parseUnary();
    skipWs();
    if (peek() === '^') {
      pos++;
      return Math.pow(base, parsePower());
    }
    return base;
  }

  function parseUnary(): number {
    skipWs();
    if (peek() === '-') {
      pos++;
      return -parseUnary();
    }
    if (peek() === '+') {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    skipWs();
    const ch = peek();
    if (ch === '(') {
      pos++;
      const val = parseExpression();
      skipWs();
      if (peek() !== ')') throw new Error('Mismatched parentheses.');
      pos++;
      return val;
    }

    if (/[0-9.]/.test(ch)) {
      const start = pos;
      let dotCount = 0;
      while (pos < cleaned.length && /[0-9.]/.test(cleaned[pos])) {
        if (cleaned[pos] === '.') dotCount++;
        if (dotCount > 1) throw new Error('Invalid number format.');
        pos++;
      }
      const num = Number(cleaned.slice(start, pos));
      if (!Number.isFinite(num)) throw new Error('Invalid numeric literal.');
      return num;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const start = pos;
      while (pos < cleaned.length && /[a-zA-Z0-9_]/.test(cleaned[pos])) pos++;
      const ident = cleaned.slice(start, pos).toLowerCase();
      if (ident === 'pi') return Math.PI;
      if (ident === 'e') return Math.E;

      skipWs();
      if (peek() !== '(') {
        throw new Error(`Unsupported identifier: ${ident}`);
      }
      pos++;
      const args: number[] = [];
      skipWs();
      if (peek() !== ')') {
        args.push(parseExpression());
        while (true) {
          skipWs();
          if (peek() === ',') {
            pos++;
            args.push(parseExpression());
          } else {
            break;
          }
        }
      }
      skipWs();
      if (peek() !== ')') throw new Error(`Expected ')' after arguments to ${ident}`);
      pos++;

      switch (ident) {
        case 'sqrt':
          return Math.sqrt(args[0]);
        case 'abs':
          return Math.abs(args[0]);
        case 'round':
          return Math.round(args[0]);
        case 'floor':
          return Math.floor(args[0]);
        case 'ceil':
          return Math.ceil(args[0]);
        case 'sin':
          return Math.sin(args[0]);
        case 'cos':
          return Math.cos(args[0]);
        case 'tan':
          return Math.tan(args[0]);
        case 'log':
          return Math.log(args[0]);
        case 'min':
          return Math.min(...args);
        case 'max':
          return Math.max(...args);
        case 'pow':
          return Math.pow(args[0], args[1]);
        default:
          throw new Error(`Unsupported math function: ${ident}`);
      }
    }

    throw new Error(`Unexpected character "${ch}" at position ${pos}`);
  }

  const result = parseExpression();
  skipWs();
  if (pos < cleaned.length) {
    throw new Error(`Unexpected trailing input "${cleaned.slice(pos)}"`);
  }
  if (!Number.isFinite(result)) {
    throw new Error('Math evaluation produced a non-finite result.');
  }
  return result;
}

/**
 * Execute user-authored JavaScript in a separate Node process protected by the
 * Node Permission Model. The worker receives only JSON workflow data, not the
 * Express process environment, credentials, database handles, or exposed network APIs.
 */
let activeCodeNodeProcesses = 0;
const MAX_CONCURRENT_CODE_NODES = 4;
const MAX_CODE_NODE_INPUT_BYTES = 1024 * 1024;
const MAX_CODE_NODE_OUTPUT_BYTES = 1024 * 1024;
const CODE_NODE_TIMEOUT_MS = 4500;

export function runSandboxedJs(
  code: string,
  sandboxInputs: Record<string, unknown>,
  timeoutMs = 1000
): Promise<unknown> {
  if (typeof code !== 'string' || Buffer.byteLength(code, 'utf8') > 64 * 1024) {
    return Promise.reject(new Error('Code Node snippet is invalid or exceeds the 64 KB limit.'));
  }
  if (activeCodeNodeProcesses >= MAX_CONCURRENT_CODE_NODES) {
    return Promise.reject(new Error('Code Node capacity is busy. Try again after another isolated execution finishes.'));
  }
  if (!process.allowedNodeEnvironmentFlags.has('--permission')) {
    return Promise.reject(new Error('Isolated Code Node execution requires Node.js 22.13 or newer.'));
  }

  let inputJson: string;
  try {
    inputJson = JSON.stringify({ code, inputs: sandboxInputs ?? {}, timeoutMs });
  } catch {
    return Promise.reject(new Error('Code Node input must contain JSON-serializable workflow data.'));
  }
  if (Buffer.byteLength(inputJson, 'utf8') > MAX_CODE_NODE_INPUT_BYTES) {
    return Promise.reject(new Error('Code Node input data exceeds the 1 MB limit.'));
  }

  const workerPath = fileURLToPath(new URL('../workers/codeSandboxWorker.mjs', import.meta.url));
  const args = [
    '--permission',
    `--allow-fs-read=${workerPath}`,
    '--disable-proto=throw',
    '--max-old-space-size=96',
    workerPath,
  ];
  const childEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH || '', NODE_ENV: 'production' };
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) childEnv[key] = process.env[key];
  }

  activeCodeNodeProcesses += 1;
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
        windowsHide: true,
      });
    } catch (error) {
      activeCodeNodeProcesses = Math.max(0, activeCodeNodeProcesses - 1);
      reject(error instanceof Error ? error : new Error('Could not start isolated Code Node runtime.'));
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Code Node exceeded its isolated execution time limit.'));
    }, CODE_NODE_TIMEOUT_MS);

    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeCodeNodeProcesses = Math.max(0, activeCodeNodeProcesses - 1);
      if (error) reject(error);
      else resolve(result);
    };

    if (!child.stdout || !child.stderr || !child.stdin) {
      child.kill('SIGKILL');
      finish(new Error('Could not open isolated Code Node communication pipes.'));
      return;
    }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_CODE_NODE_OUTPUT_BYTES + 4096) {
        child.kill('SIGKILL');
        finish(new Error('Code Node output exceeds the 1 MB limit.'));
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8 * 1024);
    });
    child.once('error', (error) => finish(new Error(`Could not start isolated Code Node runtime: ${error.message}`)));
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      if (exitCode !== 0) {
        let workerMessage = '';
        try {
          const response = JSON.parse(stdout) as { error?: string };
          workerMessage = response.error || '';
        } catch {
          // Include only bounded stderr in the actionable failure below.
        }
        finish(new Error(workerMessage || stderr.trim() || `Isolated Code Node exited (${signal || exitCode}).`));
        return;
      }
      try {
        const response = JSON.parse(stdout) as { ok?: boolean; result?: unknown; error?: string };
        if (!response.ok) throw new Error(response.error || 'Code Node execution failed.');
        finish(undefined, response.result);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid response from isolated Code Node runtime.'));
      }
    });
    child.stdin.once('error', (error) => {
      child.kill('SIGKILL');
      finish(new Error(`Could not send data to isolated Code Node: ${error.message}`));
    });
    child.stdin.end(inputJson);
  });
}

export function loadAiMemory(
  db: Database.Database,
  userId: string,
  sessionKey: string,
  conversationId: string,
  maxMessages: number
): StoredMemoryMessage[] {
  const row = db
    .prepare(
      `SELECT messages_json FROM ai_memory_sessions
       WHERE user_id = ? AND session_key = ? AND conversation_id = ?`
    )
    .get(userId, sessionKey, conversationId) as { messages_json: string } | undefined;

  if (!row) return [];
  try {
    const parsed = JSON.parse(row.messages_json) as StoredMemoryMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-Math.max(maxMessages, 1));
  } catch {
    return [];
  }
}

export function saveAiMemory(
  db: Database.Database,
  userId: string,
  workflowId: string | null,
  sessionKey: string,
  conversationId: string,
  messages: StoredMemoryMessage[],
  maxMessages: number
): void {
  const trimmed = messages.slice(-Math.max(maxMessages, 1));
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT id FROM ai_memory_sessions
       WHERE user_id = ? AND session_key = ? AND conversation_id = ?`
    )
    .get(userId, sessionKey, conversationId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE ai_memory_sessions
       SET messages_json = ?, workflow_id = COALESCE(?, workflow_id), updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(JSON.stringify(trimmed), workflowId, now, existing.id, userId);
  } else {
    db.prepare(
      `INSERT INTO ai_memory_sessions (id, user_id, workflow_id, session_key, conversation_id, messages_json, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `mem_${generateRandomToken(8)}`,
      userId,
      workflowId,
      sessionKey,
      conversationId,
      JSON.stringify(trimmed),
      now,
      now
    );
  }
}

export function clearAiMemorySession(
  db: Database.Database,
  userId: string,
  sessionKey: string,
  conversationId = 'default'
): number {
  const res = db
    .prepare(
      `DELETE FROM ai_memory_sessions
       WHERE user_id = ? AND session_key = ? AND conversation_id = ?`
    )
    .run(userId, sessionKey, conversationId);
  return res.changes;
}

function getCredentialSecret(
  db: Database.Database,
  userId: string,
  credentialId: string,
  secretsCollector: string[]
): string | null {
  if (!credentialId) return null;
  const row = db
    .prepare('SELECT encrypted_payload, iv, auth_tag, is_enabled FROM credentials WHERE id = ? AND user_id = ?')
    .get(credentialId, userId) as
    | { encrypted_payload: string; iv: string; auth_tag: string; is_enabled?: number }
    | undefined;
  if (!row) {
    throw new Error('Selected credential was not found or belongs to another user.');
  }
  if (row.is_enabled === 0) {
    throw new Error('Selected credential is currently disabled.');
  }
  const secret = decryptCredentialPayload(row.encrypted_payload, row.iv, row.auth_tag);
  secretsCollector.push(secret);
  return secret;
}

export function validateJsonAgainstSchema(
  rawValue: string,
  schemaJsonText: string
): { valid: boolean; parsed: unknown; error?: string } {
  let schema: {
    type?: string;
    required?: string[];
    properties?: Record<string, { type?: string }>;
  };
  try {
    schema = JSON.parse(schemaJsonText || '{}');
  } catch {
    return { valid: false, parsed: null, error: 'Output parser JSON Schema is malformed.' };
  }

  let parsed: unknown;
  const stripped = rawValue
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { valid: false, parsed: null, error: 'Model output is not valid JSON.' };
  }

  if (schema.type === 'object' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
    return { valid: false, parsed, error: 'Expected a JSON object matching the output parser schema.' };
  }
  if (schema.type === 'array' && !Array.isArray(parsed)) {
    return { valid: false, parsed, error: 'Expected a JSON array matching the output parser schema.' };
  }

  if (Array.isArray(schema.required) && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const missing = schema.required.filter((k) => !(k in obj) || obj[k] === undefined);
    if (missing.length > 0) {
      return {
        valid: false,
        parsed,
        error: `Output JSON is missing required fields: ${missing.join(', ')}`,
      };
    }
  }

  if (schema.properties && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (obj[key] !== undefined && propSchema.type) {
        const expected = propSchema.type;
        const actual = Array.isArray(obj[key]) ? 'array' : typeof obj[key];
        if (expected === 'integer' || expected === 'number') {
          if (typeof obj[key] !== 'number' || Number.isNaN(obj[key])) {
            return { valid: false, parsed, error: `Field "${key}" must be a ${expected}.` };
          }
        } else if (actual !== expected) {
          return { valid: false, parsed, error: `Field "${key}" must be of type ${expected}.` };
        }
      }
    }
  }

  return { valid: true, parsed };
}

interface PreparedTool {
  toolName: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
  geminiDeclaration: FunctionDeclaration;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

function buildPreparedTools(
  db: Database.Database,
  userId: string,
  toolNodes: CroxFlowNode[],
  context: Record<string, unknown>,
  secretsCollector: string[],
  subworkflowDepth: number,
  runSubworkflowFn: (targetWorkflowId: string, payload: unknown, nextDepth: number) => Promise<unknown>
): PreparedTool[] {
  const prepared: PreparedTool[] = [];

  for (const node of toolNodes) {
    switch (node.data.nodeType) {
      case 'tool_calculator': {
        const cfg = node.data.config as ToolCalculatorConfig;
        const toolName = 'calculator';
        const description =
          cfg.description || 'Evaluates mathematical expressions safely (e.g., (240 * 1.15) + sqrt(16)).';
        prepared.push({
          toolName,
          description,
          parametersJsonSchema: {
            type: 'object',
            properties: {
              expression: { type: 'string', description: 'Mathematical expression to evaluate.' },
            },
            required: ['expression'],
          },
          geminiDeclaration: {
            name: toolName,
            description,
            parameters: {
              type: Type.OBJECT,
              properties: {
                expression: { type: Type.STRING, description: 'Mathematical expression to evaluate.' },
              },
              required: ['expression'],
            },
          },
          execute: async (args) => {
            const expression = String(args.expression || '');
            const value = evalSafeMathExpression(expression);
            return { expression, result: value };
          },
        });
        break;
      }

      case 'tool_datetime': {
        const cfg = node.data.config as ToolDateTimeConfig;
        const toolName = 'current_datetime';
        const description = cfg.description || 'Returns the current ISO date, time, and formatted timezone date.';
        prepared.push({
          toolName,
          description,
          parametersJsonSchema: {
            type: 'object',
            properties: {
              timezone: { type: 'string', description: 'IANA timezone name like UTC or America/New_York' },
            },
          },
          geminiDeclaration: {
            name: toolName,
            description,
            parameters: {
              type: Type.OBJECT,
              properties: {
                timezone: { type: Type.STRING, description: 'IANA timezone name like UTC or America/New_York' },
              },
            },
          },
          execute: async (args) => {
            const tz = String(args.timezone || cfg.defaultTimezone || 'UTC');
            const now = new Date();
            let formatted = now.toISOString();
            try {
              formatted = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                dateStyle: 'full',
                timeStyle: 'long',
              }).format(now);
            } catch {
              // fallback to UTC
            }
            return { iso: now.toISOString(), timezone: tz, formatted };
          },
        });
        break;
      }

      case 'tool_http_request': {
        const cfg = node.data.config as ToolHttpRequestConfig;
        const cleanName = (cfg.toolName || 'http_tool').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48);
        const description = cfg.description || `Fetches or sends data to ${cfg.url || 'an external HTTP API'}`;
        prepared.push({
          toolName: cleanName,
          description,
          parametersJsonSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Optional query parameter or search term' },
              bodyJson: { type: 'string', description: 'Optional JSON body string for POST/PUT requests' },
            },
          },
          geminiDeclaration: {
            name: cleanName,
            description,
            parameters: {
              type: Type.OBJECT,
              properties: {
                query: { type: Type.STRING, description: 'Optional query parameter or search term' },
                bodyJson: { type: Type.STRING, description: 'Optional JSON body string for POST/PUT requests' },
              },
            },
          },
          execute: async (args) => {
            const rawUrl = interpolateTemplate(cfg.url || '', { ...context, toolArgs: args });
            const urlObj = await assertSafeExternalUrl(rawUrl);
            if (args.query && typeof args.query === 'string') {
              urlObj.searchParams.set('q', args.query);
            }
            const headers: Record<string, string> = { 'User-Agent': 'CROX-Agent-Tool/1.0' };
            for (const h of cfg.headers || []) {
              if (h.key?.trim()) headers[h.key.trim()] = interpolateTemplate(h.value || '', context);
            }
            if (cfg.credentialId) {
              const secret = getCredentialSecret(db, userId, cfg.credentialId, secretsCollector);
              if (secret) {
                headers['Authorization'] = secret.startsWith('Bearer ') ? secret : `Bearer ${secret}`;
              }
            }
            const method = cfg.method || 'GET';
            let body: string | undefined;
            if (method !== 'GET') {
              body =
                typeof args.bodyJson === 'string' && args.bodyJson.trim()
                  ? args.bodyJson
                  : cfg.bodyTemplate
                    ? interpolateTemplate(cfg.bodyTemplate, { ...context, toolArgs: args })
                    : undefined;
              if (body && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
              }
            }
            const res = await safeFetch(urlObj.toString(), { method, headers, body });
            const text = await res.text();
            let data: unknown = text.slice(0, 20000);
            try {
              data = JSON.parse(text);
            } catch {
              // keep text
            }
            return { status: res.status, ok: res.ok, data };
          },
        });
        break;
      }

      case 'tool_workflow': {
        const cfg = node.data.config as ToolWorkflowConfig;
        const cleanName = (cfg.toolName || 'run_subworkflow').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48);
        const description = cfg.description || 'Executes another CROX workflow with a JSON payload.';
        prepared.push({
          toolName: cleanName,
          description,
          parametersJsonSchema: {
            type: 'object',
            properties: {
              payloadJson: { type: 'string', description: 'JSON payload to pass to the target workflow' },
            },
          },
          geminiDeclaration: {
            name: cleanName,
            description,
            parameters: {
              type: Type.OBJECT,
              properties: {
                payloadJson: { type: Type.STRING, description: 'JSON payload to pass to the target workflow' },
              },
            },
          },
          execute: async (args) => {
            if (!cfg.targetWorkflowId?.trim()) {
              throw new Error('Target workflow ID is required for Workflow Tool.');
            }
            let payload: unknown = {};
            if (typeof args.payloadJson === 'string' && args.payloadJson.trim()) {
              try {
                payload = JSON.parse(args.payloadJson);
              } catch {
                payload = { raw: args.payloadJson };
              }
            }
            return runSubworkflowFn(cfg.targetWorkflowId.trim(), payload, subworkflowDepth + 1);
          },
        });
        break;
      }

      case 'tool_custom': {
        const cfg = node.data.config as ToolCustomConfig;
        const cleanName = (cfg.toolName || 'custom_tool').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48);
        const description = cfg.description || 'Custom JavaScript tool.';
        let parsedSchema: Record<string, unknown> = { type: 'object', properties: { input: { type: 'string' } } };
        try {
          parsedSchema = JSON.parse(cfg.parametersSchemaJson || '{}');
        } catch {
          // keep default
        }
        prepared.push({
          toolName: cleanName,
          description,
          parametersJsonSchema: parsedSchema,
          geminiDeclaration: {
            name: cleanName,
            description,
            parameters: {
              type: Type.OBJECT,
              properties: {
                input: { type: Type.STRING, description: 'Input argument or JSON string' },
              },
            },
          },
          execute: async (args) => {
            return await runSandboxedJs(cfg.code || 'return args;', { args, context }, 1000);
          },
        });
        break;
      }
    }
  }

  return prepared;
}

async function runGeminiAgentLoop(params: {
  apiKey: string;
  modelName: string;
  temperature: number;
  maxOutputTokens?: number;
  sysMessage: string;
  userPrompt: string;
  memoryMessages: StoredMemoryMessage[];
  preparedTools: PreparedTool[];
  toolMap: Map<string, PreparedTool>;
  outputParser: CroxFlowNode | null;
  maxIterations: number;
}): Promise<{
  finalText: string;
  parsedOutput: unknown;
  iterations: number;
  toolCallsTrace: AiAgentToolCallTrace[];
  outputParserApplied: boolean;
  outputParserValid: boolean;
}> {
  const {
    apiKey,
    modelName,
    temperature,
    maxOutputTokens,
    sysMessage,
    userPrompt,
    memoryMessages,
    preparedTools,
    toolMap,
    outputParser,
    maxIterations,
  } = params;

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
  for (const m of memoryMessages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: userPrompt }] });

  const parserSystemNote = outputParser
    ? `\n\nIMPORTANT: Return ONLY valid JSON matching this schema:\n${
        (outputParser.data.config as StructuredOutputParserConfig).schemaJson
      }`
    : '';

  const fullSystem = `${sysMessage || 'You are a helpful CROX AI workflow agent.'}${parserSystemNote}`.trim();
  const toolCallsTrace: AiAgentToolCallTrace[] = [];

  let finalText = '';
  let iterations = 0;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;
    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents as unknown as string,
      config: {
        systemInstruction: fullSystem,
        temperature,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(preparedTools.length > 0
          ? { tools: [{ functionDeclarations: preparedTools.map((t) => t.geminiDeclaration) }] }
          : {}),
      },
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) {
        contents.push(modelContent as unknown as { role: string; parts: Array<Record<string, unknown>> });
      }

      const responseParts: Array<Record<string, unknown>> = [];
      for (const call of functionCalls) {
        const toolName = call.name || '';
        const args = (call.args || {}) as Record<string, unknown>;
        const tool = toolMap.get(toolName);
        const tStart = Date.now();
        let toolResult: unknown;
        let toolErr: string | undefined;

        if (!tool) {
          toolErr = `Tool "${toolName}" is not attached to this AI Agent.`;
          toolResult = { error: toolErr };
        } else {
          try {
            toolResult = await tool.execute(args);
          } catch (err) {
            toolErr = err instanceof Error ? err.message : 'Tool execution error';
            toolResult = { error: toolErr };
          }
        }

        toolCallsTrace.push({
          iteration: iter,
          toolName,
          args,
          result: toolResult,
          durationMs: Date.now() - tStart,
          ...(toolErr ? { error: toolErr } : {}),
        });

        responseParts.push({
          functionResponse: {
            id: call.id,
            name: toolName,
            response:
              typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult)
                ? (toolResult as Record<string, unknown>)
                : { output: toolResult },
          },
        });
      }

      contents.push({ role: 'user', parts: responseParts });
    } else {
      finalText = response.text || '';
      break;
    }
  }

  if (!finalText && toolCallsTrace.length > 0) {
    finalText = JSON.stringify(toolCallsTrace[toolCallsTrace.length - 1].result);
  }

  let parsedOutput: unknown = finalText;
  let outputParserApplied = false;
  let outputParserValid = true;

  if (outputParser) {
    outputParserApplied = true;
    const pCfg = outputParser.data.config as StructuredOutputParserConfig | AutofixOutputParserConfig;
    let check = validateJsonAgainstSchema(finalText, pCfg.schemaJson || '{}');

    if (!check.valid && outputParser.data.nodeType === 'autofix_output_parser') {
      const repairAttempts = Math.min(
        Math.max(Number((pCfg as AutofixOutputParserConfig).maxRepairAttempts) || 1, 1),
        2
      );
      for (let r = 0; r < repairAttempts && !check.valid; r++) {
        const repairRes = await ai.models.generateContent({
          model: modelName,
          contents: `Fix the following output so it is strictly valid JSON matching this JSON schema.\nSchema:\n${pCfg.schemaJson}\n\nValidation error: ${check.error}\n\nOriginal output:\n${finalText}`,
          config: { responseMimeType: 'application/json' },
        });
        finalText = repairRes.text || finalText;
        check = validateJsonAgainstSchema(finalText, pCfg.schemaJson || '{}');
      }
    }

    outputParserValid = check.valid;
    if (!check.valid) {
      const strict =
        outputParser.data.nodeType === 'autofix_output_parser' ||
        Boolean((pCfg as StructuredOutputParserConfig).strict);
      if (strict) {
        throw new Error(`Output Parser validation failed: ${check.error}`);
      }
    } else {
      parsedOutput = check.parsed;
    }
  }

  return { finalText, parsedOutput, iterations, toolCallsTrace, outputParserApplied, outputParserValid };
}

async function runOpenAiAgentLoop(params: {
  providerId: AiProviderId;
  baseUrl: string;
  apiKey: string | null;
  modelName: string;
  temperature: number;
  maxTokens?: number;
  sysMessage: string;
  userPrompt: string;
  memoryMessages: StoredMemoryMessage[];
  preparedTools: PreparedTool[];
  toolMap: Map<string, PreparedTool>;
  outputParser: CroxFlowNode | null;
  maxIterations: number;
}): Promise<{
  finalText: string;
  parsedOutput: unknown;
  iterations: number;
  toolCallsTrace: AiAgentToolCallTrace[];
  outputParserApplied: boolean;
  outputParserValid: boolean;
}> {
  const {
    providerId,
    baseUrl,
    apiKey,
    modelName,
    temperature,
    maxTokens,
    sysMessage,
    userPrompt,
    memoryMessages,
    preparedTools,
    toolMap,
    outputParser,
    maxIterations,
  } = params;

  const cleanBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  await assertSafeExternalUrl(cleanBase);
  const endpointUrl = `${cleanBase}/chat/completions`;

  const openAiMessages: Array<Record<string, unknown>> = [];
  const parserNote = outputParser
    ? `\n\nReturn ONLY valid JSON matching this schema:\n${
        (outputParser.data.config as StructuredOutputParserConfig).schemaJson
      }`
    : '';
  if (sysMessage || parserNote) {
    openAiMessages.push({
      role: 'system',
      content: `${sysMessage || 'You are a helpful CROX AI workflow agent.'}${parserNote}`.trim(),
    });
  }
  for (const m of memoryMessages) {
    openAiMessages.push({ role: m.role, content: m.content });
  }
  openAiMessages.push({ role: 'user', content: userPrompt });

  const openAiTools = preparedTools.map((t) => ({
    type: 'function',
    function: {
      name: t.toolName,
      description: t.description,
      parameters: t.parametersJsonSchema,
    },
  }));

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const toolCallsTrace: AiAgentToolCallTrace[] = [];
  let finalText = '';
  let iterations = 0;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;
    const res = await safeFetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages: openAiMessages,
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(openAiTools.length > 0 ? { tools: openAiTools } : {}),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      const classified = classifyProviderError(res.status, errText, res.headers.get('retry-after'));
      throw new ProviderExecutionError(
        `OpenAI-compatible API error (${res.status}): ${errText.slice(0, 240)}`,
        classified.kind,
        providerId,
        res.status,
        classified.retryAfterMs
      );
    }

    const payload = (await res.json()) as {
      choices?: Array<{
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const msg = payload.choices?.[0]?.message;
    if (!msg) break;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      openAiMessages.push(msg as unknown as Record<string, unknown>);
      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}');
        } catch {
          parsedArgs = {};
        }
        const tool = toolMap.get(toolName);
        const tStart = Date.now();
        let toolResult: unknown;
        let toolErr: string | undefined;
        if (!tool) {
          toolErr = `Tool "${toolName}" not attached.`;
          toolResult = { error: toolErr };
        } else {
          try {
            toolResult = await tool.execute(parsedArgs);
          } catch (err) {
            toolErr = err instanceof Error ? err.message : 'Tool error';
            toolResult = { error: toolErr };
          }
        }
        toolCallsTrace.push({
          iteration: iter,
          toolName,
          args: parsedArgs,
          result: toolResult,
          durationMs: Date.now() - tStart,
          ...(toolErr ? { error: toolErr } : {}),
        });
        openAiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }
    } else {
      finalText = msg.content || '';
      break;
    }
  }

  if (!finalText && toolCallsTrace.length > 0) {
    finalText = JSON.stringify(toolCallsTrace[toolCallsTrace.length - 1].result);
  }

  let parsedOutput: unknown = finalText;
  let outputParserApplied = false;
  let outputParserValid = true;
  if (outputParser) {
    outputParserApplied = true;
    const pCfg = outputParser.data.config as StructuredOutputParserConfig | AutofixOutputParserConfig;
    const check = validateJsonAgainstSchema(finalText, pCfg.schemaJson || '{}');
    outputParserValid = check.valid;
    if (!check.valid) {
      throw new Error(`Output Parser validation failed: ${check.error}`);
    }
    parsedOutput = check.parsed;
  }

  return { finalText, parsedOutput, iterations, toolCallsTrace, outputParserApplied, outputParserValid };
}

async function runAnthropicAgentLoop(params: {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  maxTokens?: number;
  sysMessage: string;
  userPrompt: string;
  memoryMessages: StoredMemoryMessage[];
  preparedTools: PreparedTool[];
  toolMap: Map<string, PreparedTool>;
  outputParser: CroxFlowNode | null;
  maxIterations: number;
}): Promise<{
  finalText: string;
  parsedOutput: unknown;
  iterations: number;
  toolCallsTrace: AiAgentToolCallTrace[];
  outputParserApplied: boolean;
  outputParserValid: boolean;
}> {
  const {
    baseUrl,
    apiKey,
    modelName,
    temperature,
    maxTokens,
    sysMessage,
    userPrompt,
    memoryMessages,
    preparedTools,
    toolMap,
    outputParser,
    maxIterations,
  } = params;

  const cleanBase = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  await assertSafeExternalUrl(cleanBase);
  const endpointUrl = `${cleanBase}/messages`;

  const parserNote = outputParser
    ? `\n\nReturn ONLY valid JSON matching this schema:\n${
        (outputParser.data.config as StructuredOutputParserConfig).schemaJson
      }`
    : '';
  const systemText = `${sysMessage || 'You are a helpful CROX AI workflow agent.'}${parserNote}`.trim();

  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];
  for (const m of memoryMessages) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userPrompt });

  const anthropicTools = preparedTools.map((t) => ({
    name: t.toolName,
    description: t.description,
    input_schema: t.parametersJsonSchema,
  }));

  const toolCallsTrace: AiAgentToolCallTrace[] = [];
  let finalText = '';
  let iterations = 0;

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;
    const res = await safeFetch(endpointUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: maxTokens || 2048,
        temperature,
        system: systemText,
        messages,
        ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      const classified = classifyProviderError(res.status, errText, res.headers.get('retry-after'));
      throw new ProviderExecutionError(
        `Anthropic API error (${res.status}): ${errText.slice(0, 240)}`,
        classified.kind,
        'anthropic',
        res.status,
        classified.retryAfterMs
      );
    }

    const payload = (await res.json()) as {
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
    };

    const blocks = payload.content || [];
    const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');
    const textBlocks = blocks.filter((b) => b.type === 'text' && b.text).map((b) => b.text!);

    if (toolUseBlocks.length > 0) {
      messages.push({ role: 'assistant', content: blocks });
      const resultBlocks: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

      for (const tu of toolUseBlocks) {
        const toolName = tu.name || '';
        const parsedArgs = tu.input || {};
        const tool = toolMap.get(toolName);
        const tStart = Date.now();
        let toolResult: unknown;
        let toolErr: string | undefined;

        if (!tool) {
          toolErr = `Tool "${toolName}" not attached.`;
          toolResult = { error: toolErr };
        } else {
          try {
            toolResult = await tool.execute(parsedArgs);
          } catch (err) {
            toolErr = err instanceof Error ? err.message : 'Tool error';
            toolResult = { error: toolErr };
          }
        }

        toolCallsTrace.push({
          iteration: iter,
          toolName,
          args: parsedArgs,
          result: toolResult,
          durationMs: Date.now() - tStart,
          ...(toolErr ? { error: toolErr } : {}),
        });

        resultBlocks.push({
          type: 'tool_result',
          tool_use_id: tu.id || `tool_${iter}`,
          content: JSON.stringify(toolResult),
        });
      }

      messages.push({ role: 'user', content: resultBlocks });
    } else {
      finalText = textBlocks.join('\n').trim();
      break;
    }
  }

  if (!finalText && toolCallsTrace.length > 0) {
    finalText = JSON.stringify(toolCallsTrace[toolCallsTrace.length - 1].result);
  }

  let parsedOutput: unknown = finalText;
  let outputParserApplied = false;
  let outputParserValid = true;
  if (outputParser) {
    outputParserApplied = true;
    const pCfg = outputParser.data.config as StructuredOutputParserConfig | AutofixOutputParserConfig;
    const check = validateJsonAgainstSchema(finalText, pCfg.schemaJson || '{}');
    outputParserValid = check.valid;
    if (!check.valid) {
      throw new Error(`Output Parser validation failed: ${check.error}`);
    }
    parsedOutput = check.parsed;
  }

  return { finalText, parsedOutput, iterations, toolCallsTrace, outputParserApplied, outputParserValid };
}

export async function executeAiAgentNode(params: {
  db: Database.Database;
  userId: string;
  workflowId: string;
  agentNode: CroxFlowNode;
  allNodes: WorkflowNode[];
  allEdges: WorkflowEdge[];
  context: Record<string, unknown>;
  secretsCollector: string[];
  subworkflowDepth: number;
  runSubworkflowFn: (targetWorkflowId: string, payload: unknown, nextDepth: number) => Promise<unknown>;
}): Promise<{ output: unknown; simulated: boolean }> {
  const {
    db,
    userId,
    workflowId,
    agentNode,
    allNodes,
    allEdges,
    context,
    secretsCollector,
    subworkflowDepth,
    runSubworkflowFn,
  } = params;

  const cfg = agentNode.data.config as AiAgentConfig;
  const userPrompt = interpolateTemplate(cfg.prompt || '', context).trim();
  const sysMessage = interpolateTemplate(cfg.systemMessage || '', context).trim();

  if (!userPrompt) {
    throw new Error('AI Agent prompt cannot be empty.');
  }

  const attachments = resolveAgentAttachments(agentNode.id, allNodes, allEdges);
  if (!attachments.chatModel) {
    throw new Error(
      `AI Agent "${agentNode.data.label}" requires a connected Chat Model sub-node (Gemini, Anthropic, or OpenAI-compatible).`
    );
  }

  // Load memory if attached
  let memoryMessages: StoredMemoryMessage[] = [];
  let memorySessionKey: string | undefined;
  let memoryConversationId = 'default';
  let memoryMax = 10;

  if (attachments.memory) {
    if (attachments.memory.data.nodeType === 'simple_memory') {
      const mc = attachments.memory.data.config as SimpleMemoryConfig;
      memorySessionKey = mc.sessionKey || `agent_${workflowId}`;
      memoryConversationId =
        interpolateTemplate(mc.conversationIdExpression || 'default', context).trim() || 'default';
      memoryMax = Math.min(Math.max(Number(mc.maxMessages) || 12, 1), 100);
    } else if (attachments.memory.data.nodeType === 'conversation_memory') {
      const cc = attachments.memory.data.config as ConversationMemoryConfig;
      memorySessionKey = cc.sessionKey || `conv_${workflowId}`;
      memoryConversationId =
        interpolateTemplate(cc.conversationIdExpression || 'default', context).trim() || 'default';
      memoryMax = Math.min(Math.max(Number(cc.contextWindowMessages) || 20, 1), 100);
      if (cc.resetOnTrigger) {
        clearAiMemorySession(db, userId, memorySessionKey, memoryConversationId);
      }
    } else {
      const wc = attachments.memory.data.config as WindowedMemoryConfig;
      memorySessionKey = wc.sessionKey || `agent_${workflowId}`;
      memoryConversationId =
        interpolateTemplate(wc.conversationIdExpression || 'default', context).trim() || 'default';
      memoryMax = Math.min(Math.max(Number(wc.windowSize) || 6, 1), 50);
    }
    memoryMessages = loadAiMemory(db, userId, memorySessionKey, memoryConversationId, memoryMax);
  }

  const preparedTools = buildPreparedTools(
    db,
    userId,
    attachments.tools,
    context,
    secretsCollector,
    subworkflowDepth,
    runSubworkflowFn
  );
  const toolMap = new Map(preparedTools.map((t) => [t.toolName, t]));

  const maxIterations = Math.min(Math.max(Number(cfg.maxIterations) || 5, 1), 10);
  const chatModelNode = attachments.chatModel;
  const requiredCaps: Array<'text' | 'toolCalling' | 'structuredOutput'> = ['text'];
  if (preparedTools.length > 0) requiredCaps.push('toolCalling');
  if (attachments.outputParser) requiredCaps.push('structuredOutput');

  if (chatModelNode.data.nodeType === 'gemini_chat_model') {
    const modelCfg = chatModelNode.data.config as GeminiChatModelConfig;
    const modelName = modelCfg.model || 'gemini-3.8-flash';
    const temp = typeof modelCfg.temperature === 'number' ? modelCfg.temperature : 0.3;

    if (modelCfg.credentialId) {
      const credSecret = getCredentialSecret(db, userId, modelCfg.credentialId, secretsCollector);
      if (!credSecret?.trim()) {
        throw new Error('Selected Gemini credential secret is empty.');
      }
      const res = await runGeminiAgentLoop({
        apiKey: credSecret.trim(),
        modelName,
        temperature: temp,
        maxOutputTokens: modelCfg.maxOutputTokens ? Number(modelCfg.maxOutputTokens) : undefined,
        sysMessage,
        userPrompt,
        memoryMessages,
        preparedTools,
        toolMap,
        outputParser: attachments.outputParser,
        maxIterations,
      });
      if (memorySessionKey) {
        saveAiMemory(
          db,
          userId,
          workflowId,
          memorySessionKey,
          memoryConversationId,
          [
            ...memoryMessages,
            { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
            { role: 'assistant', content: res.finalText, timestamp: new Date().toISOString() },
          ],
          memoryMax
        );
      }
      const trace: AiAgentExecutionTrace = {
        provider: 'gemini',
        model: modelName,
        iterations: res.iterations,
        memorySessionKey,
        loadedMessagesCount: memoryMessages.length,
        toolCalls: res.toolCallsTrace,
        outputParserApplied: res.outputParserApplied,
        outputParserValid: res.outputParserValid,
      };
      return {
        simulated: false,
        output: { model: modelName, text: res.finalText, data: res.parsedOutput, trace },
      };
    }

    const primaryProviderId: AiProviderId = 'gemini';
    const keyProbe = resolveProviderApiKey(db, userId, primaryProviderId, modelCfg.providerKeyId);
    if (!keyProbe.apiKey && primaryProviderId === 'gemini') {
      const simText = attachments.outputParser
        ? JSON.stringify({
            simulated: true,
            summary: `Simulated AI Agent output for: ${userPrompt.slice(0, 120)}`,
          })
        : `Simulated AI Agent response — configure GEMINI_API_KEY, add a key in AI Providers, or attach a credential for live multi-turn reasoning. Prompt received (${userPrompt.length} chars).`;

      if (memorySessionKey) {
        saveAiMemory(
          db,
          userId,
          workflowId,
          memorySessionKey,
          memoryConversationId,
          [
            ...memoryMessages,
            { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
            { role: 'assistant', content: simText, timestamp: new Date().toISOString() },
          ],
          memoryMax
        );
      }

      return {
        simulated: true,
        output: {
          simulated: true,
          notice: 'No GEMINI_API_KEY or AI Provider key configured.',
          text: simText,
          data: simText,
          trace: {
            provider: 'simulated',
            model: modelName,
            iterations: 1,
            memorySessionKey,
            loadedMessagesCount: memoryMessages.length,
            toolCalls: [],
          } satisfies AiAgentExecutionTrace,
        },
      };
    }

    const failoverRes = await executeWithProviderFailover({
      db,
      userId,
      primaryProviderId,
      preferredKeyId: modelCfg.providerKeyId || undefined,
      requiredCapabilities: requiredCaps,
      runner: async (providerCfg, resolvedKey) => {
        if (resolvedKey) secretsCollector.push(resolvedKey);
        const chosenModel = providerCfg.providerId === primaryProviderId ? modelName : providerCfg.defaultModel;
        if (providerCfg.protocol === 'gemini') {
          if (!resolvedKey) throw new Error('Gemini API key missing.');
          return runGeminiAgentLoop({
            apiKey: resolvedKey,
            modelName: chosenModel,
            temperature: temp,
            maxOutputTokens: modelCfg.maxOutputTokens ? Number(modelCfg.maxOutputTokens) : undefined,
            sysMessage,
            userPrompt,
            memoryMessages,
            preparedTools,
            toolMap,
            outputParser: attachments.outputParser,
            maxIterations,
          });
        }
        if (providerCfg.protocol === 'anthropic') {
          if (!resolvedKey) throw new Error('Anthropic API key missing.');
          return runAnthropicAgentLoop({
            baseUrl: providerCfg.baseUrl,
            apiKey: resolvedKey,
            modelName: chosenModel,
            temperature: temp,
            maxTokens: modelCfg.maxOutputTokens ? Number(modelCfg.maxOutputTokens) : 2048,
            sysMessage,
            userPrompt,
            memoryMessages,
            preparedTools,
            toolMap,
            outputParser: attachments.outputParser,
            maxIterations,
          });
        }
        return runOpenAiAgentLoop({
          providerId: providerCfg.providerId,
          baseUrl: providerCfg.baseUrl,
          apiKey: resolvedKey,
          modelName: chosenModel,
          temperature: temp,
          maxTokens: modelCfg.maxOutputTokens ? Number(modelCfg.maxOutputTokens) : 2048,
          sysMessage,
          userPrompt,
          memoryMessages,
          preparedTools,
          toolMap,
          outputParser: attachments.outputParser,
          maxIterations,
        });
      },
    });

    const loopOut = failoverRes.result;
    if (memorySessionKey) {
      saveAiMemory(
        db,
        userId,
        workflowId,
        memorySessionKey,
        memoryConversationId,
        [
          ...memoryMessages,
          { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
          { role: 'assistant', content: loopOut.finalText, timestamp: new Date().toISOString() },
        ],
        memoryMax
      );
    }

    const trace: AiAgentExecutionTrace = {
      provider: failoverRes.usedProviderId,
      model: modelName,
      iterations: loopOut.iterations,
      memorySessionKey,
      loadedMessagesCount: memoryMessages.length,
      toolCalls: loopOut.toolCallsTrace,
      outputParserApplied: loopOut.outputParserApplied,
      outputParserValid: loopOut.outputParserValid,
    };

    return {
      simulated: false,
      output: {
        model: modelName,
        usedProvider: failoverRes.usedProviderId,
        failoverUsed: failoverRes.failoverUsed,
        text: loopOut.finalText,
        data: loopOut.parsedOutput,
        trace,
      },
    };
  }

  if (chatModelNode.data.nodeType === 'anthropic_chat_model') {
    const antCfg = chatModelNode.data.config as AnthropicChatModelConfig;
    const modelName = antCfg.model || 'claude-sonnet-5-5';
    const temp = typeof antCfg.temperature === 'number' ? antCfg.temperature : 0.2;

    if (antCfg.credentialId) {
      const apiKey = getCredentialSecret(db, userId, antCfg.credentialId, secretsCollector);
      if (!apiKey) throw new Error('Anthropic credential secret is empty.');
      const loopOut = await runAnthropicAgentLoop({
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey,
        modelName,
        temperature: temp,
        maxTokens: antCfg.maxTokens ? Number(antCfg.maxTokens) : 2048,
        sysMessage,
        userPrompt,
        memoryMessages,
        preparedTools,
        toolMap,
        outputParser: attachments.outputParser,
        maxIterations,
      });
      if (memorySessionKey) {
        saveAiMemory(
          db,
          userId,
          workflowId,
          memorySessionKey,
          memoryConversationId,
          [
            ...memoryMessages,
            { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
            { role: 'assistant', content: loopOut.finalText, timestamp: new Date().toISOString() },
          ],
          memoryMax
        );
      }
      return {
        simulated: false,
        output: {
          model: modelName,
          text: loopOut.finalText,
          data: loopOut.parsedOutput,
          trace: {
            provider: 'anthropic',
            model: modelName,
            iterations: loopOut.iterations,
            memorySessionKey,
            loadedMessagesCount: memoryMessages.length,
            toolCalls: loopOut.toolCallsTrace,
            outputParserApplied: loopOut.outputParserApplied,
            outputParserValid: loopOut.outputParserValid,
          } satisfies AiAgentExecutionTrace,
        },
      };
    }

    const failoverRes = await executeWithProviderFailover({
      db,
      userId,
      primaryProviderId: 'anthropic',
      preferredKeyId: antCfg.providerKeyId || undefined,
      requiredCapabilities: requiredCaps,
      runner: async (providerCfg, resolvedKey) => {
        if (resolvedKey) secretsCollector.push(resolvedKey);
        if (providerCfg.requiresKey && !resolvedKey) {
          throw new ProviderExecutionError(
            `${providerCfg.displayName} requires an enabled API key in AI Providers.`,
            'auth_error',
            providerCfg.providerId
          );
        }
        const chosenModel = providerCfg.providerId === 'anthropic' ? modelName : providerCfg.defaultModel;
        if (providerCfg.protocol === 'anthropic') {
          return runAnthropicAgentLoop({
            baseUrl: providerCfg.baseUrl,
            apiKey: resolvedKey!,
            modelName: chosenModel,
            temperature: temp,
            maxTokens: antCfg.maxTokens ? Number(antCfg.maxTokens) : 2048,
            sysMessage,
            userPrompt,
            memoryMessages,
            preparedTools,
            toolMap,
            outputParser: attachments.outputParser,
            maxIterations,
          });
        }
        if (providerCfg.protocol === 'gemini') {
          return runGeminiAgentLoop({
            apiKey: resolvedKey!,
            modelName: chosenModel,
            temperature: temp,
            maxOutputTokens: antCfg.maxTokens ? Number(antCfg.maxTokens) : 2048,
            sysMessage,
            userPrompt,
            memoryMessages,
            preparedTools,
            toolMap,
            outputParser: attachments.outputParser,
            maxIterations,
          });
        }
        return runOpenAiAgentLoop({
          providerId: providerCfg.providerId,
          baseUrl: providerCfg.baseUrl,
          apiKey: resolvedKey,
          modelName: chosenModel,
          temperature: temp,
          maxTokens: antCfg.maxTokens ? Number(antCfg.maxTokens) : 2048,
          sysMessage,
          userPrompt,
          memoryMessages,
          preparedTools,
          toolMap,
          outputParser: attachments.outputParser,
          maxIterations,
        });
      },
    });

    const loopOut = failoverRes.result;
    if (memorySessionKey) {
      saveAiMemory(
        db,
        userId,
        workflowId,
        memorySessionKey,
        memoryConversationId,
        [
          ...memoryMessages,
          { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
          { role: 'assistant', content: loopOut.finalText, timestamp: new Date().toISOString() },
        ],
        memoryMax
      );
    }
    return {
      simulated: false,
      output: {
        model: modelName,
        usedProvider: failoverRes.usedProviderId,
        failoverUsed: failoverRes.failoverUsed,
        text: loopOut.finalText,
        data: loopOut.parsedOutput,
        trace: {
          provider: failoverRes.usedProviderId,
          model: modelName,
          iterations: loopOut.iterations,
          memorySessionKey,
          loadedMessagesCount: memoryMessages.length,
          toolCalls: loopOut.toolCallsTrace,
          outputParserApplied: loopOut.outputParserApplied,
          outputParserValid: loopOut.outputParserValid,
        } satisfies AiAgentExecutionTrace,
      },
    };
  }

  // OpenAI-Compatible Chat Model Execution (Credential override OR AI Provider Vault + Failover)
  const openAiCfg = chatModelNode.data.config as OpenAiChatModelConfig;
  const modelName = openAiCfg.model || 'gpt-4o-mini';
  const temp = typeof openAiCfg.temperature === 'number' ? openAiCfg.temperature : 0.3;

  if (openAiCfg.credentialId) {
    const apiKey = getCredentialSecret(db, userId, openAiCfg.credentialId, secretsCollector);
    if (!apiKey) {
      throw new Error('OpenAI-compatible credential secret is empty.');
    }
    const loopOut = await runOpenAiAgentLoop({
      providerId: openAiCfg.providerId || 'openai_compatible',
      baseUrl: openAiCfg.baseUrl || 'https://api.openai.com/v1',
      apiKey,
      modelName,
      temperature: temp,
      maxTokens: openAiCfg.maxTokens ? Number(openAiCfg.maxTokens) : undefined,
      sysMessage,
      userPrompt,
      memoryMessages,
      preparedTools,
      toolMap,
      outputParser: attachments.outputParser,
      maxIterations,
    });
    if (memorySessionKey) {
      saveAiMemory(
        db,
        userId,
        workflowId,
        memorySessionKey,
        memoryConversationId,
        [
          ...memoryMessages,
          { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
          { role: 'assistant', content: loopOut.finalText, timestamp: new Date().toISOString() },
        ],
        memoryMax
      );
    }
    return {
      simulated: false,
      output: {
        model: modelName,
        text: loopOut.finalText,
        data: loopOut.parsedOutput,
        trace: {
          provider: 'openai_compatible',
          model: modelName,
          iterations: loopOut.iterations,
          memorySessionKey,
          loadedMessagesCount: memoryMessages.length,
          toolCalls: loopOut.toolCallsTrace,
          outputParserApplied: loopOut.outputParserApplied,
          outputParserValid: loopOut.outputParserValid,
        } satisfies AiAgentExecutionTrace,
      },
    };
  }

  const primaryProviderId: AiProviderId = openAiCfg.providerId || 'openai';
  const failoverRes = await executeWithProviderFailover({
    db,
    userId,
    primaryProviderId,
    preferredKeyId: openAiCfg.providerKeyId || undefined,
    requiredCapabilities: requiredCaps,
    runner: async (providerCfg, resolvedKey) => {
      if (resolvedKey) secretsCollector.push(resolvedKey);
      if (providerCfg.requiresKey && !resolvedKey) {
        throw new ProviderExecutionError(
          `${providerCfg.displayName} requires an enabled API key in AI Providers or a linked credential.`,
          'auth_error',
          providerCfg.providerId
        );
      }
      const chosenModel = providerCfg.providerId === primaryProviderId ? modelName : providerCfg.defaultModel;
      const chosenBase =
        providerCfg.providerId === primaryProviderId && openAiCfg.baseUrl
          ? openAiCfg.baseUrl
          : providerCfg.baseUrl;

      if (providerCfg.protocol === 'gemini') {
        return runGeminiAgentLoop({
          apiKey: resolvedKey!,
          modelName: chosenModel,
          temperature: temp,
          maxOutputTokens: openAiCfg.maxTokens ? Number(openAiCfg.maxTokens) : 2048,
          sysMessage,
          userPrompt,
          memoryMessages,
          preparedTools,
          toolMap,
          outputParser: attachments.outputParser,
          maxIterations,
        });
      }
      if (providerCfg.protocol === 'anthropic') {
        return runAnthropicAgentLoop({
          baseUrl: chosenBase,
          apiKey: resolvedKey!,
          modelName: chosenModel,
          temperature: temp,
          maxTokens: openAiCfg.maxTokens ? Number(openAiCfg.maxTokens) : 2048,
          sysMessage,
          userPrompt,
          memoryMessages,
          preparedTools,
          toolMap,
          outputParser: attachments.outputParser,
          maxIterations,
        });
      }
      return runOpenAiAgentLoop({
        providerId: providerCfg.providerId,
        baseUrl: chosenBase,
        apiKey: resolvedKey,
        modelName: chosenModel,
        temperature: temp,
        maxTokens: openAiCfg.maxTokens ? Number(openAiCfg.maxTokens) : 2048,
        sysMessage,
        userPrompt,
        memoryMessages,
        preparedTools,
        toolMap,
        outputParser: attachments.outputParser,
        maxIterations,
      });
    },
  });

  const loopOut = failoverRes.result;
  if (memorySessionKey) {
    saveAiMemory(
      db,
      userId,
      workflowId,
      memorySessionKey,
      memoryConversationId,
      [
        ...memoryMessages,
        { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
        { role: 'assistant', content: loopOut.finalText, timestamp: new Date().toISOString() },
      ],
      memoryMax
    );
  }

  return {
    simulated: false,
    output: {
      model: modelName,
      usedProvider: failoverRes.usedProviderId,
      failoverUsed: failoverRes.failoverUsed,
      text: loopOut.finalText,
      data: loopOut.parsedOutput,
      trace: {
        provider: failoverRes.usedProviderId,
        model: modelName,
        iterations: loopOut.iterations,
        memorySessionKey,
        loadedMessagesCount: memoryMessages.length,
        toolCalls: loopOut.toolCallsTrace,
        outputParserApplied: loopOut.outputParserApplied,
        outputParserValid: loopOut.outputParserValid,
      } satisfies AiAgentExecutionTrace,
    },
  };
}

export async function executeAgentOrchestrator(params: {
  db: Database.Database;
  userId: string;
  workflowId: string;
  orchestratorNode: CroxFlowNode;
  allNodes: WorkflowNode[];
  allEdges: WorkflowEdge[];
  context: Record<string, unknown>;
  secretsCollector: string[];
  subworkflowDepth: number;
  runSubworkflowFn: (targetWorkflowId: string, payload: unknown, nextDepth: number) => Promise<unknown>;
}): Promise<{ output: unknown; simulated: boolean }> {
  const {
    db,
    userId,
    workflowId,
    orchestratorNode,
    allNodes,
    allEdges,
    context,
    secretsCollector,
    subworkflowDepth,
    runSubworkflowFn,
  } = params;

  const cfg = orchestratorNode.data.config as AgentOrchestratorConfig;
  const userPrompt = interpolateTemplate(cfg.goal || '', context).trim();
  const sysMessage = interpolateTemplate(cfg.synthesizerPrompt || '', context).trim();
  if (!userPrompt) {
    throw new Error('Agent Orchestrator goal cannot be empty.');
  }

  const targetIds = Array.isArray(cfg.agentWorkflowIds)
    ? cfg.agentWorkflowIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const mode = cfg.coordinationMode === 'parallel' ? 'parallel' : 'sequential';

  const subAgentResults: Array<{
    workflowId: string;
    status: 'success' | 'failed';
    output?: unknown;
    error?: string;
  }> = [];

  if (mode === 'parallel' && targetIds.length > 0) {
    const settled = await Promise.allSettled(
      targetIds.map((wfId) =>
        runSubworkflowFn(wfId, { prompt: userPrompt, input: context.prev ?? {} }, subworkflowDepth + 1)
      )
    );
    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        subAgentResults.push({ workflowId: targetIds[idx], status: 'success', output: res.value });
      } else {
        subAgentResults.push({
          workflowId: targetIds[idx],
          status: 'failed',
          error: res.reason instanceof Error ? res.reason.message : String(res.reason),
        });
      }
    });
  } else {
    let runningPayload: unknown = context.prev ?? {};
    for (const wfId of targetIds) {
      try {
        const res = await runSubworkflowFn(
          wfId,
          { prompt: userPrompt, previousAgentOutput: runningPayload },
          subworkflowDepth + 1
        );
        subAgentResults.push({ workflowId: wfId, status: 'success', output: res });
        runningPayload = res;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        subAgentResults.push({ workflowId: wfId, status: 'failed', error: errMsg });
        throw new Error(`Orchestrated sub-agent "${wfId}" failed: ${errMsg}`);
      }
    }
  }

  const failedParallel = subAgentResults.filter((r) => r.status === 'failed');
  if (failedParallel.length > 0 && failedParallel.length === subAgentResults.length) {
    throw new Error(
      `All orchestrated sub-agents failed: ${failedParallel.map((f) => f.error).join('; ')}`
    );
  }

  const attachments = resolveAgentAttachments(orchestratorNode.id, allNodes, allEdges);
  const synthesisPrompt =
    subAgentResults.length > 0
      ? `Original objective:\n${userPrompt}\n\nSub-agent execution results (${mode}):\n${JSON.stringify(
          subAgentResults,
          null,
          2
        )}\n\nSynthesize these outputs clearly and accurately.`
      : userPrompt;

  if (attachments.chatModel) {
    const synthNode: CroxFlowNode = {
      ...orchestratorNode,
      data: {
        ...orchestratorNode.data,
        nodeType: 'ai_agent',
        config: {
          prompt: synthesisPrompt,
          systemMessage:
            sysMessage ||
            'You are a Multi-Agent Orchestrator. Combine all sub-agent findings into one clear, accurate response.',
          maxIterations: cfg.maxRounds || 5,
          temperature: 0.2,
        } satisfies AiAgentConfig,
      },
    };
    const agentRes = await executeAiAgentNode({
      db,
      userId,
      workflowId,
      agentNode: synthNode,
      allNodes: allNodes.map((n) => (n.id === orchestratorNode.id ? synthNode : n)),
      allEdges,
      context: { ...context, prev: { subAgentResults } },
      secretsCollector,
      subworkflowDepth,
      runSubworkflowFn,
    });

    const baseOut =
      agentRes.output && typeof agentRes.output === 'object'
        ? (agentRes.output as Record<string, unknown>)
        : { text: String(agentRes.output ?? '') };

    return {
      simulated: agentRes.simulated,
      output: {
        ...baseOut,
        coordinationMode: mode,
        subAgentCount: subAgentResults.length,
        subAgentResults,
      },
    };
  }

  return {
    simulated: false,
    output: {
      coordinationMode: mode,
      subAgentCount: subAgentResults.length,
      subAgentResults,
      text: `Orchestrated ${subAgentResults.length} sub-agent workflow(s) in ${mode} mode.`,
      data: subAgentResults,
    },
  };
}

export async function testChatModelConnection(params: {
  db: Database.Database;
  userId: string;
  node: CroxFlowNode;
}): Promise<{ ok: boolean; provider: string; model: string; reply: string; simulated: boolean }> {
  const { db, userId, node } = params;
  const secretsCollector: string[] = [];

  if (node.data.nodeType === 'gemini_chat_model') {
    const cfg = node.data.config as GeminiChatModelConfig;
    let apiKey: string | null = null;
    if (cfg.credentialId) {
      apiKey = getCredentialSecret(db, userId, cfg.credentialId, secretsCollector);
    } else {
      apiKey = resolveProviderApiKey(db, userId, 'gemini', cfg.providerKeyId).apiKey;
    }
    const modelName = cfg.model || 'gemini-3.8-flash';
    if (!apiKey) {
      return {
        ok: false,
        provider: 'gemini',
        model: modelName,
        reply: 'No GEMINI_API_KEY configured on server, in AI Providers, or via linked credential.',
        simulated: true,
      };
    }
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const res = await ai.models.generateContent({
      model: modelName,
      contents: 'Reply with exact word: CONNECTED',
    });
    return {
      ok: true,
      provider: 'gemini',
      model: modelName,
      reply: (res.text || 'CONNECTED').trim().slice(0, 120),
      simulated: false,
    };
  }

  if (node.data.nodeType === 'anthropic_chat_model') {
    const cfg = node.data.config as AnthropicChatModelConfig;
    let apiKey: string | null = null;
    if (cfg.credentialId) {
      apiKey = getCredentialSecret(db, userId, cfg.credentialId, secretsCollector);
    } else {
      apiKey = resolveProviderApiKey(db, userId, 'anthropic', cfg.providerKeyId).apiKey;
    }
    if (!apiKey) {
      throw new Error('Add an Anthropic API key in AI Providers or link an API Key credential first.');
    }
    const baseUrl = (getProviderDefinition('anthropic')?.defaultBaseUrl || 'https://api.anthropic.com/v1').replace(
      /\/+$/,
      ''
    );
    await assertSafeExternalUrl(baseUrl);
    const modelName = cfg.model || 'claude-sonnet-5-5';
    const res = await safeFetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with CONNECTED' }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic test failed (${res.status}): ${text.slice(0, 180)}`);
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return {
      ok: true,
      provider: 'anthropic',
      model: modelName,
      reply: (data.content?.[0]?.text || 'CONNECTED').trim().slice(0, 120),
      simulated: false,
    };
  }

  if (node.data.nodeType === 'openai_chat_model') {
    const cfg = node.data.config as OpenAiChatModelConfig;
    const targetProvider: AiProviderId = cfg.providerId || 'openai';
    let apiKey: string | null = null;
    if (cfg.credentialId) {
      apiKey = getCredentialSecret(db, userId, cfg.credentialId, secretsCollector);
    } else {
      apiKey = resolveProviderApiKey(db, userId, targetProvider, cfg.providerKeyId).apiKey;
    }
    const def = getProviderDefinition(targetProvider);
    if ((def?.requiresKey ?? true) && !apiKey) {
      throw new Error('Add an API key in AI Providers or select an API Key credential first.');
    }
    const baseUrl = (cfg.baseUrl || def?.defaultBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    await assertSafeExternalUrl(baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await safeFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model || def?.defaultModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Reply with CONNECTED' }],
        max_tokens: 16,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Connection test failed (${res.status}): ${text.slice(0, 180)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      ok: true,
      provider: targetProvider,
      model: cfg.model || def?.defaultModel || 'gpt-4o-mini',
      reply: (data.choices?.[0]?.message?.content || 'CONNECTED').trim().slice(0, 120),
      simulated: false,
    };
  }

  throw new Error('Connection test is only available for Chat Model nodes.');
}
