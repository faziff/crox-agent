import { Router, Request, Response } from 'express';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { installTemplateForUser, WORKFLOW_TEMPLATES } from '../services/templateService.ts';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ templates: WORKFLOW_TEMPLATES });
});

router.post('/:id/install', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
  const workflow = installTemplateForUser(db, req.params.id, req.user!.id, projectId);
  if (!workflow) {
    res.status(404).json({ error: 'Template not found.' });
    return;
  }
  res.status(201).json({ workflow });
});

export default router;
