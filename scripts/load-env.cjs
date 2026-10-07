const { loadEnvFile } = require('node:process');
const { resolve } = require('node:path');
try { loadEnvFile(resolve(__dirname, '../.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
