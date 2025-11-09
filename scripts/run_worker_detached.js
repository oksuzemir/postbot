#!/usr/bin/env node
// Spawn the start_worker.js script in a detached child so it won't get SIGINT when this terminal exits.
const cp = require('child_process');
const fs = require('fs');

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || process.argv[2] || '';
if (!chrome) {
  console.error('Usage: PUPPETEER_EXECUTABLE_PATH="/path/to/chrome" node scripts/run_worker_detached.js');
  process.exit(2);
}

const env = Object.assign({}, process.env, { PUPPETEER_EXECUTABLE_PATH: chrome });
const child = cp.spawn(process.execPath, ['scripts/start_worker.js'], {
  detached: true,
  stdio: 'ignore',
  env,
});

child.unref();

try { fs.writeFileSync('.worker.pid', String(child.pid)); } catch (e) {}
console.log('Worker started detached with pid', child.pid);
