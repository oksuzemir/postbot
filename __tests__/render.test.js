jest.setTimeout(30000);
const fs = require('fs');
const path = require('path');

// Ensure puppeteer path if available
if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  const winPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const linuxPath = '/usr/bin/google-chrome';
  if (fs.existsSync(winPath)) process.env.PUPPETEER_EXECUTABLE_PATH = winPath;
  else if (fs.existsSync(linuxPath)) process.env.PUPPETEER_EXECUTABLE_PATH = linuxPath;
}

const { renderFromTemplate } = require('../src/services/renderer_impl');
const { shutdown } = require('../src/services/browserPool_impl');

test('render produces a non-empty PNG file', async () => {
  const tplRaw = fs.readFileSync(path.resolve('templates/sample_template.json'), 'utf8');
  const template = JSON.parse(tplRaw);
  const mappingRaw = fs.readFileSync(path.resolve('examples/static_mapping.json'), 'utf8');
  const mapping = JSON.parse(mappingRaw);

  const png = await renderFromTemplate(template, mapping);
  const outPath = path.resolve('out', 'jest_render.png');
  fs.writeFileSync(outPath, png);
  const st = fs.statSync(outPath);
  expect(st.size).toBeGreaterThan(0);

  // cleanup: close browser
  await shutdown();
});
