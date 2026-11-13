import { Router, Response } from 'express';
import { getGeminiApiKey } from '../config.ts';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { clearAiMemorySession, testChatModelConnection } from '../services/aiAgentService.ts';
import { executeWorkflow, testSingleNode } from '../services/executionEngine.ts';
import { ensureDefaultProject, resolveProjectForUser } from '../services/projectService.ts';
import { previewNextRuns, syncWorkflowSchedule } from '../services/schedulerService.ts';
import { validateWorkflowGraph } from '../services/workflowValidator.ts';
import { generateRandomToken } from '../utils/crypto.ts';
import {
  CroxFlowNode,
  InsightsSummary,
  WorkflowEdge,
  WorkflowEvaluationCheck,
  WorkflowEvaluationRecord,
  WorkflowExecutionRecord,
  WorkflowNode,
  WorkflowRecord,
  WorkflowSettings,
  WorkflowVersionRecord,
} from '../../src/types/workflow.ts';

const router = Router();
router.use(requireAuth);

export function mapWorkflowRow(row: Record<string, unknown>): WorkflowRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    projectId: (row.project_id as string | null) ?? null,
    projectName: (row.project_name as string | undefined) || undefined,
    workspaceName: (row.workspace_name as string | undefined) || undefined,
    name: row.name as string,
    description: (row.description as string) || '',
    isActive: Boolean(row.is_active),
    nodes: JSON.parse((row.nodes_json as string) || '[]'),
    edges: JSON.parse((row.edges_json as string) || '[]'),
    settings: JSON.parse(
      (row.settings_json as string) || '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}'
    ),
    webhookSecret: row.webhook_secret as string,
    lastExecutionStatus: (row.last_execution_status as WorkflowRecord['lastExecutionStatus']) || null,
    lastExecutedAt: (row.last_executed_at as string | null) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function createVersionSnapshot(
  db: ReturnType<typeof getDb>,
  wf: WorkflowRecord,
  note: string
): WorkflowVersionRecord {
  const maxRow = db
    .prepare('SELECT MAX(version_number) as maxVer FROM workflow_versions WHERE workflow_id = ? AND user_id = ?')
    .get(wf.id, wf.userId) as { maxVer: number | null };

  const versionNumber = (maxRow?.maxVer || 0) + 1;
  const id = `wfv_${generateRandomToken(8)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO workflow_versions (id, workflow_id, user_id, version_number, name, description, nodes_json, edges_json, settings_json, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    wf.id,
    wf.userId,
    versionNumber,
    wf.name,
    wf.description,
    JSON.stringify(wf.nodes),
    JSON.stringify(wf.edges),
    JSON.stringify(wf.settings),
    note,
    now
  );

  return {
    id,
    workflowId: wf.id,
    userId: wf.userId,
    versionNumber,
    name: wf.name,
    description: wf.description,
    nodes: wf.nodes,
    edges: wf.edges,
    settings: wf.settings,
    note,
    createdAt: now,
  };
}

router.get('/insights', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.id;

  const wfAgg = db
    .prepare(
      `SELECT
         COUNT(*) as totalWorkflows,
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as activeWorkflows
       FROM workflows WHERE user_id = ?`
    )
    .get(userId) as { totalWorkflows: number; activeWorkflows: number | null };

  const projAgg = db
    .prepare('SELECT COUNT(*) as totalProjects FROM projects WHERE user_id = ? AND is_archived = 0')
    .get(userId) as { totalProjects: number };

  const execAgg = db
    .prepare(
      `SELECT
         COUNT(*) as totalExecutions,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulExecutions,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedExecutions,
         AVG(duration_ms) as avgDurationMs
       FROM workflow_executions WHERE user_id = ?`
    )
    .get(userId) as {
    totalExecutions: number;
    successfulExecutions: number | null;
    failedExecutions: number | null;
    avgDurationMs: number | null;
  };

  const dailyRows = db
    .prepare(
      `SELECT
         substr(started_at, 1, 10) as day,
         COUNT(*) as total,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         AVG(duration_ms) as avgDurationMs
       FROM workflow_executions
       WHERE user_id = ?
       GROUP BY substr(started_at, 1, 10)
       ORDER BY day DESC
       LIMIT 14`
    )
    .all(userId) as Array<{
    day: string;
    total: number;
    success: number | null;
    failed: number | null;
    avgDurationMs: number | null;
  }>;

  const topWorkflowRows = db
    .prepare(
      `SELECT
         e.workflow_id as workflowId,
         w.name as name,
         COUNT(*) as runs,
         SUM(CASE WHEN e.status = 'success' THEN 1 ELSE 0 END) as successCount,
         AVG(e.duration_ms) as avgDurationMs
       FROM workflow_executions e
       JOIN workflows w ON w.id = e.workflow_id
       WHERE e.user_id = ?
       GROUP BY e.workflow_id
       ORDER BY runs DESC
       LIMIT 6`
    )
    .all(userId) as Array<{
    workflowId: string;
    name: string;
    runs: number;
    successCount: number | null;
    avgDurationMs: number | null;
  }>;

  const recentFailureRows = db
    .prepare(
      `SELECT
         e.id as executionId,
         e.workflow_id as workflowId,
         w.name as workflowName,
         e.error_message as errorMessage,
         e.started_at as startedAt
       FROM workflow_executions e
       JOIN workflows w ON w.id = e.workflow_id
       WHERE e.user_id = ? AND e.status = 'failed'
       ORDER BY e.started_at DESC
       LIMIT 6`
    )
    .all(userId) as Array<{
    executionId: string;
    workflowId: string;
    workflowName: string;
    errorMessage: string | null;
    startedAt: string;
  }>;

  const totalExec = execAgg?.totalExecutions || 0;
  const successExec = execAgg?.successfulExecutions || 0;

  const insights: InsightsSummary = {
    totalWorkflows: wfAgg?.totalWorkflows || 0,
    activeWorkflows: wfAgg?.activeWorkflows || 0,
    totalProjects: projAgg?.totalProjects || 1,
    totalExecutions: totalExec,
    successfulExecutions: successExec,
    failedExecutions: execAgg?.failedExecutions || 0,
    successRate: totalExec > 0 ? Math.round((successExec / totalExec) * 1000) / 10 : 100,
    averageDurationMs: Math.round(execAgg?.avgDurationMs || 0),
    dailySeries: dailyRows
      .slice()
      .reverse()
      .map((r) => ({
        date: r.day,
        total: r.total,
        success: r.success || 0,
        failed: r.failed || 0,
        avgDurationMs: Math.round(r.avgDurationMs || 0),
      })),
    topWorkflows: topWorkflowRows.map((r) => ({
      workflowId: r.workflowId,
      name: r.name,
      runs: r.runs,
      successCount: r.successCount || 0,
      avgDurationMs: Math.round(r.avgDurationMs || 0),
    })),
    recentFailures: recentFailureRows,
  };

  res.json({ insights });
});

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.id;
  ensureDefaultProject(db, userId);

  const projectIdFilter = req.query.projectId ? String(req.query.projectId).trim() : '';

  const rows = projectIdFilter
    ? (db
        .prepare(
          `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
           FROM workflows w
           LEFT JOIN projects p ON p.id = w.project_id
           WHERE w.user_id = ? AND w.project_id = ?
           ORDER BY w.updated_at DESC`
        )
        .all(userId, projectIdFilter) as Array<Record<string, unknown>>)
    : (db
        .prepare(
          `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
           FROM workflows w
           LEFT JOIN projects p ON p.id = w.project_id
           WHERE w.user_id = ?
           ORDER BY w.updated_at DESC`
        )
        .all(userId) as Array<Record<string, unknown>>);

  const workflows = rows.map(mapWorkflowRow);

  const execStats = db
    .prepare(
      `SELECT
         COUNT(*) as totalExecutions,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulExecutions
       FROM workflow_executions
       WHERE user_id = ?`
    )
    .get(userId) as { totalExecutions: number; successfulExecutions: number | null };

  res.json({
    workflows,
    stats: {
      totalWorkflows: workflows.length,
      activeWorkflows: workflows.filter((w) => w.isActive).length,
      totalExecutions: execStats?.totalExecutions || 0,
      successfulExecutions: execStats?.successfulExecutions || 0,
    },
  });
});

router.post('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const project = resolveProjectForUser(db, userId, req.body?.projectId);

    const name = String(req.body?.name || 'My workflow').trim() || 'My workflow';
    const description = String(req.body?.description || '').trim();
    const nodes: WorkflowNode[] = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
    const edges: WorkflowEdge[] = Array.isArray(req.body?.edges) ? req.body.edges : [];
    const settings: WorkflowSettings = req.body?.settings || {
      timeoutMs: 15000,
      retryOnFailure: false,
      maxRetries: 1,
    };

    const id = `wf_${generateRandomToken(8)}`;
    const webhookSecret = generateRandomToken(16);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO workflows (id, user_id, project_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      project.id,
      name,
      description,
      JSON.stringify(nodes),
      JSON.stringify(edges),
      JSON.stringify(settings),
      webhookSecret,
      now,
      now
    );

    const row = db
      .prepare(
        `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
         FROM workflows w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?`
      )
      .get(id) as Record<string, unknown>;
    res.status(201).json({ workflow: mapWorkflowRow(row) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create workflow.' });
  }
});

router.post('/import', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const project = resolveProjectForUser(db, userId, req.body?.projectId);

    const payload = req.body?.workflow || req.body;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.nodes)) {
      res.status(400).json({ error: 'Invalid workflow JSON format. Expected { name, nodes, edges }.' });
      return;
    }

    const rawNodes = payload.nodes as WorkflowNode[];
    const rawEdges = Array.isArray(payload.edges) ? (payload.edges as WorkflowEdge[]) : [];

    // Remap node and edge IDs safely to prevent collisions
    const idMap = new Map<string, string>();
    for (const n of rawNodes) {
      if (n.id) idMap.set(n.id, `node_${generateRandomToken(6)}`);
    }

    const sanitizedNodes: WorkflowNode[] = rawNodes
      .filter((n) => n && n.id && n.position)
      .map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        type: n.type === 'stickyNote' ? 'stickyNote' : n.type === 'group' ? 'group' : 'croxNode',
        ...(n.parentId && idMap.has(n.parentId) ? { parentId: idMap.get(n.parentId)! } : {}),
      })) as WorkflowNode[];

    let serializedNodes = JSON.stringify(sanitizedNodes);
    for (const [oldId, newId] of idMap.entries()) {
      serializedNodes = serializedNodes.split(`nodes.${oldId}.`).join(`nodes.${newId}.`);
    }
    const finalNodes: WorkflowNode[] = JSON.parse(serializedNodes);

    const sanitizedEdges: WorkflowEdge[] = rawEdges
      .filter((e) => e && idMap.has(e.source) && idMap.has(e.target) && e.source !== e.target)
      .map((e) => ({
        ...e,
        id: `edge_${generateRandomToken(6)}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }));

    const validation = validateWorkflowGraph(finalNodes, sanitizedEdges, { strictConfig: false });
    if (!validation.valid && finalNodes.some((n) => n.type !== 'stickyNote' && n.type !== 'group')) {
      res.status(400).json({ error: `Imported workflow invalid: ${validation.errors.join(' ')}` });
      return;
    }

    const name = String(payload.name || 'Imported Workflow').trim() || 'Imported Workflow';
    const description = String(payload.description || '').trim();
    const settings: WorkflowSettings = payload.settings || {
      timeoutMs: 15000,
      retryOnFailure: false,
      maxRetries: 1,
    };

    const id = `wf_${generateRandomToken(8)}`;
    const webhookSecret = generateRandomToken(16);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO workflows (id, user_id, project_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      project.id,
      name,
      description,
      JSON.stringify(finalNodes),
      JSON.stringify(sanitizedEdges),
      JSON.stringify(settings),
      webhookSecret,
      now,
      now
    );

    const row = db
      .prepare(
        `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
         FROM workflows w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?`
      )
      .get(id) as Record<string, unknown>;
    res.status(201).json({ workflow: mapWorkflowRow(row) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to import workflow.' });
  }
});

