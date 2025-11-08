/// <reference types="@figma/plugin-typings" />
/*
  Apply mapping (data:image/... base64) to selected nodes.
  - Applies image fills with scaleMode: 'FILL' so Figma centers & crops automatically.
  - Preserves corner radius / ellipse shape by applying fills directly.
  - Falls back to creating an overlay (rect/ellipse) with same size/rotation/corner radius if fills can't be set.
  - Also supports exporting selected frame to a template JSON (backgroundImage, layers, etc.).
*/

figma.showUI(__html__, { width: 720, height: 600 });

/* ---------- Types & helpers ---------- */
type FontSpec = { family: string; style: string | number; size: number };
type CornerRadii = {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
};

type ExportedTemplate = {
  template_id: string;
  version: number;
  size: { w: number; h: number };
  fonts: FontSpec[];
  layers: any[];
  metadata: {
    exportedAt: string;
    frameId: string;
    backgroundTextHidden?: boolean;
  };
  backgroundImage?: string;
  neonBorder?: boolean | string;
};

type LayerOut = {
  type: string;
  name: string;
  key?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  originalText?: string;
  font?: any;
  shape?: string;
  isEllipse?: boolean;
  cornerRadius?: number;
  cornerRadii?: CornerRadii;
  dataUri?: string;
  color?: string;
};

type Mapping = { [k: string]: string };

function transformPoint(mat: number[][], x: number, y: number) {
  const nx = mat[0][0] * x + mat[0][1] * y + mat[0][2];
  const ny = mat[1][0] * x + mat[1][1] * y + mat[1][2];
  return { x: nx, y: ny };
}

function getAbsoluteBBox(node: SceneNode): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  try {
    const mat = (node as any).absoluteTransform as [
      [number, number, number],
      [number, number, number]
    ];
    const w = (node as any).width || 0;
    const h = (node as any).height || 0;
    const p1 = transformPoint(mat as any, 0, 0);
    const p2 = transformPoint(mat as any, w, 0);
    const p3 = transformPoint(mat as any, 0, h);
    const p4 = transformPoint(mat as any, w, h);
    const xs = [p1.x, p2.x, p3.x, p4.x];
    const ys = [p1.y, p2.y, p3.y, p4.y];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      x: Math.round(minX),
      y: Math.round(minY),
      w: Math.round(maxX - minX),
      h: Math.round(maxY - minY),
    };
  } catch (e) {
    return {
      x: Math.round((node as any).x || 0),
      y: Math.round((node as any).y || 0),
      w: Math.round((node as any).width || 0),
      h: Math.round((node as any).height || 0),
    };
  }
}

function base64Encode(bytesInput: Uint8Array | ArrayBuffer): string {
  const bytes =
    bytesInput instanceof ArrayBuffer ? new Uint8Array(bytesInput) : bytesInput;
  const lookup =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const a = bytes[i++] || 0;
    const b = i < len ? bytes[i++] : 0;
    const c = i < len ? bytes[i++] : 0;
    const triple = (a << 16) + (b << 8) + c;
    result += lookup[(triple >> 18) & 0x3f];
    result += lookup[(triple >> 12) & 0x3f];
    result += i - 2 < len ? lookup[(triple >> 6) & 0x3f] : "=";
    result += i - 1 < len ? lookup[triple & 0x3f] : "=";
  }
  return result;
}

/* Color helpers */
function colorFromFills(
  fills: ReadonlyArray<Paint> | PluginAPI["mixed"]
): string {
  if (!fills || fills === figma.mixed) return "#FFFFFF";
  const fill = fills[0] as SolidPaint | undefined;
  if (!fill) return "#FFFFFF";
  if (fill.type === "SOLID") {
    const { r, g, b } = fill.color;
    return (
      "#" +
      [r, g, b]
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, "0")
        )
        .join("")
    );
  }
  return "#FFFFFF";
}
function colorFromStrokes(
  strokes: ReadonlyArray<Paint> | PluginAPI["mixed"]
): string {
  if (!strokes || strokes === figma.mixed) return "#FFFFFF";
  const s = (strokes as Paint[])[0] as SolidPaint | undefined;
  if (!s) return "#FFFFFF";
  if (s.type === "SOLID") {
    const { r, g, b } = s.color;
    return (
      "#" +
      [r, g, b]
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, "0")
        )
        .join("")
    );
  }
  return "#FFFFFF";
}

