require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { renderFromTemplate } = require('./renderer');

const app = express();
app.use(express.json({ limit: '5mb' }));

app.post('/render', async (req, res) => {
  try {
    const { templatePath, mapping, template } = req.body;
    let tpl;
    if (templatePath) {
      const p = path.resolve(templatePath);
      tpl = JSON.parse(await fs.readFile(p, 'utf8'));
    } else if (template) {
      tpl = template;
    } else {
      return res.status(400).json({ error: 'templatePath or template required' });
    }
    const png = await renderFromTemplate(tpl, mapping || {});
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Renderer server listening on ${port}`));

module.exports = app;