router.post('/validate-cron', (req: AuthenticatedRequest, res: Response) => {
  try {
    const cronExpression = String(req.body?.cronExpression || '0 9 * * *');
    const timezone = String(req.body?.timezone || 'UTC');
    const nextRuns = previewNextRuns(cronExpression, timezone, 3);
    res.json({ valid: true, nextRuns });
  } catch (err) {
    res.status(400).json({
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid cron expression.',
      nextRuns: [],
    });
  }
});

router.post('/test-model-connection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const node = req.body?.node as CroxFlowNode | undefined;
    if (!node || !node.data?.nodeType) {
      res.status(400).json({ error: 'Chat Model node payload is required.' });
      return;
    }
    const result = await testChatModelConnection({ db, userId: req.user!.id, node });
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Connection test failed.' });
  }
});

router.delete('/ai-memory', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const sessionKey = String(req.body?.sessionKey || req.query.sessionKey || '').trim();
  const conversationId = String(req.body?.conversationId || req.query.conversationId || 'default').trim();
  if (!sessionKey) {
    res.status(400).json({ error: 'sessionKey is required.' });
    return;
  }
  const cleared = clearAiMemorySession(db, req.user!.id, sessionKey, conversationId);
  res.json({ ok: true, cleared });
});

router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
       FROM workflows w
       LEFT JOIN projects p ON p.id = w.project_id
       WHERE w.id = ? AND w.user_id = ?`
    )
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Workflow not found.' });
    return;
  }
  res.json({ workflow: mapWorkflowRow(row) });
});

router.get('/:id/export', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Workflow not found.' });
    return;
  }

  const wf = mapWorkflowRow(row);
  res.json({
    export: {
      croxVersion: '2.0',
      exportedAt: new Date().toISOString(),
      name: wf.name,
      description: wf.description,
      nodes: wf.nodes,
      edges: wf.edges,
      settings: wf.settings,
    },
  });
});

router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const existingRow = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!existingRow) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const existing = mapWorkflowRow(existingRow);
    const name = req.body?.name !== undefined ? String(req.body.name).trim() || existing.name : existing.name;
    const description =
      req.body?.description !== undefined ? String(req.body.description).trim() : existing.description;
    const nodes: WorkflowNode[] = Array.isArray(req.body?.nodes) ? req.body.nodes : existing.nodes;
    const edges: WorkflowEdge[] = Array.isArray(req.body?.edges) ? req.body.edges : existing.edges;
    const settings: WorkflowSettings = req.body?.settings ? req.body.settings : existing.settings;

    let projectId = existing.projectId || ensureDefaultProject(db, req.user!.id).id;
    if (req.body?.projectId !== undefined) {
      const targetProj = resolveProjectForUser(db, req.user!.id, String(req.body.projectId));
      projectId = targetProj.id;
    }

    const functionalCount = nodes.filter((n) => n.type !== 'stickyNote' && n.type !== 'group').length;
    if (functionalCount > 0) {
      const graphCheck = validateWorkflowGraph(nodes, edges, { strictConfig: false });
      if (!graphCheck.valid) {
        res.status(400).json({ error: graphCheck.errors.join(' '), validation: graphCheck });
        return;
      }
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE workflows
       SET name = ?, description = ?, project_id = ?, nodes_json = ?, edges_json = ?, settings_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      name,
      description,
      projectId,
      JSON.stringify(nodes),
      JSON.stringify(edges),
      JSON.stringify(settings),
      now,
      existing.id,
      req.user!.id
    );

    const updatedRow = db
      .prepare(
        `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
         FROM workflows w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?`
      )
      .get(existing.id) as Record<string, unknown>;
    const updated = mapWorkflowRow(updatedRow);
    syncWorkflowSchedule(db, updated);

    if (req.body?.saveVersion) {
      createVersionSnapshot(db, updated, String(req.body?.versionNote || 'Manual save'));
    }

    res.json({ workflow: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save workflow.' });
  }
});

router.post('/:id/move', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const targetProjectId = String(req.body?.projectId || '').trim();
    const proj = db
      .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
      .get(targetProjectId, req.user!.id) as { id: string } | undefined;

    if (!proj) {
      res.status(404).json({ error: 'Target project not found.' });
      return;
    }

    const result = db
      .prepare('UPDATE workflows SET project_id = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(proj.id, new Date().toISOString(), req.params.id, req.user!.id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const row = db
      .prepare(
        `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
         FROM workflows w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?`
      )
      .get(req.params.id) as Record<string, unknown>;
    res.json({ workflow: mapWorkflowRow(row) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to move workflow.' });
  }
});

router.patch('/:id/status', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const workflow = mapWorkflowRow(row);
    const nextActive = Boolean(req.body?.isActive);

    if (nextActive) {
      const validation = validateWorkflowGraph(workflow.nodes, workflow.edges, { strictConfig: true });
      if (!validation.valid) {
        res.status(400).json({
          error: `Cannot publish workflow: ${validation.errors.join(' ')}`,
          validation,
        });
        return;
      }

      if (req.user!.plan === 'free') {
        const activeCountRow = db
          .prepare('SELECT COUNT(*) as cnt FROM workflows WHERE user_id = ? AND is_active = 1 AND id != ?')
          .get(req.user!.id, workflow.id) as { cnt: number };
        if (activeCountRow.cnt >= 3) {
          res.status(403).json({
            error: 'Free plan supports up to 3 active workflows. Deactivate another workflow or upgrade to Pro.',
          });
          return;
        }
      }
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE workflows SET is_active = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
      nextActive ? 1 : 0,
      now,
      workflow.id,
      req.user!.id
    );

    const updatedRow = db
      .prepare(
        `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
         FROM workflows w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?`
      )
      .get(workflow.id) as Record<string, unknown>;
    const updated = mapWorkflowRow(updatedRow);
    syncWorkflowSchedule(db, updated);

    if (nextActive) {
      createVersionSnapshot(db, updated, 'Published live version');
    }

    res.json({ workflow: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update workflow status.' });
  }
});

router.get('/:id/versions', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const wf = db
    .prepare('SELECT id FROM workflows WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id);

  if (!wf) {
    res.status(404).json({ error: 'Workflow not found.' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT * FROM workflow_versions
       WHERE workflow_id = ? AND user_id = ?
       ORDER BY version_number DESC
       LIMIT 30`
    )
    .all(req.params.id, req.user!.id) as Array<Record<string, unknown>>;

  const versions: WorkflowVersionRecord[] = rows.map((r) => ({
    id: r.id as string,
    workflowId: r.workflow_id as string,
    userId: r.user_id as string,
    versionNumber: Number(r.version_number),
    name: r.name as string,
    description: (r.description as string) || '',
    nodes: JSON.parse((r.nodes_json as string) || '[]'),
    edges: JSON.parse((r.edges_json as string) || '[]'),
    settings: JSON.parse((r.settings_json as string) || '{"timeoutMs":15000,"retryOnFailure":false,"maxRetries":1}'),
    note: (r.note as string) || '',
    createdAt: r.created_at as string,
  }));

  res.json({ versions });
});

