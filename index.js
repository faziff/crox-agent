import 'dotenv/config';
import { register } from 'node:module';

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Register tsx's loader IN THIS SAME PROCESS so we can import server.ts
// directly — no child_process, no missing dist bundle, no separate
// process that Hostinger's listen() monitor can't see into.
register('tsx/esm', import.meta.url);

await import('./server.ts');
