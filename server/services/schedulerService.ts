import Database from 'better-sqlite3';
import { CronExpressionParser } from 'cron-parser';
import { ScheduleTriggerConfig, WorkflowRecord } from '../../src/types/workflow.ts';
import { executeWorkflow } from './executionEngine.ts';

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isTickRunning = false;

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

async function tickScheduler(db: Database.Database): Promise<void> {
  if (isTickRunning) return;
  isTickRunning = true;

  try {
    const nowIso = new Date().toISOString();
    const dueJobs = db
      .prepare(
        `SELECT sj.workflow_id, sj.cron_expression, sj.timezone
         FROM scheduled_jobs sj
         JOIN workflows w ON w.id = sj.workflow_id
         WHERE w.is_active = 1
           AND sj.next_run_at <= ?
           AND (sj.locked_until IS NULL OR sj.locked_until < ?)`
      )
      .all(nowIso, nowIso) as Array<{ workflow_id: string; cron_expression: string; timezone: string }>;

    for (const job of dueJobs) {
      const lockUntil = new Date(Date.now() + 60_000).toISOString();
      const updated = db
        .prepare(
          `UPDATE scheduled_jobs SET locked_until = ?
           WHERE workflow_id = ? AND (locked_until IS NULL OR locked_until < ?)`
        )
        .run(lockUntil, job.workflow_id, nowIso);

      if (updated.changes === 0) continue;

      try {
        const row = db.prepare('SELECT * FROM workflows WHERE id = ? AND is_active = 1').get(job.workflow_id) as
          | Record<string, unknown>
          | undefined;
        if (!row) continue;

        const wf: WorkflowRecord = {
          id: row.id as string,
          userId: row.user_id as string,
          name: row.name as string,
          description: row.description as string,
          isActive: Boolean(row.is_active),
          nodes: JSON.parse(row.nodes_json as string),
          edges: JSON.parse(row.edges_json as string),
          settings: JSON.parse(row.settings_json as string),
          webhookSecret: row.webhook_secret as string,
          lastExecutionStatus: row.last_execution_status as WorkflowRecord['lastExecutionStatus'],
          lastExecutedAt: row.last_executed_at as string | null,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        };

        await executeWorkflow(db, wf, {
          triggerType: 'schedule',
          triggerPayload: { scheduledFor: nowIso, cronExpression: job.cron_expression, timezone: job.timezone },
        });

        const nextRunAt = computeNextRunIso(job.cron_expression, job.timezone, new Date());
        db.prepare(
          'UPDATE scheduled_jobs SET last_run_at = ?, next_run_at = ?, locked_until = NULL WHERE workflow_id = ?'
        ).run(new Date().toISOString(), nextRunAt, job.workflow_id);
      } catch {
        const nextRunAt = computeNextRunIso(job.cron_expression, job.timezone, new Date());
        db.prepare('UPDATE scheduled_jobs SET next_run_at = ?, locked_until = NULL WHERE workflow_id = ?').run(
          nextRunAt,
          job.workflow_id
        );
      }
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