router.post('/:id/versions', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Workflow not found.' });
    return;
  }

  const wf = mapWorkflowRow(row);
  const note = String(req.body?.note || 'Manual snapshot').trim() || 'Manual snapshot';
  const version = createVersionSnapshot(db, wf, note);
  res.status(201).json({ version });
});

router.post('/:id/versions/:versionId/restore', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const vRow = db
    .prepare('SELECT * FROM workflow_versions WHERE id = ? AND workflow_id = ? AND user_id = ?')
    .get(req.params.versionId, req.params.id, req.user!.id) as Record<string, unknown> | undefined;

  if (!vRow) {
    res.status(404).json({ error: 'Version snapshot not found.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE workflows
     SET name = ?, description = ?, nodes_json = ?, edges_json = ?, settings_json = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    vRow.name as string,
    (vRow.description as string) || '',
    vRow.nodes_json as string,
    vRow.edges_json as string,
    vRow.settings_json as string,
    now,
    req.params.id,
    req.user!.id
  );

  const updatedRow = db
    .prepare(
      `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
       FROM workflows w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?`
    )
    .get(req.params.id) as Record<string, unknown>;
  const updated = mapWorkflowRow(updatedRow);
  syncWorkflowSchedule(db, updated);

  res.json({ workflow: updated });
});

router.post('/:id/duplicate', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const source = mapWorkflowRow(row);
    const idMap = new Map<string, string>();
    for (const n of source.nodes) {
      idMap.set(n.id, `node_${generateRandomToken(6)}`);
    }

    const newNodes = source.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
    }));
    const newEdges = source.edges.map((e) => ({
      ...e,
      id: `edge_${generateRandomToken(6)}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
    }));

    const newId = `wf_${generateRandomToken(8)}`;
    const newSecret = generateRandomToken(16);
    const now = new Date().toISOString();
    const projectId = source.projectId || ensureDefaultProject(db, req.user!.id).id;

    db.prepare(
      `INSERT INTO workflows (id, user_id, project_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId,
      req.user!.id,
      projectId,
      `${source.name} (Copy)`,
      source.description,
      JSON.stringify(newNodes),
      JSON.stringify(newEdges),
      JSON.stringify(source.settings),
      newSecret,
      now,
      now
    );

    const created = db
      .prepare(
        `SELECT w.*, p.name as project_name, p.workspace_name as workspace_name
         FROM workflows w LEFT JOIN projects p ON p.id = w.project_id WHERE w.id = ?`
      )
      .get(newId) as Record<string, unknown>;
    res.status(201).json({ workflow: mapWorkflowRow(created) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to duplicate workflow.' });
  }
});

router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Workflow not found.' });
    return;
  }
  res.json({ ok: true });
});

