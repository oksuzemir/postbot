const { enqueueRenderJob } = require('../src/queue');
const path = require('path');

async function run() {
  const tpl = path.resolve(__dirname, '../templates/sample_template.json');
  const mapping = require('../examples/mapping.json');
  const job = await enqueueRenderJob(tpl, mapping, { outDir: './out' });
  console.log('Enqueued job id', job.id);
}

run().catch(e=>{ console.error(e); process.exit(1); });
