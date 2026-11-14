import Database from 'better-sqlite3';
import { CronExpressionParser } from 'cron-parser';
import { ScheduleTriggerConfig, WorkflowRecord } from '../../src/types/workflow.ts';
import { executeWorkflow } from './executionEngine.ts';
import { config } from '../config.ts';

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isTickRunning = false;
const activeWorkflowRuns = new Set<string>();
const configuredConcurrency = config.execution.schedulerConcurrency;
const MAX_SCHEDULED_CONCURRENCY = Number.isSafeInteger(configuredConcurrency)
  ? Math.min(Math.max(configuredConcurrency, 1), 10)
  : 3;
const SCHEDULE_LOCK_MS = 5 * 60 * 1000;

export function computeNextRunIso(cronExpression: string, timezone = 'UTC', fromDate = new Date()): string {
  const interval = CronExpressionParser.parse(cronExpression, {
    tz: timezone || 'UTC',
    currentDate: fromDate,
  });
  return interval.next().toDate().toISOString();
}

export function previewNextRuns(cronExpression: string, timezone = 'UTC', count = 3): string[] {
  const interval = CronExpressionParser.parse(cronExpression, {
    tz: timezone || 'UTC',
    currentDate: new Date(),
  });
  const runs: string[] = [];
  for (let i = 0; i < count; i++) {
    runs.push(interval.next().toDate().toISOString());
  }
  return runs;
}

