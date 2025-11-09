const { Queue, Worker } = require('bullmq');
const path = require('path');
const fs = require('fs').promises;
const { renderFromTemplate } = require('../services/renderer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10) };

const queueName = process.env.RENDER_QUEUE_NAME || 'render-jobs';
let _queue = null;

function getQueue() {
  if (_queue) return _queue;
  _queue = new Queue(queueName, { connection });
  return _queue;
}

async function enqueueRenderJob(templatePath, mapping, options = {}) {
  const q = getQueue();
  // If the caller passed an absolute path from the host (Windows), prefer enqueueing
  // a repository-relative path when possible so containerized workers can resolve it.
    try {
      if (templatePath && path.isAbsolute(templatePath)) {
        let rel = path.relative(process.cwd(), templatePath);
        // normalize separators to POSIX so container workers can resolve the path
        rel = String(rel).replace(/\\+/g, '/');
        if (rel && !rel.startsWith('..')) {
          templatePath = rel;
        }
      }
    } catch (e) {
      // ignore
    }
  const data = { templatePath, mapping, options };
  const job = await q.add('render', data, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  return job;
}

function startWorker() {
  console.log('[worker] startWorker() called — building Worker for queue', queueName);
  // attach global handlers to capture unexpected errors
  process.on('uncaughtException', (err) => {
    console.error('[worker] uncaughtException', err && err.stack ? err.stack : err);
  });
  process.on('unhandledRejection', (rp) => {
    console.error('[worker] unhandledRejection', rp && rp.stack ? rp.stack : rp);
  });

  let worker;
  let healthServer = null;
  let processedCount = 0;
  const maxJobs = parseInt(process.env.WORKER_MAX_JOBS || '0', 10); // 0 = unlimited
  const idleSeconds = parseInt(process.env.WORKER_IDLE_TIMEOUT || '0', 10); // 0 = disabled

  // helper to attempt graceful shutdown
  async function attemptGracefulShutdown(reason) {
    try {
      console.log('[worker] attemptGracefulShutdown', reason);
      if (healthServer) try { healthServer.close(); } catch (e) {}
      if (worker) try { await worker.close(); } catch (e) { console.error('[worker] error closing worker', e); }
      if (_queue) try { await _queue.close(); } catch (e) {}
    } catch (e) {
      console.error('[worker] graceful shutdown error', e);
    } finally {
      process.exit(0);
    }
  }

  try {
    worker = new Worker(queueName, async job => {
    const { templatePath, mapping, options } = job.data;
    let tpl;
    if (templatePath) {
      // attempt to read the provided path; if it fails (e.g. host absolute Windows path)
      // try common repository-relative fallbacks (templates/<basename>) so containerized
      // workers can find files enqueued from host paths.
      try {
        tpl = JSON.parse(await fs.readFile(path.resolve(templatePath), 'utf8'));
      } catch (err) {
        // fallback: try basename inside ./templates or project templates dir
  // normalize Windows backslashes so path.basename works on POSIX containers
  const normalized = String(templatePath).replace(/\\/g, '/');
  const base = path.basename(normalized);
        const candidates = [
          path.resolve('./templates', base),
          path.resolve(process.cwd(), 'templates', base),
          path.resolve(__dirname, '..', '..', 'templates', base),
        ];
        let found = false;
        console.log('[worker] templatePath fallback candidates:', candidates);
        for (const c of candidates) {
          try {
            // check existence first for clearer logging
            await fs.access(c);
            console.log('[worker] reading fallback template', c);
            tpl = JSON.parse(await fs.readFile(c, 'utf8'));
            found = true;
            break;
          } catch (e) {
            console.log('[worker] fallback candidate missing or unreadable', c, e && e.code ? e.code : String(e));
            // continue
          }
        }
        if (!found) {
          console.error('[worker] fallback lookup failed for templatePath, candidates tried:', candidates);
          throw err;
        }
      }
    } else if (options && options.template) {
      tpl = options.template;
    } else {
      throw new Error('No template provided');
    }
    const png = await renderFromTemplate(tpl, mapping || {});
    const outPath = path.resolve(options.outDir || './out', `${job.id}.png`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, png);

    // optional S3 upload
    if (process.env.AWS_S3_BUCKET && process.env.AWS_REGION) {
      const s3 = new S3Client({ region: process.env.AWS_REGION });
      const key = options.s3Key || `renders/${job.id}.png`;
      await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: png, ContentType: 'image/png' }));

      // Determine whether to generate a presigned GET URL for the uploaded object.
      // Can be enabled globally via AWS_S3_PRESIGN_URL='true' or per-job via options.presign = true.
      const presignEnabled = (String(process.env.AWS_S3_PRESIGN_URL || '').toLowerCase() === 'true') || Boolean(options.presign);
      const presignExpires = parseInt(process.env.AWS_S3_PRESIGN_EXPIRES || '3600', 10); // seconds

      if (presignEnabled) {
        try {
          const getCmd = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key });
          const url = await getSignedUrl(s3, getCmd, { expiresIn: presignExpires });
          const expiresAt = new Date(Date.now() + presignExpires * 1000).toISOString();
          return { s3: { bucket: process.env.AWS_S3_BUCKET, key, presignedUrl: url, expiresAt } };
        } catch (e) {
          console.error('[worker] failed to generate presigned url', e && e.stack ? e.stack : e);
          // fallback to returning bucket/key info only
          return { s3: { bucket: process.env.AWS_S3_BUCKET, key } };
        }
      }

      return { s3: { bucket: process.env.AWS_S3_BUCKET, key } };
    }

    return { outPath };
  }, { connection });

    worker.on('active', (job) => {
      console.log('[worker] job active', job.id);
    });
    worker.on('completed', (job) => {
      console.log('[worker] job completed', job.id);
      processedCount += 1;
      if (maxJobs > 0 && processedCount >= maxJobs) {
        console.log('[worker] reached maxJobs, shutting down');
        attemptGracefulShutdown('maxJobs');
      }
    });
    worker.on('failed', (job, err) => {
      console.error('[worker] job failed', job && job.id, err && err.stack ? err.stack : err);
    });
    worker.on('stalled', (jobId) => {
      console.warn('[worker] job stalled', jobId);
    });
    worker.on('error', (err) => {
      console.error('[worker] worker error', err && err.stack ? err.stack : err);
    });

    // idle timeout handling
    let idleTimer = null;
    function resetIdleTimer() {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (idleSeconds > 0) {
        idleTimer = setTimeout(() => {
          console.log('[worker] idle timeout reached, shutting down');
          attemptGracefulShutdown('idleTimeout');
        }, idleSeconds * 1000);
      }
    }
    // reset on lifecycle events
    worker.on('completed', resetIdleTimer);
    worker.on('failed', resetIdleTimer);
    worker.on('active', resetIdleTimer);
    // start initial timer if configured
    resetIdleTimer();

  } catch (err) {
    console.error('[worker] failed to create Worker', err && err.stack ? err.stack : err);
    throw err;
  }

  // basic health HTTP server for the worker
  try {
    const http = require('http');
    const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || '9646', 10);
    healthServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', queue: queueName }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    healthServer.listen(healthPort, () => console.log(`Worker health listening on ${healthPort}`));
    async function gracefulShutdown() {
      console.log('Worker shutting down...');
      try {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        if (healthServer) try { healthServer.close(); } catch (e) {}
      } catch (e) {}
      try {
        if (worker) await worker.close();
      } catch (e) {
        console.error('Error closing worker', e);
      }
      try {
        if (_queue) await _queue.close();
      } catch (e) {}
      process.exit(0);
    }

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  } catch (e) {
    console.warn('Failed to start worker health server', e);
  }

  console.log('Render worker started for queue', queueName);
  return worker;
}

module.exports = { enqueueRenderJob, startWorker };

async function closeQueue() {
  if (_queue) {
    try {
      await _queue.close();
    } catch (e) {
      console.error('[queue] closeQueue error', e);
    }
    _queue = null;
  }
}

module.exports = { enqueueRenderJob, startWorker, closeQueue };
