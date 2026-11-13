import { Router, Response } from 'express';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import {
  ensureDefaultProject,
  listProjectsForUser,
  mapProjectRow,
} from '../services/projectService.ts';
import { generateRandomToken } from '../utils/crypto.ts';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const projects = listProjectsForUser(db, req.user!.id);
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list projects.' });
  }
});

router.post('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    ensureDefaultProject(db, userId);

    const name = String(req.body?.name || '').trim();
    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Project name must be at least 2 characters.' });
      return;
    }

    const description = String(req.body?.description || '').trim();
    const workspaceName = String(req.body?.workspaceName || 'Personal').trim() || 'Personal';
    const id = `prj_${generateRandomToken(8)}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO projects (id, user_id, workspace_name, name, description, is_default, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
    ).run(id, userId, workspaceName, name, description, now, now);

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ project: { ...mapProjectRow(row), workflowCount: 0, activeWorkflowCount: 0 } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create project.' });
  }
});

router.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM workflows w WHERE w.project_id = p.id AND w.user_id = p.user_id) AS workflow_count,
        (SELECT COUNT(*) FROM workflows w WHERE w.project_id = p.id AND w.user_id = p.user_id AND w.is_active = 1) AS active_workflow_count
       FROM projects p
       WHERE p.id = ? AND p.user_id = ?`
    )
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  res.json({ project: mapProjectRow(row) });
});

router.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : (row.name as string);
    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Project name must be at least 2 characters.' });
      return;
    }

    const description =
      req.body?.description !== undefined ? String(req.body.description).trim() : ((row.description as string) || '');
    const workspaceName =
      req.body?.workspaceName !== undefined
        ? String(req.body.workspaceName).trim() || 'Personal'
        : ((row.workspace_name as string) || 'Personal');
    const isArchived = req.body?.isArchived !== undefined ? (req.body.isArchived ? 1 : 0) : Number(row.is_archived);
    if (Boolean(row.is_default) && isArchived === 1) {
      res.status(400).json({ error: 'Default Personal project cannot be archived.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE projects
       SET name = ?, description = ?, workspace_name = ?, is_archived = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(name, description, workspaceName, isArchived, now, req.params.id, req.user!.id);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json({ project: mapProjectRow(updated) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update project.' });
  }
});

router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const row = db
      .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    if (Boolean(row.is_default)) {
      res.status(400).json({ error: 'Default Personal project cannot be deleted.' });
      return;
    }

    const defaultProj = ensureDefaultProject(db, userId);

    const tx = db.transaction(() => {
      db.prepare('UPDATE workflows SET project_id = ? WHERE project_id = ? AND user_id = ?').run(
        defaultProj.id,
        req.params.id,
        userId
      );
      db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    });
    tx();

    res.json({ ok: true, fallbackProjectId: defaultProj.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete project.' });
  }
});

export default router;