/* circleCheck helper */
function circleCheck(rect: RectangleNode): boolean {
  return (
    typeof rect.cornerRadius === "number" &&
    Math.abs(rect.cornerRadius - rect.width / 2) < 0.1 &&
    Math.abs(rect.cornerRadius - rect.height / 2) < 0.1
  );
}

/* corner radii reading */
function readCornerRadiiFromRectangle(rect: RectangleNode): {
  cornerRadius?: number;
  cornerRadii?: CornerRadii;
} {
  try {
    if (typeof rect.cornerRadius === "number")
      return { cornerRadius: rect.cornerRadius };
    const radii: CornerRadii = {};
    try {
      if (typeof (rect as any).topLeftRadius === "number")
        radii.topLeft = (rect as any).topLeftRadius;
    } catch (e) {}
    try {
      if (typeof (rect as any).topRightRadius === "number")
        radii.topRight = (rect as any).topRightRadius;
    } catch (e) {}
    try {
      if (typeof (rect as any).bottomRightRadius === "number")
        radii.bottomRight = (rect as any).bottomRightRadius;
    } catch (e) {}
    try {
      if (typeof (rect as any).bottomLeftRadius === "number")
        radii.bottomLeft = (rect as any).bottomLeftRadius;
    } catch (e) {}
    if (Object.keys(radii).length > 0) return { cornerRadii: radii };
  } catch (e) {}
  return {};
}

