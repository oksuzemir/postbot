require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const Redis = require('ioredis');
const cors = require('cors');
const { renderFromTemplate } = require('./renderer');
const browserPool = require('./browserPool');
const { enqueueRenderJob } = require('../queue');
const { Queue } = require('bullmq');
const axios = require('axios');

const queueName = process.env.RENDER_QUEUE_NAME || 'render-jobs';
const queueConnection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10) };
const statusQueue = new Queue(queueName, { connection: queueConnection });

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors());

// Load server-side API presets from env (JSON string). Presets store header name+value
// Example .env: API_PRESETS='{"paidApi":{"header":"Authorization","value":"Bearer ..."}}'
let API_PRESETS = {};
try {
  if (process.env.API_PRESETS) {
    API_PRESETS = JSON.parse(process.env.API_PRESETS);
  }
} catch (e) {
  console.warn('Failed to parse API_PRESETS from env; ignoring', e && e.message);
  API_PRESETS = {};
}

// Development request logger to help diagnose whether browser requests reach the server.
app.use((req, res, next) => {
  try {
    console.log('[INCOMING]', req.method, req.url, 'origin=', req.headers.origin || '-', 'host=', req.headers.host || '-', 'remote=', req.ip || req.connection && req.connection.remoteAddress || '-')
  } catch (e) {
    // ignore logging errors
  }
  next()
})

// Return available API preset names and header keys (do NOT return secret values)
app.get('/api-presets', checkApiKey, (req, res) => {
  try {
    const out = Object.keys(API_PRESETS || {}).map(k => ({ name: k, header: API_PRESETS[k] && API_PRESETS[k].header ? API_PRESETS[k].header : null }));
    return res.json({ presets: out });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Simple unauthenticated debug ping for front-end diagnostics. Returns a small payload
// including the Origin header and remote address so the browser can confirm reachability.
app.get('/debug/ping', (req, res) => {
  try {
    const safeHeaders = { origin: req.headers.origin || null, host: req.headers.host || null }
    return res.json({ ok: true, origin: safeHeaders.origin, host: safeHeaders.host, ip: req.ip || null })
  } catch (e) {
    return res.json({ ok: true })
  }
})

// Simple API key middleware. If no API key is configured, the middleware allows all requests.
function checkApiKey(req, res, next) {
  const configured = process.env.API_KEY || process.env.POSTBOT_API_KEY || process.env.ENQUEUE_API_KEY;
  if (!configured) return next();
  const provided = req.headers['x-api-key'] || req.query.apiKey || req.headers['authorization'];
  if (!provided) return res.status(401).json({ error: 'missing api key' });
  // allow Authorization: Bearer <key>
  const token = typeof provided === 'string' && provided.startsWith('Bearer ') ? provided.split(' ')[1] : provided;
  if (token === configured) return next();
  return res.status(403).json({ error: 'invalid api key' });
}

app.get('/health', async (req, res) => {
  try {
    const client = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10) });
    await client.ping();
    client.disconnect();
    return res.json({ status: 'ok', redis: 'ok' });
  } catch (e) {
    return res.status(503).json({ status: 'degraded', redis: 'down', error: String(e) });
  }
});

