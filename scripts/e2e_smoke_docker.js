#!/usr/bin/env node
// End-to-end smoke runner using docker compose.
// 1) docker compose up -d
// 2) wait for server /health
// 3) run scripts/enqueue_from_mock_api.js
// 4) docker compose down

const { exec } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execp = util.promisify(exec);

const SERVER_URL = process.env.POSTBOT_SERVER || 'http://127.0.0.1:3000';
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS || 180000); // 3 minutes
const POLL_INTERVAL = 2000;
const KEEP_ON_FAILURE = (process.env.SKIP_TEARDOWN_ON_FAILURE || process.env.KEEP_ON_FAILURE || '').toString().toLowerCase() === 'true' || process.env.SKIP_TEARDOWN_ON_FAILURE === '1' || process.env.KEEP_ON_FAILURE === '1';
const LOG_BASE_DIR = process.env.E2E_LOG_BASE_DIR || path.resolve(process.cwd(), 'logs');

function log(...args) { console.log('[e2e]', ...args); }

async function sh(cmd) {
  log('run>', cmd);
  const { stdout, stderr } = await execp(cmd, { maxBuffer: 10 * 1024 * 1024 });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { stdout, stderr };
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(`${url.replace(/\/$/, '')}/health`, { timeout: 2000 });
      if (res.status === 200) return true;
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  return false;
}

async function main(){
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(LOG_BASE_DIR, `e2e-${iso}`);
  await fs.promises.mkdir(logDir, { recursive: true }).catch(()=>{});
  try {
    // Bring up services
    await sh('docker compose up -d');

    log('waiting for server health at', `${SERVER_URL}/health`);
    const ok = await waitForServer(SERVER_URL, TIMEOUT);
    if (!ok) throw new Error('server /health did not become ready in time');

    log('server ready — running enqueue_from_mock_api test');
    // Run the existing mock enqueue script
    const scriptPath = path.resolve(__dirname, 'enqueue_from_mock_api.js');
    // use POSTBOT_SERVER env for the child process
    const cmd = `node ${JSON.stringify(scriptPath)}`;
    // run and forward output
    await sh(cmd);

    log('test finished — collecting logs and bringing containers down');
    await captureLogs(logDir);
    await sh('docker compose down');
    log('done — logs saved to', logDir);
  } catch (e) {
    console.error('[e2e] error:', e && e.message ? e.message : e);
    try { await captureLogs(logDir); } catch (er) { console.error('[e2e] failed to capture logs', er && er.message); }
    if (KEEP_ON_FAILURE) {
      console.log('[e2e] SKIP_TEARDOWN is set — leaving containers running for debugging. Logs saved to', logDir);
    } else {
      try { await sh('docker compose down'); } catch (er) { console.error('[e2e] error during cleanup', er && er.message); }
    }
    process.exit(1);
  }
}

async function captureLogs(logDir) {
  try {
    await fs.promises.mkdir(logDir, { recursive: true });
  } catch (e) {}
  try {
    const all = await execp('docker compose logs --no-color');
    await fs.promises.writeFile(path.join(logDir, 'all.log'), all.stdout || '', 'utf8');
  } catch (e) {
    try { await fs.promises.writeFile(path.join(logDir, 'all.log'), `error collecting all logs: ${e.message}\n`); } catch(_){}
  }
  try {
    const servicesOut = await execp('docker compose ps --services');
    const services = (servicesOut.stdout || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    for (const s of services) {
      try {
        const out = await execp(`docker compose logs --no-color ${s}`);
        await fs.promises.writeFile(path.join(logDir, `${s}.log`), out.stdout || '', 'utf8');
      } catch (e) {
        await fs.promises.writeFile(path.join(logDir, `${s}.log`), `error collecting logs for ${s}: ${e.message}\n`);
      }
    }
  } catch (e) {
    try { await fs.promises.writeFile(path.join(logDir, 'services.txt'), `error listing services: ${e.message}\n`); } catch(_){}
  }
}

main();