/* ------------------ nodeToLayer / export logic ------------------ */
async function nodeToLayer(node: SceneNode): Promise<LayerOut | null> {
  const bbox = getAbsoluteBBox(node);

  if (node.type === "TEXT") {
    const txt = node as TextNode;
    const match = (txt.characters || "").match(/{{\s*([A-Z0-9_]+)\s*}}/i);
    const key = match ? match[1] : undefined;
    const font = {
      family: (txt.fontName as FontName)?.family || null,
      style: (txt.fontName as FontName)?.style || null,
      size: (txt.fontSize as any) || null,
      letterSpacing:
        txt.letterSpacing && txt.letterSpacing !== figma.mixed
          ? (txt.letterSpacing as any).value
          : null,
      lineHeight:
        txt.lineHeight && txt.lineHeight !== figma.mixed
          ? (txt.lineHeight as any).value
          : null,
      color: colorFromFills(txt.fills),
    };
    return {
      type: "text",
      name: txt.name || "text",
      key,
      x: bbox.x,
      y: bbox.y,
      w: bbox.w,
      h: bbox.h,
      rotation: (node as any).rotation || 0,
      originalText: txt.characters,
      font,
    };
  }

  if (node.type === "LINE") {
    const ln = node as LineNode;
    const strokeColor = colorFromStrokes((ln as any).strokes || ln.strokes);
    return {
      type: "line",
      name: ln.name || "line",
      x: bbox.x,
      y: bbox.y,
      w: bbox.w,
      h: bbox.h || 2,
      rotation: (node as any).rotation || 0,
      color: strokeColor,
    };
  }

  if (
    node.type === "RECTANGLE" ||
    node.type === "ELLIPSE" ||
    node.type === "FRAME" ||
    node.type === "GROUP"
  ) {
    const nameMatch = node.name && node.name.match(/^IMG_?([A-Z0-9_]+)/i);
    let keyFromName = nameMatch ? node.name.replace(/^IMG_?/i, "") : undefined;
    if (typeof keyFromName === "string")
      keyFromName = keyFromName.replace(/[^A-Z0-9_]/gi, "");

    let cornerRadius: number | undefined = undefined;
    let cornerRadii: CornerRadii | undefined = undefined;
    let isEllipse = false;

    if (node.type === "RECTANGLE") {
      try {
        const rect = node as RectangleNode;
        const cr = readCornerRadiiFromRectangle(rect);
        cornerRadius = cr.cornerRadius;
        cornerRadii = cr.cornerRadii;

        // Treat rectangles with radius ~= min(width,height)/2 as ellipses/circles
        try {
          const minSide = Math.min(rect.width || 0, rect.height || 0);
          const tol = 0.5; // pixels tolerance
          if (typeof rect.cornerRadius === "number") {
            if (Math.abs(rect.cornerRadius - minSide / 2) <= tol) {
              isEllipse = true;
            }
          } else if (cornerRadii) {
            const vals = Object.values(cornerRadii);
            if (
              vals.length === 4 &&
              vals.every((v) => Math.abs((v as number) - minSide / 2) <= tol)
            ) {
              isEllipse = true;
            }
          }
        } catch (e) {
          /* ignore */
        }
      } catch (e) {}
    } else if (node.type === "ELLIPSE") {
      isEllipse = true;
    }

    if ("fills" in node) {
      const fillsCandidate = (node as any).fills;
      if (Array.isArray(fillsCandidate)) {
        const imageFill = fillsCandidate.find(
          (f: any) => f && f.type === "IMAGE" && (f as any).imageHash
        );
        if (imageFill && (imageFill as any).imageHash) {
          const key = keyFromName || undefined;
          const isCircleShape =
            isEllipse ||
            (node.type === "RECTANGLE" && circleCheck(node as RectangleNode));
          const shape = isCircleShape ? "circle" : "rect";
          const out: LayerOut = {
            type: "image",
            name: node.name || "image_rect",
            key,
            x: bbox.x,
            y: bbox.y,
            w: bbox.w,
            h: bbox.h,
            rotation: (node as any).rotation || 0,
            shape,
            isEllipse: isCircleShape,
          };
          if (cornerRadius !== undefined) out.cornerRadius = cornerRadius;
          if (cornerRadii !== undefined) out.cornerRadii = cornerRadii;
          return out;
        }
      }
    }

    if (keyFromName) {
      const isCircleShape =
        isEllipse ||
        (node.type === "RECTANGLE" && circleCheck(node as RectangleNode));
      const shape = isCircleShape ? "circle" : "rect";
      const out: LayerOut = {
        type: "image",
        name: node.name || "image_rect",
        key: keyFromName,
        x: bbox.x,
        y: bbox.y,
        w: bbox.w,
        h: bbox.h,
        rotation: (node as any).rotation || 0,
        shape,
        isEllipse: isCircleShape,
      };
      if (cornerRadius !== undefined) out.cornerRadius = cornerRadius;
      if (cornerRadii !== undefined) out.cornerRadii = cornerRadii;
      return out;
    }

    return {
      type: "rect",
      name: node.name || node.type,
      x: bbox.x,
      y: bbox.y,
      w: bbox.w,
      h: bbox.h,
      rotation: (node as any).rotation || 0,
    };
  }

  return null;
}

async function saveTemplateJSON(template: ExportedTemplate) {
  const json = JSON.stringify(template, null, 2);
  try {
    const cb = (figma as any).clipboard;
    if (cb && typeof cb.writeText === "function") {
      await cb.writeText(json);
      figma.notify("Template JSON clipboard'a kopyalandı");
      return;
    }
  } catch (e) {}
  try {
    await figma.clientStorage.setAsync("last_template_json", json);
    figma.notify("Template kaydedildi (clientStorage)");
  } catch (e) {
    figma.notify("Template kaydedilirken hata oluştu (konsolu kontrol et)");
    console.error(e);
  }
}

