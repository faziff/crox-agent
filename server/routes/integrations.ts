import { Router, Response } from 'express';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import {
  createIntegrationConnection,
  listConnectionsForUser,
  listIntegrationsForUser,
  testIntegrationConnection,
} from '../services/integrationService.ts';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const integrations = listIntegrationsForUser(db, req.user!.id);
  const connections = listConnectionsForUser(db, req.user!.id);
  res.json({ integrations, connections });
});

router.get('/connections', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const connections = listConnectionsForUser(db, req.user!.id);
  res.json({ connections });
});

router.post('/:appId/connect', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const connection = createIntegrationConnection(db, req.user!.id, req.params.appId, {
      label: String(req.body?.label || ''),
      credentialId: req.body?.credentialId || null,
      config: req.body?.config || {},
    });
    res.status(201).json({ connection });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create integration connection.' });
  }
});

router.post('/connections/:connectionId/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDb();
    const result = await testIntegrationConnection(db, req.user!.id, req.params.connectionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Connection test failed.' });
  }
});

router.delete('/connections/:connectionId', (req: AuthenticatedRequest, res: Response) => {
  const db = getDb();
  const resDel = db
    .prepare('DELETE FROM integration_connections WHERE id = ? AND user_id = ?')
    .run(req.params.connectionId, req.user!.id);
  if (resDel.changes === 0) {
    res.status(404).json({ error: 'Integration connection not found.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
