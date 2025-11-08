const fs = require('fs').promises;
const path = require('path');
const { renderFromTemplate } = require('../src/renderer');

async function run() {
  try {
    const tplPath = path.resolve(__dirname, '../templates/sample_template.json');
    const tplRaw = await fs.readFile(tplPath, 'utf8');
    const tpl = JSON.parse(tplRaw);
    const mapPath = path.resolve(__dirname, '../examples/mapping.json');
    const mapRaw = await fs.readFile(mapPath, 'utf8');
    const mapping = JSON.parse(mapRaw);
    // If mapping has empty PLAYER_PHOTO try to skip image but still render
    const png = await renderFromTemplate(tpl, mapping);
    if (!png || png.length < 100) {
      console.error('Render returned empty or too-small buffer');
      process.exit(2);
    }
    console.log('CI check: render succeeded, bytes=', png.length);
    process.exit(0);
  } catch (e) {
    console.error('CI check failed:', e);
    process.exit(3);
  }
}

run();