async function exportTemplateFromFrame(
  frame: FrameNode
): Promise<ExportedTemplate> {
  figma.notify("Template export started");
  const all = frame.findAll((node) =>
    "visible" in node ? node.visible : true
  );
  const layers: LayerOut[] = [];
  for (let i = 0; i < all.length; i++) {
    const n = all[i];
    try {
      await new Promise((r) => setTimeout(r, 0));
      const layer = await nodeToLayer(n as SceneNode);
      if (layer) layers.push(layer);
    } catch (err) {
      console.error("EXPORT: node error", (n as any).name, err);
    }
  }

  // hide text nodes for background export
  const textNodes = frame.findAll((n) => n.type === "TEXT") as TextNode[];
  const prevVisibility: boolean[] = [];
  for (let i = 0; i < textNodes.length; i++) {
    prevVisibility[i] = textNodes[i].visible;
    try {
      textNodes[i].visible = false;
    } catch (e) {}
  }
  let backgroundImage: string | undefined;
  let backgroundTextHidden = false;
  try {
    const bytes = await frame.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 1 },
    });
    backgroundImage = `data:image/png;base64,${base64Encode(bytes)}`;
    backgroundTextHidden = textNodes.length > 0;
  } catch (e) {
    console.warn("EXPORT background failed", e);
    backgroundImage = undefined;
    backgroundTextHidden = textNodes.length > 0;
  } finally {
    for (let i = 0; i < textNodes.length; i++) {
      try {
        textNodes[i].visible = prevVisibility[i];
      } catch (e) {}
    }
  }

  // fonts
  const fontsMap: Record<string, FontSpec> = {};
  for (const ln of layers) {
    if (ln.type === "text" && ln.font && ln.font.family) {
      const fam = ln.font.family || "Unknown";
      const sty = ln.font.style || "Regular";
      const sz = ln.font.size || 0;
      fontsMap[`${fam}::${sty}`] = { family: fam, style: sty, size: sz };
    }
  }
  const fontsArr: FontSpec[] = Object.values(fontsMap);

  const template: ExportedTemplate = {
    template_id: (frame.name || "template")
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "_"),
    version: 1,
    size: { w: Math.round(frame.width), h: Math.round(frame.height) },
    fonts: fontsArr,
    layers,
    metadata: {
      exportedAt: new Date().toISOString(),
      frameId: frame.id,
      backgroundTextHidden,
    },
    backgroundImage,
    neonBorder: true,
  };

  // export images (try to find export node by name/bbox)
  for (const l of layers) {
    if (l.type === "image") {
      let found: SceneNode | null = null;
      try {
        found = frame.findOne(
          (n) => n.name === l.name && "exportAsync" in n
        ) as SceneNode | null;
      } catch (e) {}
      if (!found) {
        try {
          found = frame.findOne((n) => {
            if (!("exportAsync" in n)) return false;
            const b = getAbsoluteBBox(n as SceneNode);
            const tol = 1.5;
            return (
              Math.abs(b.x - l.x) <= tol &&
              Math.abs(b.y - l.y) <= tol &&
              Math.abs(b.w - l.w) <= tol &&
              Math.abs(b.h - l.h) <= tol
            );
          }) as SceneNode | null;
        } catch (e) {}
      }
      if (found && "exportAsync" in found) {
        try {
          const b = await (found as any).exportAsync({
            format: "PNG",
            constraint: { type: "SCALE", value: 1 },
          });
          l.dataUri = `data:image/png;base64,${base64Encode(b)}`;
          continue;
        } catch (e) {
          console.warn("EXPORT image failed for", l.name, e);
        }
      }
      if (l.key) {
        if ((l as any).dataUri) delete (l as any).dataUri;
      }
    }
  }

  await saveTemplateJSON(template);
  figma.notify("Template export tamamlandı");
  return template;
}

/* ------------------ apply mapping (NO UI-crop) ------------------ */

