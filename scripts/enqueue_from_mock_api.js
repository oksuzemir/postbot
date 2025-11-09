#!/usr/bin/env node
// Smoke test: start a tiny mock API that serves player JSON + avatar image,
// call POST /enqueue/from-api on the local server, poll the job until complete,
// and download the output if available.

const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const MOCK_PLAYER = {
  name: 'Sim Player',
  position: 'CAM',
  overall: 92,
  pace: 88,
  dribbling: 95,
  shooting: 90,
  defence: 45,
  passing: 91,
  physical: 78,
  avatar_url: '/avatar.png'
};

// tiny 1x1 PNG (transparent)
const AVATAR_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const AVATAR_BUFFER = Buffer.from(AVATAR_BASE64, 'base64');

function startMockServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/player') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // serve avatar_url as absolute URL
        const host = server.address();
        const port = host && host.port ? host.port : process.env.MOCK_PORT || 0;
        const base = `http://127.0.0.1:${port}`;
        const payload = Object.assign({}, MOCK_PLAYER, { avatar_url: `${base}/avatar.png` });
        res.end(JSON.stringify(payload));
        return;
      }
      if (req.url === '/avatar.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(AVATAR_BUFFER);
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      console.log('[mock] server listening on', addr);
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { server, url } = await startMockServer();
  try {
    const apiUrl = `${url}/player`;
    console.log('[mock] apiUrl ->', apiUrl);

    const serverUrl = process.env.POSTBOT_SERVER || 'http://127.0.0.1:3000';
    const apiKey = process.env.POSTBOT_API_KEY || process.env.API_KEY || '';

    console.log('[test] calling enqueue/from-api on', serverUrl);
    const body = { apiUrl, templatePath: 'templates/sample_template.json' };
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const resp = await axios.post(`${serverUrl.replace(/\/$/, '')}/enqueue/from-api`, body, { headers });
    console.log('[test] enqueue response:', resp.data);
    const jobId = resp.data && resp.data.jobId;
    if (!jobId) {
      console.error('[test] no jobId returned, aborting');
      return process.exit(1);
    }

    // poll job
    const timeoutMs = 120000; // 2 minutes
    const interval = 2500;
    const start = Date.now();
    let final = null;
    while (Date.now() - start < timeoutMs) {
      try {
        const sj = await axios.get(`${serverUrl.replace(/\/$/, '')}/jobs/${jobId}`, { headers });
        const data = sj.data;
        console.log('[test] job', jobId, 'state=', data.state);
        if (data.state === 'completed') { final = data; break; }
        if (data.state === 'failed') { final = data; break; }
      } catch (e) {
        console.error('[test] poll error', e && e.message);
      }
      await sleep(interval);
    }

    if (!final) {
      console.error('[test] job did not finish within timeout');
      return process.exit(2);
    }

    console.log('[test] final job data:', final);
    if (final.state === 'completed' && final.result) {
      // attempt to download
      if (final.result.outPath) {
        try {
          const parts = String(final.result.outPath).split(/[\\\/]/);
          const fn = parts[parts.length -1];
          const outUrl = `${serverUrl.replace(/\/$/, '')}/out/${encodeURIComponent(fn)}`;
          console.log('[test] downloading output from', outUrl);
          const r = await axios.get(outUrl, { responseType: 'arraybuffer', headers });
          const outDir = path.resolve('./out');
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
          const outPath = path.join(outDir, `${jobId}.png`);
          fs.writeFileSync(outPath, Buffer.from(r.data), 'binary');
          console.log('[test] downloaded output to', outPath);
        } catch (e) {
          console.error('[test] failed to download outPath', e && e.message);
        }
      } else if (final.result.s3 && final.result.s3.presignedUrl) {
        try {
          const urlp = final.result.s3.presignedUrl;
          console.log('[test] downloading presigned url', urlp);
          const r = await axios.get(urlp, { responseType: 'arraybuffer' });
          const outDir = path.resolve('./out');
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
          const outPath = path.join(outDir, `${jobId}.png`);
          fs.writeFileSync(outPath, Buffer.from(r.data), 'binary');
          console.log('[test] downloaded output to', outPath);
        } catch (e) {
          console.error('[test] failed to download presigned url', e && e.message);
        }
      } else {
        console.log('[test] job completed but no outPath/presignedUrl available', final.result);
      }
    } else {
      console.error('[test] job ended with state', final.state, 'reason', final.failedReason || final.result);
    }
  } finally {
    try { server.close(); } catch (e) {}
  }
}

main().catch((e)=>{ console.error(e && e.stack ? e.stack : e); process.exit(1); });
