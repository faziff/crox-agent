import 'dotenv/config';
import { register } from 'node:module';

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Register tsx's loader IN THIS SAME PROCESS so we can import server.ts
// directly — no child_process, no missing dist bundle.
register('tsx/esm', import.meta.url);

// IMPORTANT: no top-level "await" here. Hostinger's loader (lsnode.js)
// loads this file with require(), which fails with ERR_REQUIRE_ASYNC_MODULE
// if the module has a top-level await. import() without awaiting it keeps
// this module synchronous from require()'s point of view.
import('./server.ts').catch((err) => {
  console.error('Failed to start CROX server:', err);
  process.exit(1);
});
