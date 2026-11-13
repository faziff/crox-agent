import Database from 'better-sqlite3';
import { ProjectRecord } from '../../src/types/workflow.ts';
import { generateRandomToken } from '../utils/crypto.ts';

export function mapProjectRow(row: Record<string, unknown>): ProjectRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    workspaceName: (row.workspace_name as string) || 'Personal',
    name: row.name as string,
    description: (row.description as string) || '',
    isDefault: Boolean(row.is_default),
    isArchived: Boolean(row.is_archived),
    workflowCount: row.workflow_count !== undefined ? Number(row.workflow_count) : undefined,
    activeWorkflowCount:
      row.active_workflow_count !== undefined ? Number(row.active_workflow_count) : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function ensureDefaultProject(db: Database.Database, userId: string): ProjectRecord {
  const existing = db
    .prepare('SELECT * FROM projects WHERE user_id = ? AND is_default = 1 LIMIT 1')
    .get(userId) as Record<string, unknown> | undefined;

  if (existing) {
    return mapProjectRow(existing);
  }

  const anyProject = db
    .prepare('SELECT * FROM projects WHERE user_id = ? AND is_archived = 0 ORDER BY created_at ASC LIMIT 1')
    .get(userId) as Record<string, unknown> | undefined;

  if (anyProject) {
    db.prepare('UPDATE projects SET is_default = 1 WHERE id = ?').run(anyProject.id as string);
    return mapProjectRow({ ...anyProject, is_default: 1 });
  }

  const id = `prj_${generateRandomToken(8)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, user_id, workspace_name, name, description, is_default, is_archived, created_at, updated_at)
     VALUES (?, ?, 'Personal', 'Personal', 'Default personal workspace project.', 1, 0, ?, ?)`
  ).run(id, userId, now, now);

  db.prepare(
    "UPDATE workflows SET project_id = ? WHERE user_id = ? AND (project_id IS NULL OR project_id = '')"
  ).run(id, userId);

  const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown>;
  return mapProjectRow(created);
}

export function listProjectsForUser(db: Database.Database, userId: string): ProjectRecord[] {
  ensureDefaultProject(db, userId);
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM workflows w WHERE w.project_id = p.id AND w.user_id = p.user_id) AS workflow_count,
        (SELECT COUNT(*) FROM workflows w WHERE w.project_id = p.id AND w.user_id = p.user_id AND w.is_active = 1) AS active_workflow_count
       FROM projects p
       WHERE p.user_id = ?
       ORDER BY p.is_default DESC, p.is_archived ASC, p.created_at ASC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  return rows.map(mapProjectRow);
}

export function resolveProjectForUser(
  db: Database.Database,
  userId: string,
  requestedProjectId?: string | null
): ProjectRecord {
  if (requestedProjectId) {
    const row = db
      .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
      .get(requestedProjectId, userId) as Record<string, unknown> | undefined;
    if (row) return mapProjectRow(row);
  }
  return ensureDefaultProject(db, userId);
}