router.post('/:id/run', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const workflow = mapWorkflowRow(row);
    const triggerType =
      req.body?.mode === 'test'
        ? 'test'
        : req.body?.mode === 'chat'
          ? 'chat'
          : req.body?.mode === 'form'
            ? 'form'
            : 'manual';
    const triggerPayload = req.body?.payload;

    const execution = await executeWorkflow(db, workflow, {
      triggerType,
      triggerPayload,
    });

    res.json({ execution });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Workflow execution failed.' });
  }
});

router.post('/:id/run-from-node', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const nodeId = String(req.body?.nodeId || '').trim();
    if (!nodeId) {
      res.status(400).json({ error: 'nodeId is required.' });
      return;
    }

    const workflow = mapWorkflowRow(row);

    // Seed upstream node outputs from latest execution if available
    const seedNodeOutputs: Record<string, unknown> = {};
    const lastExec = db
      .prepare(
        `SELECT id FROM workflow_executions
         WHERE workflow_id = ? AND user_id = ?
         ORDER BY started_at DESC LIMIT 1`
      )
      .get(workflow.id, req.user!.id) as { id: string } | undefined;

    if (lastExec) {
      const nodeRows = db
        .prepare('SELECT node_id, output_json FROM node_executions WHERE execution_id = ? AND status = \'success\'')
        .all(lastExec.id) as Array<{ node_id: string; output_json: string | null }>;
      for (const nr of nodeRows) {
        if (nr.output_json) {
          try {
            seedNodeOutputs[nr.node_id] = JSON.parse(nr.output_json);
          } catch {
            // ignore
          }
        }
      }
    }

    const execution = await executeWorkflow(db, workflow, {
      triggerType: 'test',
      triggerPayload: req.body?.payload,
      runFromNodeId: nodeId,
      seedNodeOutputs,
    });

    res.json({ execution });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Partial execution failed.' });
  }
});

