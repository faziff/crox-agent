import { Router, Response } from 'express';
import { getGeminiApiKey } from '../config.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { generateWorkflowWithNova } from '../services/novaService.ts';

const router = Router();
router.use(requireAuth);

router.get('/status', (_req: AuthenticatedRequest, res: Response) => {
  const key = getGeminiApiKey();
  res.json({
    providerConfigured: Boolean(key),
    provider: key ? 'gemini' : 'rule-based',
  });
});

router.post('/generate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) {
      res.status(400).json({ error: 'Please describe the automation you want NOVA to build.' });
      return;
    }

    const generated = await generateWorkflowWithNova(prompt);
    res.json({ result: generated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'NOVA workflow generation failed.' });
  }
});

export default router;
