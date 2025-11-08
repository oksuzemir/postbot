#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { renderFromTemplate } = require('../src/renderer');

async function main() {
  const argv = require('minimist')(process.argv.slice(2));
  const templatePath = argv.template;
  const mappingPath = argv.mapping;
  const out = argv.out || 'out.png';
  if (!templatePath) {
    console.error('Usage: --template path --mapping path --out out.png');
    process.exit(2);
  }
  const tplRaw = await fs.readFile(path.resolve(templatePath), 'utf8');
  const tpl = JSON.parse(tplRaw);
  let mapping = {};
  if (mappingPath) {
    const mapRaw = await fs.readFile(path.resolve(mappingPath), 'utf8');
    mapping = JSON.parse(mapRaw);
  }
  const png = await renderFromTemplate(tpl, mapping);
  await fs.writeFile(path.resolve(out), png);
  console.log('Wrote', out);
}

main().catch(e => { console.error(e); process.exit(1); });
