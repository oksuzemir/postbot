const { enqueueRenderJob, closeQueue } = require('../src/queue');
const path = require('path');

async function run() {
  const tpl = path.resolve(__dirname, '../templates/sample_template.json');
  const mapping = require('../examples/mapping.json');
  const job = await enqueueRenderJob(tpl, mapping, { outDir: './out' });
  console.log('Enqueued job id', job.id);
  // Close the queue connection so the process can exit cleanly (short-lived script)
  try {
    await closeQueue();
  } catch (e) {
    // swallow
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
