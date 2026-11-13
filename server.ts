import express from 'express';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { config, getCredentialEncryptionKey, getGeminiApiKey } from './server/config.ts';
import { initDatabase } from './server/db/database.ts';
import { startScheduler } from './server/services/schedulerService.ts';
import authRoutes from './server/routes/auth.ts';
import workflowRoutes from './server/routes/workflows.ts';
import executionRoutes from './server/routes/executions.ts';
import credentialRoutes from './server/routes/credentials.ts';
import templateRoutes from './server/routes/templates.ts';
import novaRoutes from './server/routes/nova.ts';
import projectRoutes from './server/routes/projects.ts';
import settingsRoutes from './server/routes/settings.ts';
import webhookRoutes from './server/routes/webhooks.ts';
import aiProviderRoutes from './server/routes/aiProviders.ts';
import integrationRoutes from './server/routes/integrations.ts';

async function startServer() {
  if (!Number.isSafeInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT || '(empty)'}. Set PORT to a number between 1 and 65535.`);
  }

  if (config.isProd) {
    if (!getCredentialEncryptionKey()) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY is required in production. Set a stable secret before starting CROX; changing it later will make previously saved credentials unreadable.'
      );
    }

    const productionIndex = path.resolve(process.cwd(), 'dist', 'index.html');
    if (!fs.existsSync(productionIndex)) {
      throw new Error('Production frontend build was not found. Run `npm run build` before `npm start`.');
    }
  }

  const db = initDatabase();
  startScheduler(db);

  const app = express();
  app.set('trust proxy', config.isProd ? 1 : false);

  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: true, limit: '512kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    const enc = getCredentialEncryptionKey();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      capabilities: {
        aiProviderConfigured: Boolean(getGeminiApiKey()),
        smtpConfigured: Boolean(config.smtp.host && config.smtp.user && config.smtp.pass),
        credentialEncryptionConfigured: Boolean(enc),
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/workflows', workflowRoutes);
  app.use('/api/executions', executionRoutes);
  app.use('/api/credentials', credentialRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/nova', novaRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/ai-providers', aiProviderRoutes);
  app.use('/api/integrations', integrationRoutes);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (!config.isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const error = err as { message?: string; status?: number; statusCode?: number; type?: string };
    const status = Number(error.statusCode || error.status || 500);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    const message =
      error.type === 'entity.too.large'
        ? 'Request body exceeds the 512 KB limit.'
        : error.type === 'entity.parse.failed'
          ? 'Request body must contain valid JSON.'
          : config.isProd
            ? 'Internal server error.'
            : error.message || 'Request failed.';

    console.error(`[CROX] ${req.method} ${req.path} failed (${safeStatus}):`, error.message || err);
    res.status(safeStatus).json({ error: message });
  });

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`CROX server running on http://0.0.0.0:${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CROX server:', err);
  process.exit(1);
});
