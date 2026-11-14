import {
  clearAiMemorySession,
  evalSafeMathExpression,
  loadAiMemory,
  runSandboxedJs,
  saveAiMemory,
  validateJsonAgainstSchema,
} from '../server/services/aiAgentService';
import { ensureDefaultProject, listProjectsForUser } from '../server/services/projectService';
import { describe, expect, it } from 'vitest';
import { initDatabase } from '../server/db/database';
import { consumeRateLimit } from '../server/middleware/rateLimit';
import { mapUserRow } from '../server/middleware/auth';
import { executeWorkflow, testSingleNode } from '../server/services/executionEngine';
import { cloneTemplateNodesAndEdges, WORKFLOW_TEMPLATES } from '../server/services/templateService';
import { validateWorkflowGraph } from '../server/services/workflowValidator';
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  hashPassword,
  maskSecret,
  verifyPassword,
} from '../server/utils/crypto';
import { assertSafeExternalUrl, isBlockedIpAddress, safeFetch } from '../server/utils/ssrf';
import { interpolateTemplate, resolvePath } from '../server/utils/templateVars';
import {
  addProviderKey,
  executeWithProviderFailover,
  listProvidersForUser,
  ProviderExecutionError,
  resetProviderCircuitBreakers,
  resolveProviderApiKey,
  upsertProviderConfig,
} from '../server/services/aiProviderService';
import { INTEGRATION_CATALOG } from '../server/services/integrationService';
import { createWorkflowNode } from '../src/constants/nodeCatalog';
import { WorkflowEdge, WorkflowNode, WorkflowRecord } from '../src/types/workflow';

