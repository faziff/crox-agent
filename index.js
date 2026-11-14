
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startServer } = require('./dist/server.cjs');

startServer();