export function syncWorkflowSchedule(db: Database.Database, workflow: WorkflowRecord): void {
  db.prepare('DELETE FROM scheduled_jobs WHERE workflow_id = ?').run(workflow.id);

  if (!workflow.isActive) return;

  const scheduleNode = workflow.nodes.find((n) => n.data.nodeType === 'schedule_trigger');
  if (!scheduleNode) return;

  const cfg = scheduleNode.data.config as ScheduleTriggerConfig;
  const cronExpr = cfg.cronExpression || '0 9 * * *';
  const tz = cfg.timezone || 'UTC';
  const nextRunAt = computeNextRunIso(cronExpr, tz);

  db.prepare(
    `INSERT INTO scheduled_jobs (workflow_id, user_id, cron_expression, timezone, next_run_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(workflow.id, workflow.userId, cronExpr, tz, nextRunAt);
}

export function recoverScheduledJobs(db: Database.Database): void {
  const activeWorkflows = db
    .prepare('SELECT * FROM workflows WHERE is_active = 1')
    .all() as Array<{
    id: string;
    user_id: string;
    name: string;
    description: string;
    is_active: number;
    nodes_json: string;
    edges_json: string;
    settings_json: string;
    webhook_secret: string;
    last_execution_status: string | null;
    last_executed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  for (const row of activeWorkflows) {
    const wf: WorkflowRecord = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      isActive: Boolean(row.is_active),
      nodes: JSON.parse(row.nodes_json),
      edges: JSON.parse(row.edges_json),
      settings: JSON.parse(row.settings_json),
      webhookSecret: row.webhook_secret,
      lastExecutionStatus: row.last_execution_status as WorkflowRecord['lastExecutionStatus'],
      lastExecutedAt: row.last_executed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    try {
      syncWorkflowSchedule(db, wf);
    } catch {
      // ignore invalid cron during recovery
    }
  }
}

async function runScheduledWorkflow(
  db: Database.Database,
  workflowId: string,
  scheduledFor: string,
  cronExpression: string,
  timezone: string
): Promise<void> {
  try {
    const row = db
      .prepare('SELECT * FROM workflows WHERE id = ? AND is_active = 1')
      .get(workflowId) as Record<string, unknown> | undefined;
    if (!row) return;

    const workflow: WorkflowRecord = {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: (row.project_id as string | null) ?? null,
      name: row.name as string,
      description: (row.description as string) || '',
      isActive: Boolean(row.is_active),
      nodes: JSON.parse((row.nodes_json as string) || '[]'),
      edges: JSON.parse((row.edges_json as string) || '[]'),
      settings: JSON.parse((row.settings_json as string) || '{}'),
      webhookSecret: row.webhook_secret as string,
      lastExecutionStatus: (row.last_execution_status as WorkflowRecord['lastExecutionStatus']) || null,
      lastExecutedAt: (row.last_executed_at as string | null) || null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };

    await executeWorkflow(db, workflow, {
      triggerType: 'schedule',
      triggerPayload: { scheduledFor, cronExpression, timezone },
    });
  } catch (error) {
    // The workflow execution engine persists normal node failures. This log is
    // reserved for dispatch/runtime failures outside the normal execution path.
    console.error(`[CROX Scheduler] Failed to dispatch workflow ${workflowId}:`, error);
  } finally {
    try {
      db.prepare(
        'UPDATE scheduled_jobs SET last_run_at = ?, locked_until = NULL WHERE workflow_id = ?'
      ).run(new Date().toISOString(), workflowId);
    } catch (error) {
      console.error(`[CROX Scheduler] Could not release schedule lock for ${workflowId}:`, error);
    }
    activeWorkflowRuns.delete(workflowId);
  }
}

/**
 * Claims due jobs quickly, advances their next occurrence, then dispatches
 * each workflow without awaiting its completion. This prevents a slow workflow
 * from blocking every other due schedule. SQLite's conditional UPDATE is the
 * atomic claim for the supported single-instance deployment model.
 *
 * Missed occurrences are coalesced: after downtime, one run is dispatched and
 * the next occurrence is computed from the current time rather than replaying
 * an unbounded backlog of old cron ticks.
 */
export async function tickScheduler(db: Database.Database): Promise<void> {
  if (isTickRunning) return;
  isTickRunning = true;

  try {
    const availableSlots = MAX_SCHEDULED_CONCURRENCY - activeWorkflowRuns.size;
    if (availableSlots <= 0) return;

    const now = new Date();
    const nowIso = now.toISOString();
    const dueJobs = db
      .prepare(
        `SELECT sj.workflow_id, sj.cron_expression, sj.timezone, sj.next_run_at
         FROM scheduled_jobs sj
         JOIN workflows w ON w.id = sj.workflow_id
         WHERE w.is_active = 1
           AND sj.next_run_at <= ?
           AND (sj.locked_until IS NULL OR sj.locked_until < ?)
         ORDER BY sj.next_run_at ASC
         LIMIT ?`
      )
      .all(nowIso, nowIso, Math.max(availableSlots * 4, 25)) as Array<{
      workflow_id: string;
      cron_expression: string;
      timezone: string;
      next_run_at: string;
    }>;

    for (const job of dueJobs) {
      if (activeWorkflowRuns.size >= MAX_SCHEDULED_CONCURRENCY) break;
      if (activeWorkflowRuns.has(job.workflow_id)) continue;

      let nextRunAt: string;
      try {
        nextRunAt = computeNextRunIso(job.cron_expression, job.timezone, now);
      } catch (error) {
        console.error(`[CROX Scheduler] Invalid cron schedule for workflow ${job.workflow_id}:`, error);
        // Do not hot-loop a corrupt schedule. A later workflow save will
        // recreate its schedule from the validated trigger configuration.
        db.prepare('DELETE FROM scheduled_jobs WHERE workflow_id = ?').run(job.workflow_id);
        continue;
      }

      const lockUntil = new Date(now.getTime() + SCHEDULE_LOCK_MS).toISOString();
      const claimAndAdvance = db.transaction(() => {
        const claim = db
          .prepare(
            `UPDATE scheduled_jobs SET locked_until = ?
             WHERE workflow_id = ? AND next_run_at <= ?
               AND (locked_until IS NULL OR locked_until < ?)`
          )
          .run(lockUntil, job.workflow_id, nowIso, nowIso);

        if (claim.changes !== 1) return false;

        // Advance the cron cursor before execution so a long run cannot be
        // redispatched by the next scheduler tick. Both changes commit together.
        db.prepare('UPDATE scheduled_jobs SET last_run_at = ?, next_run_at = ? WHERE workflow_id = ?')
          .run(nowIso, nextRunAt, job.workflow_id);
        return true;
      });

      if (!claimAndAdvance()) continue;

      activeWorkflowRuns.add(job.workflow_id);
      void runScheduledWorkflow(
        db,
        job.workflow_id,
        job.next_run_at,
        job.cron_expression,
        job.timezone
      );
    }
  } finally {
    isTickRunning = false;
  }
}

export function startScheduler(db: Database.Database): void {
  if (schedulerTimer) return;
  recoverScheduledJobs(db);
  schedulerTimer = setInterval(() => {
    void tickScheduler(db);
  }, 15_000);
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