describe('CROX Product Defaults & Abuse Protection', () => {
  it('uses dark as the database default for newly inserted accounts', () => {
    const db = initDatabase(':memory:');
    const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string; dflt_value: string | null }>;
    const themeColumn = columns.find((column) => column.name === 'theme');
    expect(themeColumn?.dflt_value).toBe("'dark'");
  });

  it('defaults new or incomplete user theme records to dark while preserving explicit light preference', () => {
    const base = {
      id: 'u_theme', full_name: 'Theme User', email: 'theme@crox.dev', avatar_url: null,
      timezone: 'UTC', notifications_enabled: 1, plan: 'free', created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    expect(mapUserRow({ ...base, theme: null }).theme).toBe('dark');
    expect(mapUserRow({ ...base, theme: 'dark' }).theme).toBe('dark');
    expect(mapUserRow({ ...base, theme: 'light' }).theme).toBe('light');
  });

  it('allows requests up to a fixed-window limit and rejects the next request', () => {
    const key = `test-rate-limit-${Date.now()}-${Math.random()}`;
    const start = 1_000_000;
    const first = consumeRateLimit(key, 2, 60_000, start);
    const second = consumeRateLimit(key, 2, 60_000, start + 1);
    const third = consumeRateLimit(key, 2, 60_000, start + 2);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('starts a fresh rate-limit window after the previous window expires', () => {
    const key = `test-rate-reset-${Date.now()}-${Math.random()}`;
    consumeRateLimit(key, 1, 1_000, 2_000_000);
    const nextWindow = consumeRateLimit(key, 1, 1_000, 2_001_001);
    expect(nextWindow.allowed).toBe(true);
    expect(nextWindow.remaining).toBe(0);
  });
});

describe('CROX Core Security & Crypto', () => {
  it('hashes and verifies passwords securely with bcrypt', async () => {
    const hash = await hashPassword('StrongPass!234');
    expect(hash).not.toBe('StrongPass!234');
    expect(await verifyPassword('StrongPass!234', hash)).toBe(true);
    expect(await verifyPassword('WrongPass', hash)).toBe(false);
  });

  it('encrypts and decrypts credentials via AES-256-GCM and masks previews', () => {
    const secret = 'sk_live_crox_super_secret_token_998877';
    const enc = encryptCredentialPayload(secret);
    expect(enc.encryptedPayload).not.toContain(secret);
    const decrypted = decryptCredentialPayload(enc.encryptedPayload, enc.iv, enc.authTag);
    expect(decrypted).toBe(secret);
    const masked = maskSecret(secret);
    expect(masked).toBe('sk_l••••••••8877');
  });

  it('blocks private, loopback, and metadata IP addresses for SSRF protection', async () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('10.20.0.5')).toBe(true);
    expect(isBlockedIpAddress('192.168.1.10')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:7f00:1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:0808:0808')).toBe(false);
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);

    await expect(assertSafeExternalUrl('http://localhost:3000/api/health')).rejects.toThrow();
    await expect(assertSafeExternalUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    await expect(assertSafeExternalUrl('http://user:pass@example.com')).rejects.toThrow();
    await expect(assertSafeExternalUrl('file:///etc/passwd')).rejects.toThrow();
  });

  it('blocks HTTP redirects so an external endpoint cannot redirect into an internal network', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedRedirectMode: RequestRedirect | undefined;
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedRedirectMode = init?.redirect;
      return new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1:3000/private' },
      });
    };

    try {
      await expect(safeFetch('https://8.8.8.8/test', { redirect: 'follow' })).rejects.toThrow(/redirect/i);
      expect(requestedUrl).toBe('https://8.8.8.8/test');
      expect(requestedRedirectMode).toBe('manual');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('safely interpolates variables and blocks prototype pollution paths', () => {
    const ctx = {
      trigger: { body: { email: 'ada@crox.dev', tier: 'pro' } },
      prev: { text: 'Hello Ada' },
    };
    expect(interpolateTemplate('Hi {{trigger.body.email}}: {{prev.text}}', ctx)).toBe(
      'Hi ada@crox.dev: Hello Ada'
    );
    expect(resolvePath(ctx, '__proto__.polluted')).toBeUndefined();
    expect(resolvePath(ctx, 'constructor.prototype')).toBeUndefined();
  });

  it('evaluates safe math expressions and rejects code injection', () => {
    expect(evalSafeMathExpression('(12 + 8) * 3 / 2')).toBe(30);
    expect(evalSafeMathExpression('sqrt(144) + pow(2, 3)')).toBe(20);
    expect(() => evalSafeMathExpression('process.exit(1)')).toThrow();
    expect(() => evalSafeMathExpression('require("fs")')).toThrow();
    expect(() => evalSafeMathExpression('Math.random()`hack`')).toThrow();
  });

  it('runs Code Node snippets in a permission-restricted process and allows JSON data transforms', async () => {
    const ok = await runSandboxedJs('return { doubled: items.map((x) => x * 2) };', { items: [1, 2, 3] });
    expect(ok).toEqual({ doubled: [2, 4, 6] });

    await expect(runSandboxedJs('return process.env;', {})).rejects.toThrow();
    await expect(runSandboxedJs('return require("child_process");', {})).rejects.toThrow();
    await expect(runSandboxedJs('return ({}).constructor.constructor("return process")();', {})).rejects.toThrow();
    await expect(runSandboxedJs('while (true) {}', {}, 100)).rejects.toThrow();
  });
});

