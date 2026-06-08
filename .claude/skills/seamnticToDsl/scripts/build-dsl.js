#!/usr/bin/env node
'use strict';
/**
 * build-dsl.js — Step 4：将 Step 3 布局节点树转换为设计 DSL JSON
 *
 * 用法:
 *   node build-dsl.js NODES.json STYLES.json [--component-map map.json] [--out dsl.json]
 *
 * component-map.json 格式（由 LLM 在 Step 4-B 中生成）：
 *   { "<nid>": { symbol_id, variant_key, component_set_key, component_set_resolved, variant_props? } }
 *
 * 输出 dsl.json 符合 设计dsl.md 规范。
 */
const fs = require('fs');

function load(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// ── 颜色转换 ──────────────────────────────────────────────────────────────────

function cssColorToHex(css) {
  if (!css) return null;
  css = css.trim();
  if (css === 'transparent' || css === 'rgba(0, 0, 0, 0)') return null;
  let m = css.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
  if (m) {
    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('').toUpperCase() + 'FF';
  }
  m = css.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
  if (m) {
    const a = Math.round(parseFloat(m[4]) * 255);
    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('').toUpperCase()
      + a.toString(16).padStart(2, '0').toUpperCase();
  }
  m = css.match(/^#([0-9a-fA-F]{6})$/);
  if (m) return '#' + m[1].toUpperCase() + 'FF';
  m = css.match(/^#([0-9a-fA-F]{8})$/);
  if (m) return '#' + m[1].toUpperCase();
  return null;
}

// ── nid → DSL id ──────────────────────────────────────────────────────────────

function nidToId(nid) {
  return `1:${nid}`;
}

// ── 样式 → fills ──────────────────────────────────────────────────────────────

function buildFills(style) {
  const fills = [];
  const bgColor = cssColorToHex(style.backgroundColor);
  if (bgColor) {
    fills.push({ type: 'solid', visible: true, opacity: 1, color: bgColor });
  }
  const bgImg = style.backgroundImage;
  if (bgImg && bgImg !== 'none') {
    if (bgImg.startsWith('url(')) {
      const m = bgImg.match(/url\(["']?([^"')]+)["']?\)/);
      if (m) {
        const hash = m[1].split('/').pop().replace(/\.[^.]+$/, '');
        fills.push({ type: 'image', visible: true, opacity: 1, image_hash: hash });
      }
    } else if (bgImg.includes('gradient')) {
      fills.push({ type: 'gradient_linear', visible: true, opacity: 1, stops: [] });
    }
  }
  return fills;
}

// ── 样式 → strokes ────────────────────────────────────────────────────────────

function buildStrokes(style) {
  const strokes = [];
  const b = style.border;
  if (b && !b.startsWith('0px')) {
    const m = b.match(/^([\d.]+)px\s+\S+\s+(.+)$/);
    if (m) {
      const color = cssColorToHex(m[2].trim());
      if (color) strokes.push({ type: 'solid', visible: true, opacity: 1, color });
    }
  }
  return strokes;
}

// ── 样式 → effects ────────────────────────────────────────────────────────────

function buildEffects(style) {
  const effects = [];
  const shadow = style.boxShadow;
  if (shadow && shadow !== 'none') {
    // "Xpx Ypx Bpx Spx rgba(...)"
    const m = shadow.match(/^([-\d.]+)px\s+([-\d.]+)px\s+([\d.]+)px\s+([\d.]+)px\s+(.+)$/);
    if (m) {
      const color = cssColorToHex(m[5].trim());
      effects.push({
        type: 'drop_shadow',
        visible: true,
        offset_x: parseFloat(m[1]),
        offset_y: parseFloat(m[2]),
        blur: parseFloat(m[3]),
        spread: parseFloat(m[4]),
        ...(color ? { color } : {}),
      });
    }
  }
  return effects;
}

// ── 样式 → corner_radius ──────────────────────────────────────────────────────

function buildCornerRadius(style) {
  const r = style.borderRadius;
  if (!r || r === '0px') return {};
  const parts = r.trim().split(/\s+/);
  if (parts.length === 1) return { corner_radius: parseFloat(parts[0]) };
  if (parts.length === 4) return { corner_radii: parts.map(parseFloat) };
  return { corner_radius: parseFloat(parts[0]) };
}

// ── 样式 → text_style ─────────────────────────────────────────────────────────

function fontWeightToStyle(weight) {
  const w = parseInt(weight, 10) || 400;
  if (w >= 700) return 'Bold';
  if (w >= 600) return 'SemiBold';
  if (w >= 500) return 'Medium';
  return 'Regular';
}

function textAlignToAlignH(align) {
  if (align === 'center') return 'center';
  if (align === 'right' || align === 'end') return 'right';
  if (align === 'justify') return 'justified';
  return 'left';
}

function buildTextStyle(style) {
  const ts = {};
  if (style.fontFamily)
    ts.font_family = style.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  ts.font_style = fontWeightToStyle(style.fontWeight);
  ts.font_size  = style.fontSize ? parseFloat(style.fontSize) : 14;
  const color   = cssColorToHex(style.color);
  if (color) ts.color = color;
  ts.letter_spacing = style.letterSpacing ? parseFloat(style.letterSpacing) : 0;
  const lh = style.lineHeight;
  ts.line_height = (lh && lh !== 'normal') ? (parseFloat(lh) || 'auto') : 'auto';
  ts.align_h = textAlignToAlignH(style.textAlign);
  ts.align_v = 'center';
  return ts;
}

// ── step3 layout → auto_layout ───────────────────────────────────────────────

function alignItemsToDsl(v) {
  if (v === 'center')   return 'center';
  if (v === 'flex-end') return 'max';
  if (v === 'stretch')  return 'stretch';
  return 'min';
}

function justifyContentToDsl(v) {
  if (v === 'center')    return 'center';
  if (v === 'flex-end')  return 'max';
  if (v === 'space-between' || v === 'space-around' || v === 'space-evenly') return 'space_evenly';
  return 'min';
}

function buildAutoLayout(layout) {
  if (!layout || layout.mode === 'absolute') return null;
  const pad = layout.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  if (layout.mode === 'grid') {
    const gap = Array.isArray(layout.gap) ? layout.gap : [layout.gap || 0, layout.gap || 0];
    return {
      direction:       'horizontal',
      gap:             gap[1] || 0,
      counter_gap:     gap[0] || 0,
      padding:         [pad.top, pad.right, pad.bottom, pad.left],
      align_items:     'min',
      justify_content: 'min',
      wrap:            true,
    };
  }
  return {
    direction:       layout.direction === 'column' ? 'vertical' : 'horizontal',
    gap:             typeof layout.gap === 'number' ? layout.gap : 0,
    padding:         [pad.top, pad.right, pad.bottom, pad.left],
    align_items:     alignItemsToDsl(layout.alignItems     || 'flex-start'),
    justify_content: justifyContentToDsl(layout.justifyContent || 'flex-start'),
    wrap:            Boolean(layout.wrap),
  };
}

// ── 节点类型推断 ──────────────────────────────────────────────────────────────

function detectType(node, compMap) {
  if (compMap && compMap[String(node.nid)]) return 'instance';
  const tag = node.tag || '';
  if (tag === 'svg')  return 'vector';
  if (tag === 'img')  return 'rectangle'; // will carry image fill
  const hasText = Boolean(node.text && node.text.trim());
  const hasKids = (node.children || []).length > 0;
  if (hasText && !hasKids) return 'text';
  if (hasKids || node.layout) return 'frame';
  return 'rectangle';
}

// ── 节点名称 ──────────────────────────────────────────────────────────────────

function nodeName(node) {
  if (node.label && node.label !== '-') return node.label;
  if (node.class) return node.class.split(' ')[0];
  return `${node.tag || 'node'}-${node.nid}`;
}

// ── 主转换（递归） ────────────────────────────────────────────────────────────

function convertNode(node, parentRect, styles, compMap) {
  const style = styles[String(node.nid)] || {};
  const r  = node.rect || { x: 0, y: 0, w: 0, h: 0 };
  const pr = parentRect;
  const type    = detectType(node, compMap);
  const opacityRaw = parseFloat(style.opacity);
  const opacity = !isNaN(opacityRaw) ? opacityRaw : 1;

  const layer = {
    id:         nidToId(node.nid),
    name:       nodeName(node),
    type,
    visible:    true,
    opacity,
    blend_mode: 'normal',
    box: {
      x:      r.x - pr.x,
      y:      r.y - pr.y,
      width:  r.w,
      height: r.h,
    },
  };

  // ── InstanceLayer ──────────────────────────────────────────────────────────
  if (type === 'instance') {
    const info = compMap[String(node.nid)];
    layer.instance = {
      symbol_id:              info.symbol_id             || '',
      variant_key:            info.variant_key           || '',
      component_set_key:      info.component_set_key     || '',
      component_set_resolved: info.component_set_resolved ?? false,
    };
    if (info.variant_props && Object.keys(info.variant_props).length)
      layer.instance.variant_props = info.variant_props;
    if (info.overrides && info.overrides.length)
      layer.instance.overrides = info.overrides;
    return layer; // instance 无 children
  }

  // ── NormalLayer 公共视觉属性 ───────────────────────────────────────────────
  const fills   = buildFills(style);
  const strokes = buildStrokes(style);
  const effects = buildEffects(style);
  const corners = buildCornerRadius(style);
  if (fills.length)              layer.fills         = fills;
  if (strokes.length)            layer.strokes       = strokes;
  if (effects.length)            layer.effects       = effects;
  if (corners.corner_radius != null) layer.corner_radius = corners.corner_radius;
  if (corners.corner_radii)         layer.corner_radii  = corners.corner_radii;

  // ── text ──────────────────────────────────────────────────────────────────
  if (type === 'text') {
    layer.text_content = (node.text || '').trim();
    layer.text_style   = buildTextStyle(style);
    return layer;
  }

  // ── frame / rectangle / group ─────────────────────────────────────────────
  const autoLayout = buildAutoLayout(node.layout);
  if (autoLayout) layer.auto_layout = autoLayout;

  const kids = (node.children || []).filter(c => {
    const cr = c.rect;
    return cr && (cr.w > 0 || cr.h > 0 || (c.children || []).length > 0);
  });
  if (kids.length) {
    layer.children = kids.map(c => convertNode(c, r, styles, compMap));
  }

  return layer;
}

// ── DSL 构建入口 ──────────────────────────────────────────────────────────────

function buildDSL(nodesDoc, stylesDoc, compMap) {
  const tree   = nodesDoc.tree;
  const styles = stylesDoc.styles || stylesDoc;
  const file   = nodesDoc.file || 'unknown.html';
  const now    = new Date().toISOString();

  const meta = {
    version:    '1.0.0',
    source:     'html-analysis',
    file_id:    file.replace(/\.[^.]+$/, '').toLowerCase(),
    file_name:  file,
    created_at: now,
    updated_at: now,
  };

  const rootLayer = convertNode(tree, { x: 0, y: 0 }, styles, compMap || {});
  const page = {
    id:     nidToId(tree.nid || 0),
    name:   file,
    layers: [rootLayer],
  };

  return { meta, pages: [page] };
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = { nodes: null, styles: null, compMap: null, out: 'dsl.json' };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if      (rest[i] === '--component-map') a.compMap = rest[++i];
    else if (rest[i] === '--out')           a.out     = rest[++i];
    else if (!a.nodes)  a.nodes  = rest[i];
    else if (!a.styles) a.styles = rest[i];
  }
  return a;
}

const args = parseArgs(process.argv);
if (!args.nodes || !args.styles) {
  console.error('Usage: node build-dsl.js NODES.json STYLES.json [--component-map map.json] [--out dsl.json]');
  process.exit(1);
}

const nodesDoc  = load(args.nodes);
const stylesDoc = load(args.styles);
const compMap   = args.compMap ? load(args.compMap) : {};
const dsl = buildDSL(nodesDoc, stylesDoc, compMap);
fs.writeFileSync(args.out, JSON.stringify(dsl, null, 2), 'utf8');

let total = 0, instances = 0, frames = 0, texts = 0;
function countLayers(layers) {
  for (const l of (layers || [])) {
    total++;
    if (l.type === 'instance')   instances++;
    else if (l.type === 'frame') frames++;
    else if (l.type === 'text')  texts++;
    countLayers(l.children);
  }
}
countLayers(dsl.pages[0].layers);
console.log(`图层总数 ${total} | frame ${frames} | text ${texts} | instance ${instances}`);
console.log(`已写出 ${args.out}`);

module.exports = { buildDSL, convertNode, buildAutoLayout, buildFills, buildTextStyle };
