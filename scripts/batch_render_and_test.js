#!/usr/bin/env node
// Render multiple mapping variations, save HTML previews and PNGs, assert outputs exist and non-zero size.

const fs = require('fs');
const path = require('path');
const { buildHtmlForTemplate } = require('../src/services/template_to_html_impl');
const { renderFromTemplate } = require('../src/services/renderer_impl');

const outDir = path.resolve('./out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ensure puppeteer has an executable path when using puppeteer-core
if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  const winPath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const linuxPath = '/usr/bin/google-chrome';
  if (fs.existsSync(winPath)) process.env.PUPPETEER_EXECUTABLE_PATH = winPath;
  else if (fs.existsSync(linuxPath)) process.env.PUPPETEER_EXECUTABLE_PATH = linuxPath;
}

const tplRaw = fs.readFileSync(path.resolve('templates/sample_template.json'), 'utf8');
const template = JSON.parse(tplRaw);

function svgDataUri(circleColor, w=256, h=256, text=''){
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${circleColor}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='#fff'>${text}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const base = {
  PLAYER_NAME: 'Static Player',
  POSITION: 'CAM',
  OVERALL: '92',
  PACE: '88',
  DRIBBLING: '95',
  SHOOTING: '90',
  PASSING: '91',
  DEFENCE: '45',
  PHYSICAL: '78'
};

const variants = [
  { name: 'var1', extras: { AVATAR: svgDataUri('#1f77b4','256','256','P1'), FLAG: svgDataUri('#ff7f0e','64','40','F1'), CREST: svgDataUri('#2ca02c','64','64','C1') } },
  { name: 'var2', extras: { AVATAR: svgDataUri('#d62728','256','256','P2'), FLAG: svgDataUri('#9467bd','64','40','F2'), CREST: svgDataUri('#8c564b','64','64','C2') } },
  { name: 'var3', extras: { AVATAR: svgDataUri('#ffbb78','256','256','P3'), FLAG: svgDataUri('#e377c2','64','40','F3'), CREST: svgDataUri('#7f7f7f','64','64','C3') } }
];

async function run() {
  for (const v of variants) {
    const mapping = Object.assign({}, base, v.extras);
    const html = buildHtmlForTemplate(template, mapping);
    const htmlPath = path.join(outDir, `${v.name}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('Wrote HTML preview to', htmlPath);

    const pngBuf = await renderFromTemplate(template, mapping);
    const pngPath = path.join(outDir, `${v.name}.png`);
    fs.writeFileSync(pngPath, pngBuf);
    console.log('Wrote PNG to', pngPath);

    const stat = fs.statSync(pngPath);
    if (!stat.size || stat.size === 0) {
      console.error('Rendered file is empty:', pngPath);
      process.exit(2);
    }
  }
  console.log('All variants rendered successfully. Previews and images saved to', outDir);
}

run().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