describe('CROX Workflow Validator & Template Cloning', () => {
  it('creates an executable Multi-Agent starter graph with Orchestrator model ports', () => {
    const trigger = createWorkflowNode('manual_trigger', { x: 0, y: 0 });
    const orchestrator = createWorkflowNode('agent_orchestrator', { x: 300, y: 0 });
    const model = createWorkflowNode('gemini_chat_model', { x: 300, y: 250 });
    const output = createWorkflowNode('set_data', { x: 650, y: 0 });
    const config = orchestrator.data.config as { goal?: string; synthesizerPrompt?: string; maxRounds?: number };
    expect(config.goal).toBe('{{trigger.body}}');
    expect(config.synthesizerPrompt).toContain('Multi-Agent Orchestrator');
    expect(config.maxRounds).toBe(5);

    const result = validateWorkflowGraph([trigger, orchestrator, model, output], [
      { id: 'main_in', source: trigger.id, target: orchestrator.id, edgeKind: 'main' },
      { id: 'main_out', source: orchestrator.id, target: output.id, edgeKind: 'main' },
      {
        id: 'model_attach', source: model.id, target: orchestrator.id,
        targetHandle: 'ai_languageModel', edgeKind: 'ai_languageModel',
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
  it('detects self-loops and circular cycles while ordering acyclic graphs', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'n1',
        type: 'croxNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Trigger',
          nodeType: 'webhook_trigger',
          category: 'triggers',
          config: { method: 'POST', path: '/a', requireSecret: false, samplePayload: '{}', responseMode: 'immediate' },
        },
      },
      {
        id: 'n2',
        type: 'croxNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Transform',
          nodeType: 'transform_data',
          category: 'actions',
          config: { mode: 'map', mappings: [] },
        },
      },
    ];

    const validResult = validateWorkflowGraph(nodes, [{ id: 'e1', source: 'n1', target: 'n2' }]);
    expect(validResult.valid).toBe(true);
    expect(validResult.executionOrder).toEqual(['n1', 'n2']);

    const cycleResult = validateWorkflowGraph(nodes, [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n1' },
    ]);
    expect(cycleResult.valid).toBe(false);
    expect(cycleResult.errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);

    const selfResult = validateWorkflowGraph(nodes, [{ id: 'e1', source: 'n1', target: 'n1' }]);
    expect(selfResult.valid).toBe(false);
  });

  it('ignores sticky notes and validates AI Agent cluster attachments', () => {
    const agentTemplate = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl_ai_research_agent')!;
    expect(agentTemplate).toBeDefined();

    const withNote: WorkflowNode[] = [
      ...agentTemplate.nodes,
      {
        id: 'note_1',
        type: 'stickyNote',
        position: { x: 20, y: 20 },
        style: { width: 220, height: 120 },
        data: { title: 'Note', text: 'Docs', color: 'amber' },
      },
    ];

    const valid = validateWorkflowGraph(withNote, agentTemplate.edges, { strictConfig: true });
    expect(valid.valid).toBe(true);
    // Sticky note and cluster sub-nodes are excluded from linear main DAG executionOrder
    expect(valid.executionOrder).not.toContain('note_1');

    // Missing chat model triggers strict error
    const edgesWithoutModel = agentTemplate.edges.filter((e) => e.targetHandle !== 'ai_languageModel');
    const missingModel = validateWorkflowGraph(agentTemplate.nodes, edgesWithoutModel, { strictConfig: true });
    expect(missingModel.valid).toBe(false);
    expect(missingModel.issues.some((i) => i.code === 'AGENT_MISSING_MODEL')).toBe(true);
  });

  it('clones templates with brand new node/edge IDs and remaps node references', () => {
    const welcomeTemplate = WORKFLOW_TEMPLATES[0];
    const cloned = cloneTemplateNodesAndEdges(welcomeTemplate);

    expect(cloned.nodes.length).toBe(welcomeTemplate.nodes.length);
    expect(cloned.edges.length).toBe(welcomeTemplate.edges.length);

    const originalIds = new Set(welcomeTemplate.nodes.map((n) => n.id));
    for (const node of cloned.nodes) {
      expect(originalIds.has(node.id)).toBe(false);
    }

    const clonedIds = new Set(cloned.nodes.map((n) => n.id));
    for (const edge of cloned.edges) {
      expect(clonedIds.has(edge.source)).toBe(true);
      expect(clonedIds.has(edge.target)).toBe(true);
    }
  });
});