router.post('/:id/test-node', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const node = req.body?.node as WorkflowNode | undefined;
    if (!node || node.type === 'stickyNote' || node.type === 'group' || !(node as CroxFlowNode).data?.nodeType) {
      res.status(400).json({ error: 'Valid functional node payload is required.' });
      return;
    }

    const wf = mapWorkflowRow(row);
    const contextNodes = Array.isArray(req.body?.nodes) ? (req.body.nodes as WorkflowNode[]) : wf.nodes;
    const contextEdges = Array.isArray(req.body?.edges) ? (req.body.edges as WorkflowEdge[]) : wf.edges;

    const sampleInput = req.body?.sampleInput ?? {};
    const result = await testSingleNode(
      db,
      req.user!.id,
      node,
      sampleInput,
      contextNodes,
      contextEdges,
      wf.id
    );
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Node test failed.' });
  }
});

router.get('/:id/executions', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const wf = db
    .prepare('SELECT id, name FROM workflows WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as { id: string; name: string } | undefined;

  if (!wf) {
    res.status(404).json({ error: 'Workflow not found.' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT * FROM workflow_executions
       WHERE workflow_id = ? AND user_id = ?
       ORDER BY started_at DESC
       LIMIT 30`
    )
    .all(wf.id, req.user!.id) as Array<Record<string, unknown>>;

  const executions: WorkflowExecutionRecord[] = rows.map((r) => ({
    id: r.id as string,
    workflowId: r.workflow_id as string,
    workflowName: wf.name,
    userId: r.user_id as string,
    triggerType: r.trigger_type as WorkflowExecutionRecord['triggerType'],
    status: r.status as WorkflowExecutionRecord['status'],
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
    durationMs: Number(r.duration_ms || 0),
    summary: JSON.parse(
      (r.summary_json as string) || '{"totalNodes":0,"successCount":0,"failedCount":0,"skippedCount":0}'
    ),
    errorMessage: (r.error_message as string | null) ?? null,
  }));

  res.json({ executions });
});

router.get('/:id/evaluations', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const wf = db
    .prepare('SELECT id FROM workflows WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id);

  if (!wf) {
    res.status(404).json({ error: 'Workflow not found.' });
    return;
  }

  const rows = db
    .prepare(
      'SELECT * FROM workflow_evaluations WHERE workflow_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 15'
    )
    .all(req.params.id, req.user!.id) as Array<Record<string, unknown>>;

  const evaluations: WorkflowEvaluationRecord[] = rows.map((r) => ({
    id: r.id as string,
    workflowId: r.workflow_id as string,
    status: r.status as WorkflowEvaluationRecord['status'],
    checks: JSON.parse((r.checks_json as string) || '[]'),
    executionId: (r.execution_id as string | null) ?? null,
    durationMs: Number(r.duration_ms || 0),
    createdAt: r.created_at as string,
  }));

  res.json({ evaluations });
});

router.post('/:id/evaluate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }

    const startMs = Date.now();
    const workflow = mapWorkflowRow(row);
    const checks: WorkflowEvaluationCheck[] = [];

    const validation = validateWorkflowGraph(workflow.nodes, workflow.edges, { strictConfig: true });
    checks.push({
      name: 'Graph Integrity & Acyclicity',
      passed: validation.valid,
      severity: validation.valid ? 'info' : 'error',
      message: validation.valid
        ? `Valid DAG with ${workflow.nodes.length} nodes and ${workflow.edges.length} connections.`
        : validation.errors.join(' '),
    });

    const hasTrigger = workflow.nodes.some(
      (n) =>
        n.type !== 'stickyNote' &&
        n.type !== 'group' &&
        [
          'manual_trigger',
          'webhook_trigger',
          'schedule_trigger',
          'chat_trigger',
          'form_trigger',
          'error_trigger',
        ].includes((n as CroxFlowNode).data.nodeType)
    );
    checks.push({
      name: 'Trigger Coverage',
      passed: hasTrigger,
      severity: hasTrigger ? 'info' : 'warning',
      message: hasTrigger
        ? 'Workflow defines an explicit trigger.'
        : 'No Trigger node detected; workflow can only run manually.',
    });

    const aiNodes = workflow.nodes.filter(
      (n): n is CroxFlowNode =>
        n.type !== 'stickyNote' &&
        n.type !== 'group' &&
        (n.data.nodeType === 'ai_node' || n.data.nodeType === 'ai_agent' || n.data.nodeType === 'agent_orchestrator')
    );
    if (aiNodes.length > 0) {
      const hasServerGemini = Boolean(getGeminiApiKey());
      checks.push({
        name: 'AI Provider Readiness',
        passed: hasServerGemini,
        severity: hasServerGemini ? 'info' : 'warning',
        message: hasServerGemini
          ? 'Gemini API is active on the server for live AI execution.'
          : 'No server GEMINI_API_KEY configured; AI steps require a linked credential or will run in simulated mode.',
      });
    }

    let executionId: string | null = null;
    if (req.body?.runTest && validation.valid) {
      const exec = await executeWorkflow(db, workflow, { triggerType: 'test' });
      executionId = exec.id;
      checks.push({
        name: 'End-to-End Dry Run Execution',
        passed: exec.status === 'success',
        severity: exec.status === 'success' ? 'info' : 'error',
        message:
          exec.status === 'success'
            ? `Executed ${exec.summary.successCount} steps cleanly in ${exec.durationMs}ms.`
            : exec.errorMessage || 'Dry run failed.',
      });
    }

    const hasError = checks.some((c) => !c.passed && c.severity === 'error');
    const hasWarning = checks.some((c) => !c.passed && c.severity === 'warning');
    const status: WorkflowEvaluationRecord['status'] = hasError ? 'failed' : hasWarning ? 'warnings' : 'passed';

    const evalId = `eval_${generateRandomToken(8)}`;
    const now = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    db.prepare(
      `INSERT INTO workflow_evaluations (id, workflow_id, user_id, status, checks_json, execution_id, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(evalId, workflow.id, req.user!.id, status, JSON.stringify(checks), executionId, durationMs, now);

    res.json({
      evaluation: {
        id: evalId,
        workflowId: workflow.id,
        status,
        checks,
        executionId,
        durationMs,
        createdAt: now,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Evaluation failed.' });
  }
});

export default router;
