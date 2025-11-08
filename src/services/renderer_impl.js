const { acquirePage, releasePage } = require('./browserPool_impl');
const { buildHtmlForTemplate } = require('./template_to_html_impl');

async function renderFromTemplate(template, mapping) {
  const html = buildHtmlForTemplate(template, mapping);
  const page = await acquirePage();
  try {
    await page.setViewport({ width: template.size.w, height: template.size.h });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // small wait for fonts/images
    await page.waitForTimeout(150);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: template.size.w, height: template.size.h }, type: 'png' });
    return png;
  } finally {
    await releasePage(page);
  }
}

module.exports = { renderFromTemplate };