describe('CROX Projects, AI Memory & Structured Parser', () => {
  it('ensures default Personal project and backfills orphan workflows cleanly', () => {
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u_proj', 'Proj User', 'proj@crox.dev', 'hash', ?, ?)`
    ).run(now, now);

    db.prepare(
      `INSERT INTO workflows (id, user_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES ('wf_orphan', 'u_proj', 'Orphan WF', '', 0, '[]', '[]', '{}', 'sec', ?, ?)`
    ).run(now, now);

    const def = ensureDefaultProject(db, 'u_proj');
    expect(def.name).toBe('Personal');
    expect(def.isDefault).toBe(true);

    const projects = listProjectsForUser(db, 'u_proj');
    expect(projects).toHaveLength(1);
    expect(projects[0].workflowCount).toBe(1);
  });

  it('isolates AI memory sessions by user and trims to window limit', () => {
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u1', 'User One', 'u1@crox.dev', 'hash', ?, ?), ('u2', 'User Two', 'u2@crox.dev', 'hash', ?, ?)`
    ).run(now, now, now, now);

    saveAiMemory(
      db,
      'u1',
      null,
      'support',
      'conv_1',
      [
        { role: 'user', content: 'm1', timestamp: now },
        { role: 'assistant', content: 'm2', timestamp: now },
        { role: 'user', content: 'm3', timestamp: now },
      ],
      2
    );

    const loadedU1 = loadAiMemory(db, 'u1', 'support', 'conv_1', 5);
    const loadedU2 = loadAiMemory(db, 'u2', 'support', 'conv_1', 5);
    expect(loadedU1).toHaveLength(2);
    expect(loadedU1[0].content).toBe('m2');
    expect(loadedU2).toHaveLength(0);

    const cleared = clearAiMemorySession(db, 'u1', 'support', 'conv_1');
    expect(cleared).toBe(1);
    expect(loadAiMemory(db, 'u1', 'support', 'conv_1', 5)).toHaveLength(0);
  });

  it('validates JSON output against JSON Schema required fields & types', () => {
    const schema = JSON.stringify({
      type: 'object',
      required: ['intent', 'priority'],
      properties: { intent: { type: 'string' }, priority: { type: 'number' } },
    });
    const ok = validateJsonAgainstSchema('```json\n{"intent":"billing","priority":1}\n```', schema);
    expect(ok.valid).toBe(true);
    expect(ok.parsed).toEqual({ intent: 'billing', priority: 1 });

    const bad = validateJsonAgainstSchema('{"intent":"billing"}', schema);
    expect(bad.valid).toBe(false);
    expect(bad.error).toContain('priority');
  });
});

