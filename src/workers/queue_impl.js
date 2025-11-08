const { Queue, Worker } = require('bullmq');
const path = require('path');
const fs = require('fs').promises;
const { renderFromTemplate } = require('../services/renderer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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
  const data = { templatePath, mapping, options };
  const job = await q.add('render', data, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  return job;
}

function startWorker() {
  const worker = new Worker(queueName, async job => {
    const { templatePath, mapping, options } = job.data;
    let tpl;
    if (templatePath) {
      tpl = JSON.parse(await fs.readFile(path.resolve(templatePath), 'utf8'));
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
      return { s3: { bucket: process.env.AWS_S3_BUCKET, key } };
    }

    return { outPath };
  }, { connection });

  worker.on('failed', (job, err) => {
    console.error('Job failed', job.id, err);
  });

  console.log('Render worker started for queue', queueName);
  return worker;
}

module.exports = { enqueueRenderJob, startWorker };
