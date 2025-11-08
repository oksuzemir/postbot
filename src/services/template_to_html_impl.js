function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildLayerHtml(layer, mapping) {
  const left = layer.x || 0;
  const top = layer.y || 0;
  const w = layer.w || 0;
  const h = layer.h || 0;
  const rot = layer.rotation || 0;
  const styleBase = `position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);overflow:hidden;`;
  if (layer.type === 'image') {
    const key = layer.key;
    const src = key && mapping[key] ? mapping[key] : (layer.dataUri || '');
    const isCircle = layer.isEllipse || layer.shape === 'circle';
    const br = isCircle ? '50%' : (layer.cornerRadius ? `${layer.cornerRadius}px` : '0');
    return `<img src="${esc(src)}" style="${styleBase}object-fit:cover;border-radius:${br};width:100%;height:100%;" />`;
  }
  if (layer.type === 'text') {
    const key = layer.key;
    const text = key && mapping[key] !== undefined ? mapping[key] : (layer.originalText || '');
    const fontSize = layer.font && layer.font.size ? layer.font.size : 16;
    const color = (layer.font && layer.font.color) || '#000000';
    return `<div style="${styleBase}font-size:${fontSize}px;color:${esc(color)};display:flex;align-items:center;justify-content:flex-start;padding:4px;">${esc(text)}</div>`;
  }
  // fallback rectangle / line
  if (layer.type === 'rect' || layer.type === 'line') {
    const color = layer.color || 'transparent';
    return `<div style="${styleBase}background:${esc(color)}"></div>`;
  }
  return '';
}

function buildHtmlForTemplate(template, mapping) {
  const size = template.size || { w: 1080, h: 1080 };
  const bg = template.backgroundImage ? `background-image:url('${template.backgroundImage}');background-size:cover;background-position:center;` : '';
  const layersHtml = (template.layers || []).map(l => buildLayerHtml(l, mapping)).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}#render-root{position:relative;width:${size.w}px;height:${size.h}px;${bg}}</style></head><body><div id="render-root">${layersHtml}</div></body></html>`;
}

module.exports = { buildHtmlForTemplate };