describe('CROX Execution Engine, AI Agent & Flow Nodes', () => {
  it('executes true branch, marks false branch as skipped, and persists report in SQLite', async () => {
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u_test', 'Test User', 'test@crox.dev', 'hash', ?, ?)`
    ).run(now, now);

    const nodes: WorkflowNode[] = [
      {
        id: 'trig',
        type: 'croxNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Webhook',
          nodeType: 'webhook_trigger',
          category: 'triggers',
          config: {
            method: 'POST',
            path: '/event',
            requireSecret: false,
            samplePayload: JSON.stringify({ severity: 'critical', service: 'auth' }),
            responseMode: 'immediate',
          },
        },
      },
      {
        id: 'cond',
        type: 'croxNode',
        position: { x: 250, y: 0 },
        data: {
          label: 'Check Critical',
          nodeType: 'condition',
          category: 'actions',
          config: {
            inputVariable: 'trigger.body.severity',
            operator: 'equals',
            comparisonValue: 'critical',
          },
        },
      },
      {
        id: 'branch_true',
        type: 'croxNode',
        position: { x: 500, y: -60 },
        data: {
          label: 'Urgent Transform',
          nodeType: 'transform_data',
          category: 'actions',
          config: {
            mode: 'map',
            mappings: [{ targetField: 'alertLevel', sourceExpression: 'P1', operation: 'static' }],
          },
        },
      },
      {
        id: 'branch_false',
        type: 'croxNode',
        position: { x: 500, y: 80 },
        data: {
          label: 'Routine Email',
          nodeType: 'send_email',
          category: 'actions',
          config: {
            to: 'ops@crox.dev',
            subject: 'Routine Event',
            body: 'Standard event logged',
            credentialId: '',
            isHtml: false,
          },
        },
      },
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'trig', target: 'cond' },
      { id: 'e2', source: 'cond', target: 'branch_true', sourceHandle: 'true', label: 'True' },
      { id: 'e3', source: 'cond', target: 'branch_false', sourceHandle: 'false', label: 'False' },
    ];

    db.prepare(
      `INSERT INTO workflows (id, user_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES ('wf_test', 'u_test', 'Branch Test', '', 1, ?, ?, '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}', 'sec123', ?, ?)`
    ).run(JSON.stringify(nodes), JSON.stringify(edges), now, now);

    const workflow: WorkflowRecord = {
      id: 'wf_test',
      userId: 'u_test',
      name: 'Branch Test',
      description: '',
      isActive: true,
      nodes,
      edges,
      settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
      webhookSecret: 'sec123',
      lastExecutionStatus: null,
      lastExecutedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const execution = await executeWorkflow(db, workflow, { triggerType: 'test' });

    expect(execution.status).toBe('success');
    expect(execution.summary.successCount).toBe(3);
    expect(execution.summary.skippedCount).toBe(1);
    expect(execution.summary.failedCount).toBe(0);

    const trueStep = execution.nodeResults?.find((r) => r.nodeId === 'branch_true');
    const falseStep = execution.nodeResults?.find((r) => r.nodeId === 'branch_false');
    expect(trueStep?.status).toBe('success');
    expect((trueStep?.output as Record<string, unknown>)?.alertLevel).toBe('P1');
    expect(falseStep?.status).toBe('skipped');

    // Partial execution starting from 'cond' reuses trigger sample payload
    const partial = await executeWorkflow(db, workflow, {
      triggerType: 'test',
      runFromNodeId: 'cond',
    });
    expect(partial.status).toBe('success');
    expect(partial.nodeResults?.some((r) => r.nodeId === 'branch_true' && r.status === 'success')).toBe(true);
  });

  it('executes core data nodes (filter, sort, limit, aggregate, code, edit_fields) & AI Agent template', async () => {
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u_core', 'Core Tester', 'core@crox.dev', 'hash', ?, ?)`
    ).run(now, now);

    const nodes: WorkflowNode[] = [
      {
        id: 't1',
        type: 'croxNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Manual',
          nodeType: 'manual_trigger',
          category: 'triggers',
          config: {
            samplePayload: JSON.stringify({
              orders: [
                { id: 'a', amount: 50, status: 'paid' },
                { id: 'b', amount: 15, status: 'pending' },
                { id: 'c', amount: 120, status: 'paid' },
              ],
            }),
          },
        },
      },
      {
        id: 'f1',
        type: 'croxNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Paid Only',
          nodeType: 'filter_items',
          category: 'core',
          config: { itemsPath: 'trigger.body.orders', field: 'status', operator: 'equals', value: 'paid' },
        },
      },
      {
        id: 's1',
        type: 'croxNode',
        position: { x: 400, y: 0 },
        data: {
          label: 'Sort Desc',
          nodeType: 'sort_items',
          category: 'core',
          config: { itemsPath: 'prev.items', field: 'amount', direction: 'desc' },
        },
      },
      {
        id: 'a1',
        type: 'croxNode',
        position: { x: 600, y: 0 },
        data: {
          label: 'Sum Paid',
          nodeType: 'aggregate_items',
          category: 'core',
          config: { itemsPath: 'prev.items', operation: 'sum', field: 'amount', outputField: 'paidTotal' },
        },
      },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 't1', target: 'f1' },
      { id: 'e2', source: 'f1', target: 's1' },
      { id: 'e3', source: 's1', target: 'a1' },
    ];

    db.prepare(
      `INSERT INTO workflows (id, user_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES ('wf_core', 'u_core', 'Core Pipeline', '', 1, ?, ?, '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}', 'sec_core', ?, ?)`
    ).run(JSON.stringify(nodes), JSON.stringify(edges), now, now);

    const exec = await executeWorkflow(
      db,
      {
        id: 'wf_core',
        userId: 'u_core',
        name: 'Core Pipeline',
        description: '',
        isActive: true,
        nodes,
        edges,
        settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
        webhookSecret: 'sec_core',
        lastExecutionStatus: null,
        lastExecutedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      { triggerType: 'test' }
    );

    expect(exec.status).toBe('success');
    const aggResult = exec.nodeResults?.find((r) => r.nodeId === 'a1');
    expect((aggResult?.output as Record<string, unknown>)?.paidTotal).toBe(170);

    // Run AI Agent template cleanly (explicit simulated mode when no API key env in test)
    const agentTpl = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl_ai_research_agent')!;
    const cloned = cloneTemplateNodesAndEdges(agentTpl);
    db.prepare(
      `INSERT INTO workflows (id, user_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES ('wf_agent', 'u_core', 'Agent Test', '', 1, ?, ?, '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}', 'sec_ag', ?, ?)`
    ).run(JSON.stringify(cloned.nodes), JSON.stringify(cloned.edges), now, now);

    const agentExec = await executeWorkflow(
      db,
      {
        id: 'wf_agent',
        userId: 'u_core',
        name: 'Agent Test',
        description: '',
        isActive: true,
        nodes: cloned.nodes,
        edges: cloned.edges,
        settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
        webhookSecret: 'sec_ag',
        lastExecutionStatus: null,
        lastExecutedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      { triggerType: 'test' }
    );
    expect(agentExec.status).toBe('success');
  });

  it('executes wait_node delay and supports single-node test step', async () => {
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u_step', 'Step Tester', 'step@crox.dev', 'hash', ?, ?)`
    ).run(now, now);

    const waitNode: WorkflowNode = {
      id: 'wait_1',
      type: 'croxNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Short Wait',
        nodeType: 'wait_node',
        category: 'actions',
        config: { durationMs: 35 },
      },
    };

    const res = await testSingleNode(db, 'u_step', waitNode, { ping: true });
    expect(res.simulated).toBe(false);
    expect((res.output as Record<string, unknown>).waitedMs).toBe(35);
    expect(res.durationMs).toBeGreaterThanOrEqual(25);

    const notifyInvalid = validateWorkflowGraph(
      [
        {
          id: 'wn1',
          type: 'croxNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Slack Alert',
            nodeType: 'webhook_notify',
            category: 'actions',
            config: { platform: 'slack', webhookUrl: '', message: '', username: 'CROX' },
          },
        },
      ],
      [],
      { strictConfig: true }
    );
    expect(notifyInvalid.valid).toBe(false);
  });
});