app.post('/render', async (req, res) => {
  try {
    const { templatePath, mapping, template } = req.body;
    let tpl;
    if (templatePath) {
      const p = path.resolve(templatePath);
      tpl = JSON.parse(await fs.readFile(p, 'utf8'));
    } else if (template) {
      tpl = template;
    } else {
      return res.status(400).json({ error: 'templatePath or template required' });
    }
    const png = await renderFromTemplate(tpl, mapping || {});
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// Render using admin static mapping (convenience endpoint)
// Body can include optional { templatePath, mappingPath } to override defaults
app.post('/render/admin-static', checkApiKey, async (req, res) => {
  try {
    // Allow passing `template` in the body (JSON object) or `templatePath` to override file.
    let tpl;
    if (req.body && req.body.template) {
      tpl = req.body.template;
    } else {
      const tplPath = req.body && req.body.templatePath ? path.resolve(req.body.templatePath) : path.resolve('templates/sample_template.json');
      const tplRaw = await fs.readFile(tplPath, 'utf8');
      tpl = JSON.parse(tplRaw);
    }

    const mappingPath = req.body && req.body.mappingPath ? path.resolve(req.body.mappingPath) : path.resolve('examples/static_mapping.json');
    const mapRaw = await fs.readFile(mappingPath, 'utf8');
    const mapping = JSON.parse(mapRaw);

    // Render synchronously and return PNG
    const png = await renderFromTemplate(tpl, mapping);
    // Also save to out for convenience
    try {
      await fs.mkdir(outDir, { recursive: true });
      const outFile = path.join(outDir, 'admin_static.png');
      await fs.writeFile(outFile, png);
    } catch (e) {
      console.warn('Failed to write admin_static.png to outDir', e && e.message);
    }

    res.set('Content-Type', 'image/png');
    return res.send(png);
  } catch (e) {
    console.error('[render/admin-static] failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

// Render directly from fetched JSON data using a mapping spec (synchronous)
// Body: { template, data, mappingSpec? }
app.post('/render/from-data', checkApiKey, async (req, res) => {
  try {
    const { template, data, mappingSpec } = req.body || {};
    if (!template) return res.status(400).json({ error: 'template required' });
    if (!data) return res.status(400).json({ error: 'data required' });

    // helper: get nested value by dot path
    function getByPath(obj, p) {
      if (!p) return undefined;
      const parts = String(p).split('.');
      let cur = obj;
      for (const part of parts) {
        if (cur == null) return undefined;
        cur = cur[part];
      }
      return cur;
    }

    // Convert external image URL to data URL (server-side)
    async function urlToDataUrl(url) {
      if (!url || typeof url !== 'string') return null;
      try {
        const r = await axios.get(url, { responseType: 'arraybuffer' });
        const ct = r.headers['content-type'] || 'image/png';
        const b64 = Buffer.from(r.data, 'binary').toString('base64');
        return `data:${ct};base64,${b64}`;
      } catch (e) {
        console.error('[render/from-data] failed to fetch image', url, e && e.message);
        return null;
      }
    }

    const defaultSpec = mappingSpec || {
      PLAYER_NAME: 'name',
      POSITION: 'position',
      OVERALL: 'overall',
      PACE: 'pace',
      DRIBBLING: 'dribbling',
      SHOOTING: 'shooting',
      DEFENCE: 'defence',
      PASSING: 'passing',
      PHYSICAL: 'physical',
      IMG_AVATAR: 'avatar_url'
    };

    const mapping = {};
    for (const [token, pathStr] of Object.entries(defaultSpec)) {
      const v = getByPath(data, pathStr);
      if (v == null) continue;
      if (typeof v === 'string' && /^https?:\/\//i.test(v) && String(token).toUpperCase().startsWith('IMG')) {
        const du = await urlToDataUrl(v);
        if (du) mapping[token] = du;
      } else {
        mapping[token] = String(v);
      }
    }

    // Render and return PNG
    const png = await renderFromTemplate(template, mapping);
    res.set('Content-Type', 'image/png');
    return res.send(png);
  } catch (e) {
    console.error('[render/from-data] failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

// Templates management: list, create, delete
app.get('/templates', checkApiKey, async (req, res) => {
  try {
    const dir = path.resolve('templates');
    const files = await fs.readdir(dir);
    const out = [];
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), 'utf8');
        out.push({ name: f, template: JSON.parse(raw) });
      } catch (e) {
        out.push({ name: f, error: String(e) });
      }
    }
    return res.json({ templates: out });
  } catch (e) {
    console.error('List templates failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/templates', checkApiKey, async (req, res) => {
  try {
    const { name, template } = req.body || {};
    if (!name || !template) return res.status(400).json({ error: 'name and template required' });
    // sanitize name
    const base = path.basename(name).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const filename = base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
    const dir = path.resolve('templates');
    await fs.mkdir(dir, { recursive: true });
    const full = path.join(dir, filename);
    await fs.writeFile(full, JSON.stringify(template, null, 2), 'utf8');
    return res.json({ saved: filename });
  } catch (e) {
    console.error('Save template failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.delete('/templates/:name', checkApiKey, async (req, res) => {
  try {
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: 'name required' });
    const filename = path.basename(name);
    const full = path.resolve('templates', filename);
    await fs.unlink(full);
    return res.json({ deleted: filename });
  } catch (e) {
    console.error('Delete template failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

// Enqueue endpoint: accepts templatePath or template + mapping
// Enqueue endpoint: accepts templatePath or template + mapping
app.post('/enqueue', checkApiKey, async (req, res) => {
  try {
    const { templatePath, template, mapping, options } = req.body || {};
    const enqueueOptions = Object.assign({}, options || {});
    if (template) {
      enqueueOptions.template = template;
    }
    const job = await enqueueRenderJob(templatePath, mapping || {}, enqueueOptions);
    return res.json({ jobId: job.id, status: 'queued' });
  } catch (e) {
    console.error('Enqueue failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

// Enqueue from upstream API: fetch JSON from an API, map fields into template tokens,
// convert image URLs to data URLs and enqueue the render job.
// Request body: { apiUrl, templatePath?, template?, mappingSpec? }
// mappingSpec is an object where keys are template token names and values are dot-paths into the API JSON.
app.post('/enqueue/from-api', checkApiKey, async (req, res) => {
  try {
    const { apiUrl, templatePath, template, mappingSpec } = req.body || {};
    if (!apiUrl) return res.status(400).json({ error: 'apiUrl is required' });

    const apiResp = await axios.get(apiUrl, { responseType: 'json' });
    const data = apiResp.data;

    // helper: get nested value by dot path
    function getByPath(obj, p) {
      if (!p) return undefined;
      const parts = String(p).split('.');
      let cur = obj;
      for (const part of parts) {
        if (cur == null) return undefined;
        cur = cur[part];
      }
      return cur;
    }

    // Convert external image URL to data URL (server-side)
    async function urlToDataUrl(url) {
      if (!url || typeof url !== 'string') return null;
      try {
        const r = await axios.get(url, { responseType: 'arraybuffer' });
        const ct = r.headers['content-type'] || 'image/png';
        const b64 = Buffer.from(r.data, 'binary').toString('base64');
        return `data:${ct};base64,${b64}`;
      } catch (e) {
        console.error('[enqueue/from-api] failed to fetch image', url, e && e.message);
        return null;
      }
    }

    // Default mapping spec for common player fields if none provided
    const defaultSpec = mappingSpec || {
      PLAYER_NAME: 'name',
      POSITION: 'position',
      OVERALL: 'overall',
      PACE: 'pace',
      DRIBBLING: 'dribbling',
      SHOOTING: 'shooting',
      DEFENCE: 'defence',
      PASSING: 'passing',
      PHYSICAL: 'physical',
      IMG_AVATAR: 'avatar_url'
    };

    const mapping = {};
    // build mapping by following mappingSpec
    for (const [token, pathStr] of Object.entries(defaultSpec)) {
      const v = getByPath(data, pathStr);
      if (v == null) continue;
      // If the value looks like a URL and token suggests image, convert
      if (typeof v === 'string' && /^https?:\/\//i.test(v) && String(token).toUpperCase().startsWith('IMG')) {
        const du = await urlToDataUrl(v);
        if (du) mapping[token] = du;
      } else {
        mapping[token] = String(v);
      }
    }

    const enqueueOptions = {};
    if (template) enqueueOptions.template = template;

    const job = await enqueueRenderJob(templatePath, mapping, enqueueOptions);
    return res.json({ jobId: job.id, status: 'queued', mappingPreview: Object.keys(mapping) });
  } catch (e) {
    console.error('[enqueue/from-api] failed', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: String(e) });
  }
});

// Job status endpoint: GET /jobs/:id
// Job status endpoint: GET /jobs/:id

// Simple in-memory cache for fetch-proxy results (keyed by url+headers)
const fetchCache = new Map();
const FETCH_CACHE_TTL = Math.max(0, parseInt(process.env.FETCH_CACHE_TTL || '60', 10));

// Proxy endpoint to fetch remote APIs server-side (prevents exposing API keys to the browser)
// Request body: { apiUrl, headers?, useMock?, mockName?, forceFetch? }
app.post('/fetch-proxy', checkApiKey, async (req, res) => {
  try {
    const { apiUrl, headers, useMock, mockName, forceFetch, presetName } = req.body || {};

    // If caller explicitly requested a mock, return it from examples/mocks
    if (useMock) {
      if (!mockName) return res.status(400).json({ ok: false, error: 'mockName required when useMock is true' });
      const mockPath = path.resolve('examples', 'mocks', mockName);
      try {
        const raw = await fs.readFile(mockPath, 'utf8');
        return res.json({ ok: true, source: 'mock', data: JSON.parse(raw) });
      } catch (e) {
        return res.status(404).json({ ok: false, error: 'mock not found: ' + mockName });
      }
    }

    if (!apiUrl) return res.status(400).json({ ok: false, error: 'apiUrl is required' });

    // Merge preset header (server-side) if requested. Do not log secret values.
    let mergedHeaders = Object.assign({}, headers || {});
    if (presetName && API_PRESETS && API_PRESETS[presetName]) {
      const preset = API_PRESETS[presetName];
      if (preset && preset.header && preset.value) {
        mergedHeaders[preset.header] = preset.value;
        console.log('[fetch-proxy] using preset', presetName);
      }
    }

    // For cache key, avoid embedding secret values. Use presetName marker instead.
    const cacheKeyHeaders = Object.assign({}, headers || {});
    if (presetName) cacheKeyHeaders.__preset = presetName;
    const cacheKey = apiUrl + '|' + JSON.stringify(cacheKeyHeaders || {});
    if (!forceFetch && FETCH_CACHE_TTL > 0 && fetchCache.has(cacheKey)) {
      const entry = fetchCache.get(cacheKey);
      if (Date.now() - entry.ts < FETCH_CACHE_TTL * 1000) {
        return res.json({ ok: true, source: 'cache', data: entry.data });
      }
      fetchCache.delete(cacheKey);
    }

    // Fetch the remote API JSON
    const axiosCfg = {
      method: 'get',
      url: apiUrl,
      headers: mergedHeaders || {},
      responseType: 'json',
      timeout: parseInt(process.env.FETCH_TIMEOUT_MS || '15000', 10),
      maxContentLength: parseInt(process.env.FETCH_MAX_BYTES || String(10 * 1024 * 1024), 10)
    };
    const resp = await axios(axiosCfg);
    const data = resp && resp.data !== undefined ? resp.data : null;

    // Cache the response for a short period to avoid repeated paid API calls
    try {
      if (FETCH_CACHE_TTL > 0) fetchCache.set(cacheKey, { ts: Date.now(), data });
    } catch (e) {
      // ignore cache-set failures
    }

    return res.json({ ok: true, source: 'live', data });
  } catch (e) {
    console.error('[fetch-proxy] failed', e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// CRUD for saved mocks used for development/testing
// POST /mocks  { name, json } -> saves examples/mocks/<name>.json
app.post('/mocks', checkApiKey, async (req, res) => {
  try {
    const { name, json } = req.body || {};
    if (!name || !json) return res.status(400).json({ error: 'name and json required' });
    const base = path.basename(name).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const filename = base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
    const dir = path.resolve('examples', 'mocks');
    await fs.mkdir(dir, { recursive: true });
    const full = path.join(dir, filename);
    await fs.writeFile(full, JSON.stringify(json, null, 2), 'utf8');
    return res.json({ saved: filename });
  } catch (e) {
    console.error('Save mock failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/mocks', checkApiKey, async (req, res) => {
  try {
    const dir = path.resolve('examples', 'mocks');
    const files = await fs.readdir(dir).catch(() => []);
    const out = files.filter(f => f.toLowerCase().endsWith('.json'));
    return res.json({ mocks: out });
  } catch (e) {
    console.error('List mocks failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/mocks/:name', checkApiKey, async (req, res) => {
  try {
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: 'name required' });
    const filename = path.basename(name);
    const full = path.resolve('examples', 'mocks', filename);
    const raw = await fs.readFile(full, 'utf8');
    return res.json({ json: JSON.parse(raw) });
  } catch (e) {
    console.error('Get mock failed', e);
    return res.status(404).json({ error: 'mock not found', detail: String(e) });
  }
});

// Delete a mock: DELETE /mocks/:name
app.delete('/mocks/:name', checkApiKey, async (req, res) => {
  try {
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: 'name required' });
    const filename = path.basename(name);
    const full = path.resolve('examples', 'mocks', filename);
    await fs.unlink(full);
    return res.json({ deleted: filename });
  } catch (e) {
    console.error('Delete mock failed', e);
    return res.status(500).json({ error: 'delete failed', detail: String(e) });
  }
});

// Update a mock: PUT /mocks/:name  body: { newName?, json? }
app.put('/mocks/:name', checkApiKey, async (req, res) => {
  try {
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: 'name required' });
    const filename = path.basename(name);
    const full = path.resolve('examples', 'mocks', filename);

    const { newName, json } = req.body || {};
    // If json provided, overwrite contents
    if (json !== undefined) {
      await fs.writeFile(full, JSON.stringify(json, null, 2), 'utf8');
    }
    // If newName provided, rename file
    if (newName) {
      const base = path.basename(newName).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const newFilename = base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
      const newFull = path.resolve('examples', 'mocks', newFilename);
      await fs.rename(full, newFull);
      return res.json({ renamed: { from: filename, to: newFilename } });
    }
    return res.json({ updated: filename });
  } catch (e) {
    console.error('Update mock failed', e);
    return res.status(500).json({ error: 'update failed', detail: String(e) });
  }
});
app.get('/jobs/:id', checkApiKey, async (req, res) => {
  try {
    const id = req.params.id;
    const job = await statusQueue.getJob(id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    const state = await job.getState();
    const result = job.returnvalue || null;
    const failedReason = job.failedReason || null;
    const attemptsMade = job.attemptsMade || 0;
    return res.json({ id: job.id, state, result, failedReason, attemptsMade });
  } catch (e) {
    console.error('Job status failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

// List recent jobs across common states
// List recent jobs across common states
app.get('/jobs', checkApiKey, async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page || '0', 10));
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit || '50', 10)));
    const from = page * limit;
    const to = from + limit - 1;
    const states = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const jobs = await statusQueue.getJobs(states, from, to);
    const out = await Promise.all(jobs.map(async j => {
      const state = await j.getState();
      return { id: j.id, name: j.name, state, attemptsMade: j.attemptsMade, failedReason: j.failedReason };
    }));
    return res.json({ jobs: out, page, limit });
  } catch (e) {
    console.error('List jobs failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

// Serve rendered output files (protected by API key). OUT_DIR env or ./out
const outDir = path.resolve(process.env.OUT_DIR || './out');
app.use('/out', checkApiKey, express.static(outDir));

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Renderer server listening on ${port}`));

// Job action endpoints: retry and remove
app.post('/jobs/:id/retry', checkApiKey, async (req, res) => {
  try {
    const id = req.params.id;
    const job = await statusQueue.getJob(id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    try {
      await job.retry();
      return res.json({ id: job.id, status: 'retrying' });
    } catch (err) {
      console.error('Retry failed', err);
      return res.status(500).json({ error: String(err) });
    }
  } catch (e) {
    console.error('Retry endpoint failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.post('/jobs/:id/remove', checkApiKey, async (req, res) => {
  try {
    const id = req.params.id;
    const job = await statusQueue.getJob(id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    try {
      await job.remove();
      return res.json({ id: job.id, status: 'removed' });
    } catch (err) {
      console.error('Remove failed', err);
      return res.status(500).json({ error: String(err) });
    }
  } catch (e) {
    console.error('Remove endpoint failed', e);
    return res.status(500).json({ error: String(e) });
  }
});

async function shutdown() {
  console.log('Server shutting down...');
  try {
    if (browserPool && browserPool.shutdown) await browserPool.shutdown();
  } catch (err) {
    console.error('Error shutting down browser pool', err);
  }
  try {
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    // fallback
    setTimeout(() => process.exit(1), 10000);
  } catch (err) {
    console.error('Error closing server', err);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
