import { Router, Response } from 'express';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { requestExecutionCancellation } from '../services/executionEngine.ts';
import { NodeExecutionResult, WorkflowExecutionRecord } from '../../src/types/workflow.ts';

const router = Router();
router.use(requireAuth);

function mapExecutionRow(row: Record<string, unknown>): WorkflowExecutionRecord {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    workflowName: (row.workflow_name as string) || 'Deleted Workflow',
    userId: row.user_id as string,
    triggerType: row.trigger_type as WorkflowExecutionRecord['triggerType'],
    status: row.status as WorkflowExecutionRecord['status'],
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    durationMs: Number(row.duration_ms || 0),
    summary: JSON.parse((row.summary_json as string) || '{"totalNodes":0,"successCount":0,"failedCount":0,"skippedCount":0}'),
    errorMessage: (row.error_message as string | null) ?? null,
  };
}

function mapNodeExecRow(row: Record<string, unknown>): NodeExecutionResult {
  return {
    id: row.id as string,
    executionId: row.execution_id as string,
    nodeId: row.node_id as string,
    nodeName: row.node_name as string,
    nodeType: row.node_type as NodeExecutionResult['nodeType'],
    status: row.status as NodeExecutionResult['status'],
    input: row.input_json ? JSON.parse(row.input_json as string) : null,
    output: row.output_json ? JSON.parse(row.output_json as string) : null,
    errorMessage: (row.error_message as string | null) ?? null,
    durationMs: Number(row.duration_ms || 0),
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    simulated: Boolean(row.simulated),
  };
}

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const statusFilter = req.query.status ? String(req.query.status) : '';
  const workflowIdFilter = req.query.workflowId ? String(req.query.workflowId) : '';

  const conditions = ['we.user_id = ?'];
  const params: unknown[] = [req.user!.id];

  if (statusFilter && statusFilter !== 'all') {
    conditions.push('we.status = ?');
    params.push(statusFilter);
  }
  if (workflowIdFilter) {
    conditions.push('we.workflow_id = ?');
    params.push(workflowIdFilter);
  }

  const whereClause = conditions.join(' AND ');

  const totalRow = db
    .prepare(`SELECT COUNT(*) as total FROM workflow_executions we WHERE ${whereClause}`)
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `SELECT we.*, w.name as workflow_name
       FROM workflow_executions we
       LEFT JOIN workflows w ON w.id = we.workflow_id
       WHERE ${whereClause}
       ORDER BY we.started_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  res.json({
    executions: rows.map(mapExecutionRow),
    total: totalRow.total,
    limit,
    offset,
  });
});

router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT we.*, w.name as workflow_name
       FROM workflow_executions we
       LEFT JOIN workflows w ON w.id = we.workflow_id
       WHERE we.id = ? AND we.user_id = ?`
    )
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Execution record not found.' });
    return;
  }

  const nodeRows = db
    .prepare('SELECT * FROM node_executions WHERE execution_id = ? ORDER BY started_at ASC')
    .all(req.params.id) as Array<Record<string, unknown>>;

  const execution = mapExecutionRow(row);
  execution.nodeResults = nodeRows.map(mapNodeExecRow);

  res.json({ execution });
});

router.post('/:id/cancel', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM workflow_executions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id);

  if (!row) {
    res.status(404).json({ error: 'Execution record not found.' });
    return;
  }

  const cancelled = requestExecutionCancellation(req.params.id);
  res.json({ ok: true, cancelled });
});

export default router;
