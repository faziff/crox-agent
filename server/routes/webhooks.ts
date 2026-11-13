import { Router, Request, Response } from 'express';
import { getDb } from '../db/database.ts';
import { executeWorkflow } from '../services/executionEngine.ts';
import { mapWorkflowRow } from './workflows.ts';
import { WebhookTriggerConfig } from '../../src/types/workflow.ts';

const router = Router();

// Simple in-memory sliding-window rate limiter per workflow webhook (max 60 requests / minute)
const rateBuckets = new Map<string, number[]>();

function isRateLimited(key: string, maxPerMin = 60): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const timestamps = (rateBuckets.get(key) || []).filter((t) => t > cutoff);
  if (timestamps.length >= maxPerMin) {
    rateBuckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return false;
}

router.all('/:workflowId', async (req: Request, res: Response) => {
  try {
    const workflowId = String(req.params.workflowId || '');
    if (isRateLimited(workflowId)) {
      res.status(429).json({ error: 'Webhook rate limit exceeded. Maximum 60 requests per minute.' });
      return;
    }

    const db = getDb();
    const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Webhook workflow not found.' });
      return;
    }

    const workflow = mapWorkflowRow(row);
    if (!workflow.isActive) {
      res.status(403).json({
        error: 'Workflow is inactive. Activate the workflow in CROX before sending live webhook traffic.',
      });
      return;
    }

    const webhookNode = workflow.nodes.find((n) => n.data.nodeType === 'webhook_trigger');
    if (!webhookNode) {
      res.status(400).json({ error: 'This workflow does not contain a Webhook Trigger node.' });
      return;
    }

    const cfg = webhookNode.data.config as WebhookTriggerConfig;
    if (cfg.method && req.method.toUpperCase() !== cfg.method.toUpperCase()) {
      res.status(405).json({ error: `Expected HTTP ${cfg.method}, received ${req.method}.` });
      return;
    }

    if (cfg.requireSecret) {
      const providedSecret =
        String(req.headers['x-crox-webhook-secret'] || req.query.secret || '').trim();
      if (!providedSecret || providedSecret !== workflow.webhookSecret) {
        res.status(401).json({ error: 'Invalid or missing webhook secret.' });
        return;
      }
    }

    const triggerPayload = {
      headers: {
        'content-type': req.headers['content-type'] || '',
        'user-agent': req.headers['user-agent'] || '',
      },
      query: req.query,
      body: req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0 ? req.body : req.query,
      method: req.method,
      receivedAt: new Date().toISOString(),
    };

    const execution = await executeWorkflow(db, workflow, {
      triggerType: 'webhook',
      triggerPayload,
    });

    res.status(execution.status === 'failed' ? 500 : 200).json({
      ok: execution.status !== 'failed',
      executionId: execution.id,
      status: execution.status,
      durationMs: execution.durationMs,
      ...(cfg.responseMode === 'last_node'
        ? { results: execution.nodeResults?.map((r) => ({ node: r.nodeName, status: r.status, output: r.output })) }
        : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Webhook execution failed.' });
  }
});

export default router;
