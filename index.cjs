require('dotenv/config');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Register tsx's ESM loader so the dynamic import() below can run server.ts
// directly, in this same process.
register('tsx/esm', pathToFileURL(__filename));

console.log('Node version:', process.version);
console.log('Assigned PORT:', process.env.PORT);

// This file is plain CommonJS (.cjs), so Hostinger's require()-based wrapper
// loads it with zero ambiguity. The await below is inside an async function,
// NOT at the top level of the module — that's what avoids
// ERR_REQUIRE_ASYNC_MODULE.
(async () => {
  try {
    await import('./server.ts');
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
})();
