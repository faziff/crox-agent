require('dotenv/config');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

register('tsx/esm', pathToFileURL(__filename));

console.log('Node version:', process.version);
console.log('Assigned PORT:', process.env.PORT);

(async () => {
  try {
    await import('./server.ts');
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
})();