function dataURLToUint8Array(dataURL: string): Uint8Array {
  const comma = dataURL.indexOf(",");
  const base64 = comma >= 0 ? dataURL.slice(comma + 1) : dataURL;
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function normalizeKey(s: string): string {
  return String(s || "")
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toUpperCase()
    .trim();
}

// Looser normalize (handles spaces, dashes, parens, _copy, numeric suffixes)
function normalizeKeyLoose(s: string): string {
  return String(s || "")
    .replace(/\.[^.]*$/, "")
    .replace(/[\s\-\(\)]+/g, "_")
    .replace(/_COPY$/i, "")
    .replace(/_\d+$/i, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toUpperCase()
    .trim();
}

function findMappingForNameLoose(
  name: string,
  mapping: Mapping
): string | null {
  const norm = normalizeKeyLoose(name);
  // direct normalized match
  for (const k of Object.keys(mapping)) {
    if (normalizeKeyLoose(k) === norm) return mapping[k];
  }
  // try adding/removing IMG_ prefix
  const candidates = new Set<string>();
  candidates.add(norm);
  if (norm.startsWith("IMG_")) candidates.add(norm.replace(/^IMG_/, ""));
  else candidates.add("IMG_" + norm);
  // variations
  candidates.add(norm.replace(/_COPY$/i, ""));
  candidates.add(norm.replace(/_\d+$/i, ""));
  for (const c of Array.from(candidates)) {
    for (const k of Object.keys(mapping)) {
      if (normalizeKeyLoose(k) === c) return mapping[k];
    }
  }
  return null;
}

function findMappingForName(name: string, mapping: Mapping): string | null {
  // Keep backward-compatible behavior but prefer loose match
  const loose = findMappingForNameLoose(name, mapping);
  if (loose) return loose;
  const normalized = normalizeKey(name);
  for (const k of Object.keys(mapping))
    if (normalizeKey(k) === normalized) return mapping[k];
  const withImg = normalized.startsWith("IMG_")
    ? normalized
    : "IMG_" + normalized;
  for (const k of Object.keys(mapping))
    if (normalizeKey(k) === withImg) return mapping[k];
  return null;
}

function copyCornerRadiusAndRotation(source: SceneNode, target: SceneNode) {
  try {
    (target as any).rotation = (source as any).rotation || 0;
  } catch (e) {}
  try {
    if (source.type === "RECTANGLE" && target.type === "RECTANGLE") {
      const src = source as RectangleNode;
      const tgt = target as RectangleNode;
      if (typeof src.cornerRadius === "number")
        tgt.cornerRadius = src.cornerRadius;
      else {
        try {
          if (typeof (src as any).topLeftRadius === "number")
            (tgt as any).topLeftRadius = (src as any).topLeftRadius;
        } catch (e) {}
        try {
          if (typeof (src as any).topRightRadius === "number")
            (tgt as any).topRightRadius = (src as any).topRightRadius;
        } catch (e) {}
        try {
          if (typeof (src as any).bottomRightRadius === "number")
            (tgt as any).bottomRightRadius = (src as any).bottomRightRadius;
        } catch (e) {}
        try {
          if (typeof (src as any).bottomLeftRadius === "number")
            (tgt as any).bottomLeftRadius = (src as any).bottomLeftRadius;
        } catch (e) {}
      }
    }
    if (source.type === "ELLIPSE" && target.type === "RECTANGLE") {
      const r =
        Math.min((source as any).width || 0, (source as any).height || 0) / 2;
      try {
        (target as RectangleNode).cornerRadius = r;
      } catch (e) {}
    }
  } catch (e) {}
}

function trySetFills(node: SceneNode, fills: Paint[]): boolean {
  try {
    if ("fills" in node) {
      (node as GeometryMixin).fills = fills;
      return true;
    }
  } catch (e) {
    console.warn("trySetFills failed for", (node as any).name, e);
  }
  return false;
}

function createOverlayWithImage(source: SceneNode, imagePaint: ImagePaint) {
  const parent = source.parent ?? figma.currentPage;
  let overlay: SceneNode;
  if (source.type === "ELLIPSE") {
    const e = figma.createEllipse();
    e.resize((source as any).width || 100, (source as any).height || 100);
    overlay = e;
  } else {
    const r = figma.createRectangle();
    r.resize((source as any).width || 100, (source as any).height || 100);
    overlay = r;
  }
  try {
    overlay.x = (source as any).x || 0;
    overlay.y = (source as any).y || 0;
    (overlay as any).rotation = (source as any).rotation || 0;
  } catch (e) {}
  try {
    copyCornerRadiusAndRotation(source, overlay);
  } catch (e) {}
  try {
    overlay.fills = [imagePaint];
  } catch (e) {}
  try {
    if (parent && "insertChild" in parent) {
      const idx = parent.children.indexOf(source);
      parent.insertChild(Math.min(idx + 1, parent.children.length), overlay);
    } else {
      figma.currentPage.appendChild(overlay);
    }
  } catch (e) {
    figma.currentPage.appendChild(overlay);
  }
  return overlay;
}

async function applyMappingToSelection(mapping: Mapping) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify("Lütfen önce değiştirmek istediğiniz node(lar)ı seçin.");
    return;
  }

  console.log("[mapping-debug] mapping keys:", Object.keys(mapping));
  console.log(
    "[mapping-debug] selection:",
    figma.currentPage.selection.map((n) => ({ name: n.name, type: n.type }))
  );

  for (const node of selection) {
    const val = findMappingForName(node.name, mapping);
    if (!val) {
      figma.notify(`Mapping bulunamadı: ${node.name}`);
      continue;
    }
    if (typeof val !== "string" || !val.startsWith("data:")) {
      figma.notify(`Geçersiz dataURL: ${node.name}`);
      continue;
    }

    try {
      // create image from dataURL
      const bytes = dataURLToUint8Array(val);
      const img = figma.createImage(bytes);
      // ImagePaint with scaleMode:'FILL' => Figma centers and crops automatically preserving aspect ratio
      const imagePaint: ImagePaint = {
        type: "IMAGE",
        scaleMode: "FILL",
        imageHash: img.hash,
      };

      const ok = trySetFills(node, [imagePaint]);
      if (!ok) {
        // fallback overlay with same corner radius/rotation
        createOverlayWithImage(node, imagePaint);
      }
    } catch (err) {
      console.error("applyMapping error for", node.name, err);
      figma.notify(`Hata: ${node.name} için resim uygulanamadı.`);
    }
  }

  figma.notify("Görseller uygulandı (scaleMode: FILL ile ortalandı).");
}

