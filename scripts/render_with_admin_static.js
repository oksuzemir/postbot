#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { renderFromTemplate } = require('../src/renderer');

async function main() {
  const argv = require('minimist')(process.argv.slice(2));
  const templatePath = argv.template || 'templates/sample_template.json';
  const mappingPath = argv.mapping || 'examples/static_mapping.json';
  const out = argv.out || 'out/admin_static.png';

  const tplRaw = await fs.readFile(path.resolve(templatePath), 'utf8');
  const tpl = JSON.parse(tplRaw);
  const mapRaw = await fs.readFile(path.resolve(mappingPath), 'utf8');
  const mapping = JSON.parse(mapRaw);

  if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
    console.error('Please set PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium binary (e.g. on Windows: "/c/Program Files/Google/Chrome/Application/chrome.exe").');
    console.error('Or run this script inside the Docker worker where Chrome is installed.');
    process.exit(2);
  }

  console.log('Rendering template', templatePath, 'with mapping', mappingPath);
  const png = await renderFromTemplate(tpl, mapping);
  await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await fs.writeFile(path.resolve(out), png);
  console.log('Wrote', out);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