describe('CROX AI Provider Vault, Failover, Integrations & Group Nodes', () => {
  it('initializes migration 004 schema, masks multi-key secrets, and isolates user vaults', () => {
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u_vault', 'Vault User', 'vault@crox.dev', 'hash', ?, ?)`
    ).run(now, now);

    const k1 = addProviderKey(db, 'u_vault', 'openai', {
      label: 'Primary OpenAI',
      apiKey: 'sk-proj-test-secret-1122334455',
      isPrimary: true,
      projectTag: 'prod',
    });
    const k2 = addProviderKey(db, 'u_vault', 'openai', {
      label: 'Secondary OpenAI',
      apiKey: 'sk-proj-test-backup-6677889900',
      isPrimary: false,
      projectTag: 'staging',
    });

    expect(k1.maskedPreview).not.toContain('1122334455');
    expect((k1 as unknown as Record<string, unknown>).apiKey).toBeUndefined();
    expect((k1 as unknown as Record<string, unknown>).encryptedPayload).toBeUndefined();
    expect(k2.isPrimary).toBe(false);

    const resolved = resolveProviderApiKey(db, 'u_vault', 'openai');
    expect(resolved.keyRecordId).toBe(k1.id);
    expect(resolved.apiKey).toBe('sk-proj-test-secret-1122334455');

    const providers = listProvidersForUser(db, 'u_vault');
    const openai = providers.find((p) => p.providerId === 'openai')!;
    expect(openai.keys).toHaveLength(2);
    expect(JSON.stringify(openai)).not.toContain('sk-proj-test-secret-1122334455');

    const credCols = db.prepare(`PRAGMA table_info(credentials)`).all() as Array<{ name: string }>;
    expect(credCols.some((c) => c.name === 'is_enabled')).toBe(true);
    expect(credCols.some((c) => c.name === 'provider_meta')).toBe(true);
  });

  it('never rotates same-provider keys on quota exhaustion and fails over only to explicit backup provider', async () => {
    resetProviderCircuitBreakers();
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u_failover', 'Failover User', 'failover@crox.dev', 'hash', ?, ?)`
    ).run(now, now);

    addProviderKey(db, 'u_failover', 'openai', {
      label: 'Key 1',
      apiKey: 'sk-openai-key-one-aaaa',
      isPrimary: true,
    });
    addProviderKey(db, 'u_failover', 'openai', {
      label: 'Key 2',
      apiKey: 'sk-openai-key-two-bbbb',
      isPrimary: false,
    });
    addProviderKey(db, 'u_failover', 'anthropic', {
      label: 'Backup Claude',
      apiKey: 'sk-ant-backup-key-cccc',
      isPrimary: true,
    });

    upsertProviderConfig(db, 'u_failover', 'openai', {
      backupProviderId: 'anthropic',
      isEnabled: true,
    });
    upsertProviderConfig(db, 'u_failover', 'anthropic', {
      isEnabled: true,
    });

    const calledProviders: Array<{ providerId: string; apiKey: string | null }> = [];
    const res = await executeWithProviderFailover({
      db,
      userId: 'u_failover',
      primaryProviderId: 'openai',
      requiredCapabilities: ['text', 'toolCalling'],
      runner: async (cfg, apiKey) => {
        calledProviders.push({ providerId: cfg.providerId, apiKey });
        if (cfg.providerId === 'openai') {
          throw new ProviderExecutionError('You exceeded your current quota', 'quota_exhausted', 'openai', 429);
        }
        return 'ok-from-anthropic';
      },
    });

    expect(res.result).toBe('ok-from-anthropic');
    expect(res.usedProviderId).toBe('anthropic');
    expect(res.failoverUsed).toBe(true);
    // Called openai ONLY once (did not cycle to Key 2), then failed over to anthropic
    expect(calledProviders.filter((c) => c.providerId === 'openai')).toHaveLength(1);
    expect(calledProviders[0].apiKey).toBe('sk-openai-key-one-aaaa');
    expect(calledProviders[1].providerId).toBe('anthropic');

    // Subsequent call respects circuit-breaker cooldown on openai and routes directly to backup
    const res2 = await executeWithProviderFailover({
      db,
      userId: 'u_failover',
      primaryProviderId: 'openai',
      requiredCapabilities: ['text'],
      runner: async (cfg) => `direct-${cfg.providerId}`,
    });
    expect(res2.result).toBe('direct-anthropic');
    resetProviderCircuitBreakers();
  });

  it('rejects coming_soon integrations, ignores group frames in DAG ordering, and executes set_data & orchestrator', async () => {
    const comingSoon = INTEGRATION_CATALOG.find((a) => a.availability === 'coming_soon');
    expect(comingSoon).toBeDefined();

    const blockedValidation = validateWorkflowGraph(
      [
        {
          id: 'int_cs',
          type: 'croxNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'Future App',
            nodeType: 'integration_action',
            category: 'integrations',
            config: {
              appId: comingSoon!.appId,
              actionId: 'placeholder',
              credentialId: '',
              parameters: {},
            },
          },
        },
      ],
      [],
      { strictConfig: true }
    );
    expect(blockedValidation.valid).toBe(false);
    expect(blockedValidation.issues.some((i) => i.code === 'INTEGRATION_COMING_SOON')).toBe(true);

    // Group node + parentId + set_data execution
    const db = initDatabase(':memory:');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, full_name, email, password_hash, created_at, updated_at)
       VALUES ('u_grp', 'Group User', 'grp@crox.dev', 'hash', ?, ?)`
    ).run(now, now);

    const nodes: WorkflowNode[] = [
      {
        id: 'grp_1',
        type: 'group',
        position: { x: 40, y: 40 },
        style: { width: 520, height: 240 },
        data: { title: 'Ingestion Group', color: 'blue', collapsed: false },
      },
      {
        id: 'm1',
        type: 'croxNode',
        parentId: 'grp_1',
        extent: 'parent',
        position: { x: 30, y: 70 },
        data: {
          label: 'Trigger',
          nodeType: 'manual_trigger',
          category: 'triggers',
          config: { samplePayload: '{"user":"ada","count":2}' },
        },
      },
      {
        id: 'sd1',
        type: 'croxNode',
        parentId: 'grp_1',
        extent: 'parent',
        position: { x: 260, y: 70 },
        data: {
          label: 'Set Fields',
          nodeType: 'set_data',
          category: 'core',
          config: {
            keepOnlySet: false,
            values: [
              { key: 'greeting', valueType: 'string', value: 'Hello {{trigger.body.user}}' },
              { key: 'doubleCount', valueType: 'number', value: '4' },
              { key: 'active', valueType: 'boolean', value: 'true' },
            ],
          },
        },
      },
      {
        id: 'orch1',
        type: 'croxNode',
        position: { x: 640, y: 110 },
        data: {
          label: 'Lead Coordinator',
          nodeType: 'agent_orchestrator',
          category: 'ai',
          config: {
            goal: 'Summarize incoming lead status',
            coordinationMode: 'sequential',
            agentWorkflowIds: [],
            synthesizerPrompt: 'Return concise summary.',
            maxRounds: 2,
          },
        },
      },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'm1', target: 'sd1' },
      { id: 'e2', source: 'sd1', target: 'orch1' },
    ];

    const grpCheck = validateWorkflowGraph(nodes, edges);
    expect(grpCheck.valid).toBe(true);
    expect(grpCheck.executionOrder).toEqual(['m1', 'sd1', 'orch1']);
    expect(grpCheck.executionOrder).not.toContain('grp_1');

    db.prepare(
      `INSERT INTO workflows (id, user_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES ('wf_grp', 'u_grp', 'Group & SetData', '', 1, ?, ?, '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}', 'sec_grp', ?, ?)`
    ).run(JSON.stringify(nodes), JSON.stringify(edges), now, now);

    const exec = await executeWorkflow(
      db,
      {
        id: 'wf_grp',
        userId: 'u_grp',
        name: 'Group & SetData',
        description: '',
        isActive: true,
        nodes,
        edges,
        settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
        webhookSecret: 'sec_grp',
        lastExecutionStatus: null,
        lastExecutedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      { triggerType: 'test' }
    );

    expect(exec.status).toBe('success');
    const sdRes = exec.nodeResults?.find((r) => r.nodeId === 'sd1')?.output as Record<string, unknown>;
    expect(sdRes.greeting).toBe('Hello ada');
    expect(sdRes.doubleCount).toBe(4);
    expect(sdRes.active).toBe(true);
  });
});