/* ---------- UI messaging ---------- */
figma.ui.onmessage = async (msg: any) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "apply-mapping") {
    try {
      const mapping =
        typeof msg.mapping === "string" ? JSON.parse(msg.mapping) : msg.mapping;
      if (typeof mapping !== "object" || mapping === null) {
        figma.notify("Geçersiz JSON mapping.");
        return;
      }
      await applyMappingToSelection(mapping);
    } catch (e) {
      console.error("Parsing mapping error", e);
      figma.notify("Mapping JSON parse hatası.");
    }
  } else if (msg.type === "export-template") {
    const node = figma.currentPage.selection[0];
    if (!node || node.type !== "FRAME") {
      figma.notify("Lütfen bir FRAME seçin.");
      return;
    }
    try {
      const template = await exportTemplateFromFrame(node as FrameNode);
      const json = JSON.stringify(template, null, 2);
      figma.ui.postMessage({ type: "template-json", payload: json });
      figma.notify("Template hazır — UI'dan kopyalayabilirsiniz.");
    } catch (e) {
      console.error(e);
      figma.ui.postMessage({ type: "export-error", payload: String(e) });
      figma.notify("Export sırasında hata oluştu.");
    }
  } else if (msg.type === "save-to-storage" && msg.payload) {
    try {
      await figma.clientStorage.setAsync("last_template_json", msg.payload);
      figma.notify("Template kaydedildi (clientStorage).");
    } catch (e) {
      console.error(e);
      figma.notify("Save to storage failed");
    }
  } else if (msg.type === "request-last-storage") {
    try {
      const last = await figma.clientStorage.getAsync("last_template_json");
      figma.ui.postMessage({ type: "template-json", payload: last || "" });
    } catch (e) {
      console.error(e);
      figma.ui.postMessage({ type: "export-error", payload: String(e) });
    }
  } else if (msg.type === "close-plugin") {
    figma.closePlugin();
  }
};

/* Runner: optional auto-export on open (kept from original) */
(async function runner() {
  try {
    const sel = figma.currentPage.selection;
    if (!sel || sel.length === 0) {
      figma.notify("Bir Frame seçin ve UI'daki 'Export' butonuna basın.");
      return;
    }
    const first = sel[0];
    if (first.type !== "FRAME") {
      figma.notify(
        "İlk seçili öğe bir Frame olmalı. UI'daki 'Export' butonunu kullanın."
      );
      return;
    }
    try {
      const template = await exportTemplateFromFrame(first as FrameNode);
      const json = JSON.stringify(template, null, 2);
      figma.ui.postMessage({ type: "template-json", payload: json });
      figma.notify("Template hazır — UI'dan kopyalayabilirsiniz.");
    } catch (e) {
      console.error(e);
      figma.ui.postMessage({ type: "export-error", payload: String(e) });
      figma.notify("Export sırasında hata oluştu.");
    }
  } catch (e) {
    console.error("Runner error", e);
  }
})();
