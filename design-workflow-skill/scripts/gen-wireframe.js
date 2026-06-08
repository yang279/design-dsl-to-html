#!/usr/bin/env node
/**
 * gen-wireframe.js — Step 2 产物：语义线框 HTML 生成器
 *
 * CLI 用法:
 *   node gen-wireframe.js <nodes-file> <screenshot-file> <output-file> [--dpr N]
 *
 *   nodes-file      step2/nodes-<filename>.json
 *   screenshot-file step1/screenshots/<filename>-before.png
 *   output-file     step2/wireframe-<filename>.html
 *   --dpr N         设备像素比（默认 2，Retina Mac）；用于将截图物理像素转换为 CSS 像素
 *
 * 程序化调用:
 *   const { generateWireframe } = require('./gen-wireframe');
 *   generateWireframe(nodesData, screenshotRelPath, screenshotCssW, screenshotCssH, outputFile);
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Semantic → border color mapping ────────────────────────────────────────
const COLORS = {
  page:        '#3A6EA5',
  navbar:      '#4A90D9',
  'tab-bar':   '#6C8EBF',
  'tab-item':  '#9DB8D9',
  'nav-item':  '#7BAFD4',
  breadcrumb:  '#A0C0DC',
  section:     '#5B9A6E',
  container:   '#8DB8A0',
  row:         '#A8CC9F',
  column:      '#C2DEB8',
  card:        '#E8A838',
  header:      '#D4A030',
  footer:      '#B88828',
  sidebar:     '#669999',
  overlay:     '#996699',
  heading:     '#D4624A',
  'body-text': '#C87D6A',
  label:       '#B09070',
  caption:     '#C0A898',
  badge:       '#CC8844',
  status:      '#AAA830',
  button:      '#D4503C',
  link:        '#4A8FD4',
  input:       '#6C9ABA',
  select:      '#7AACCA',
  checkbox:    '#8CC8A0',
  search:      '#5AACBA',
  image:       '#8C6BAE',
  icon:        '#9E7CC0',
  avatar:      '#B08CC0',
  logo:        '#7B5EA0',
  chart:       '#5A8FA0',
  table:       '#6A9090',
  'table-head':'#5A8080',
  'table-row': '#7AAAAA',
  'table-cell':'#8ABBBB',
  list:        '#7AB87A',
  'list-item': '#A0CC9A',
  pagination:  '#AAAACC',
  stat:        '#CCA860',
  divider:     '#AAAAAA',
  spacer:      '#CCCCCC',
  background:  '#BBBBBB',
  '-':         '#888888',
};

function colorFor(semantic) {
  return COLORS[semantic] || '#888888';
}

// ─── Read PNG dimensions from file header (IHDR chunk) ──────────────────────
function readPngDimensions(filePath) {
  const buf = Buffer.alloc(24);
  const fd  = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  // Bytes 16-19: width, 20-23: height (big-endian uint32)
  return {
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
  };
}

// ─── Flatten tree → array ───────────────────────────────────────────────────
function flattenTree(root) {
  const nodes = [];
  function walk(node) {
    nodes.push(node);
    if (node.children) node.children.forEach(walk);
  }
  walk(root);
  return nodes;
}

// ─── Core HTML generator ────────────────────────────────────────────────────
function generateWireframe(nodesData, screenshotRelPath, screenshotCssW, screenshotCssH, outputFile) {
  const { totalWidth, totalHeight, tree, file } = nodesData;

  const nodes = flattenTree(tree);
  // Larger areas render first so small boxes appear on top
  nodes.sort((a, b) => (b.rect.w * b.rect.h) - (a.rect.w * a.rect.h));

  // ── DOM boxes ──────────────────────────────────────────────────────────────
  const boxes = nodes.map(n => {
    const { x, y, w, h } = n.rect;
    if (w < 2 || h < 2) return '';
    const color    = colorFor(n.semantic);
    const sem      = n.semantic || '-';
    const conf     = n.confidence === 'low' ? ' ⚠' : '';
    const labelTxt = n.label && n.label !== '-' ? n.label : (n.text ? n.text.slice(0, 14) : '');
    const passCSS  = n.passthrough ? 'opacity:0.3;' : '';
    const fz       = Math.max(9, Math.min(12, Math.floor(h * 0.35)));
    return `<div class="node" data-nid="${n.nid}" data-sem="${sem}" data-conf="${n.confidence || ''}" ` +
      `style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-color:${color};${passCSS}" ` +
      `title="nid:${n.nid} | ${sem} | ${labelTxt}">` +
      `<span class="tag" style="background:${color};font-size:${fz}px">${sem}${conf}</span>` +
      (labelTxt ? `<span class="lbl" style="font-size:${fz}px">${labelTxt}</span>` : '') +
      `</div>`;
  }).join('\n');

  // ── Legend ─────────────────────────────────────────────────────────────────
  const legendItems = Object.entries(COLORS).map(([sem, col]) =>
    `<span class="leg-item"><span class="leg-sw" style="background:${col}"></span>${sem}</span>`
  ).join('');

  // ── Low-confidence count ───────────────────────────────────────────────────
  const lowCount = nodes.filter(n => n.confidence === 'low').length;

  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>Wireframe — ${file} (${nodes.length} nodes)</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#eee;font-family:system-ui,sans-serif}

#hdr{
  position:sticky;top:0;z-index:9999;
  background:#16213e;padding:8px 16px;
  display:flex;align-items:center;gap:16px;flex-wrap:wrap;
  border-bottom:1px solid #0f3460;
}
#hdr h1{font-size:14px;font-weight:600;color:#e94560}
#hdr .meta{font-size:11px;color:#aaa}
#ctrl{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#ctrl label{font-size:11px;color:#ccc;display:flex;align-items:center;gap:4px}
#ctrl input[type=range]{width:80px}

#legend{display:flex;gap:6px;flex-wrap:wrap;padding:5px 16px 6px;background:#16213e;border-bottom:1px solid #0f3460}
.leg-item{display:flex;align-items:center;gap:3px;font-size:10px;color:#bbb}
.leg-sw{width:10px;height:10px;border-radius:2px;flex-shrink:0}

#wrap{overflow:auto;padding:20px;min-height:200px}
#canvas{
  position:relative;
  width:${totalWidth}px;height:${totalHeight}px;
  background:#f0f0f0;
  transform-origin:top left;
}
/* Screenshot overlay — sized to CSS pixels of the original viewport */
#canvas.show-ss{
  background-image:url('${screenshotRelPath}');
  background-size:${screenshotCssW}px ${screenshotCssH}px;
  background-repeat:no-repeat;
  background-position:0 0;
}
#canvas.show-ss .node{opacity:0.65}

.node{
  position:absolute;border:1.5px solid;
  cursor:pointer;overflow:hidden;
  transition:box-shadow .1s;
}
.node:hover{box-shadow:0 0 0 2px #fff,0 0 0 4px #e94560;z-index:5000!important}
.node.hi{box-shadow:0 0 0 2px #fff,0 0 0 5px #FFD700!important;z-index:5001!important}

.tag{
  display:inline-block;color:#fff;
  padding:1px 3px;border-radius:2px;
  line-height:1.3;white-space:nowrap;
  max-width:100%;overflow:hidden;
}
.lbl{
  display:inline-block;color:#222;
  padding:0 2px;line-height:1.3;
  white-space:nowrap;overflow:hidden;
  max-width:calc(100% - 60px);
}

#info{
  position:fixed;bottom:16px;right:16px;z-index:9999;
  background:#16213e;border:1px solid #0f3460;
  border-radius:6px;padding:10px 14px;
  font-size:11px;min-width:200px;max-width:300px;
  display:none;
}
#info.vis{display:block}
#info h3{font-size:12px;color:#e94560;margin-bottom:6px}
#info table{width:100%;border-collapse:collapse}
#info td{padding:2px 4px;vertical-align:top}
#info td:first-child{color:#888;white-space:nowrap;padding-right:8px}
</style>
</head>
<body>
<div id="hdr">
  <h1>Wireframe — ${file}</h1>
  <span class="meta">${nodes.length} nodes &nbsp;|&nbsp; ${totalWidth}×${totalHeight} px &nbsp;|&nbsp; ⚠ low: ${lowCount}</span>
  <div id="ctrl">
    <label>缩放
      <input type="range" id="zoom" min="20" max="150" value="50">
      <span id="zv">50%</span>
    </label>
    <label><input type="checkbox" id="tog-ss"> 叠加截图</label>
    <label><input type="checkbox" id="tog-low"> 高亮 low confidence (${lowCount})</label>
  </div>
</div>
<div id="legend">${legendItems}</div>
<div id="wrap">
  <div id="canvas">
${boxes}
  </div>
</div>
<div id="info">
  <h3>节点详情</h3>
  <table id="it"></table>
</div>

<script>
(function(){
  const canvas = document.getElementById('canvas');
  const wrap   = document.getElementById('wrap');

  // Zoom
  const zSlider = document.getElementById('zoom');
  const zVal    = document.getElementById('zv');
  zSlider.addEventListener('input', () => {
    const v = +zSlider.value / 100;
    zVal.textContent = zSlider.value + '%';
    canvas.style.transform = 'scale(' + v + ')';
    wrap.style.height = (${totalHeight} * v + 40) + 'px';
    wrap.style.width  = (${totalWidth}  * v + 40) + 'px';
  });
  zSlider.dispatchEvent(new Event('input'));

  // Screenshot toggle
  document.getElementById('tog-ss').addEventListener('change', e => {
    canvas.classList.toggle('show-ss', e.target.checked);
  });

  // Low confidence highlight
  document.getElementById('tog-low').addEventListener('change', e => {
    document.querySelectorAll('.node[data-conf="low"]').forEach(el => {
      el.classList.toggle('hi', e.target.checked);
    });
  });

  // Click info panel
  const info = document.getElementById('info');
  const it   = document.getElementById('it');
  document.querySelectorAll('.node').forEach(el => {
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      document.querySelectorAll('.node.hi').forEach(n => {
        if (!document.getElementById('tog-low').checked) n.classList.remove('hi');
      });
      el.classList.add('hi');
      const s  = el.style;
      const lbl = el.title.split(' | ')[2] || '';
      it.innerHTML =
        '<tr><td>nid</td><td>' + el.dataset.nid + '</td></tr>' +
        '<tr><td>semantic</td><td><b style="color:#e94560">' + el.dataset.sem + '</b></td></tr>' +
        '<tr><td>confidence</td><td>' + (el.dataset.conf || '-') + '</td></tr>' +
        '<tr><td>rect</td><td>' + parseInt(s.left) + ',' + parseInt(s.top) +
          ' &nbsp;' + parseInt(s.width) + '×' + parseInt(s.height) + '</td></tr>' +
        '<tr><td>label</td><td>' + lbl + '</td></tr>';
      info.classList.add('vis');
    });
  });
  document.addEventListener('click', () => {
    info.classList.remove('vis');
    if (!document.getElementById('tog-low').checked) {
      document.querySelectorAll('.node.hi').forEach(n => n.classList.remove('hi'));
    }
  });
})();
</script>
</body>
</html>`;

  fs.writeFileSync(outputFile, html, 'utf8');
}

// ─── CLI entry ───────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node gen-wireframe.js <nodes-file> <screenshot-file> <output-file> [--dpr N]');
    process.exit(1);
  }

  const [nodesFile, screenshotFile, outputFile] = args;
  let dpr = 2;
  const dprIdx = args.indexOf('--dpr');
  if (dprIdx !== -1 && args[dprIdx + 1]) dpr = parseFloat(args[dprIdx + 1]);

  const nodesData = JSON.parse(fs.readFileSync(nodesFile, 'utf8'));
  const { w: pngW, h: pngH } = readPngDimensions(screenshotFile);
  const cssW = Math.round(pngW / dpr);
  const cssH = Math.round(pngH / dpr);

  // Path from output file's directory to screenshot file
  const screenshotRel = path.relative(path.dirname(outputFile), screenshotFile);

  generateWireframe(nodesData, screenshotRel, cssW, cssH, outputFile);

  const nodes = [];
  (function walk(n) { nodes.push(n); (n.children || []).forEach(walk); })(nodesData.tree);
  console.log(`Written: ${outputFile}`);
  console.log(`Nodes: ${nodes.length}, Canvas: ${nodesData.totalWidth}x${nodesData.totalHeight}, Screenshot CSS: ${cssW}x${cssH} (PNG ${pngW}x${pngH}, dpr=${dpr})`);
}

module.exports = { generateWireframe, readPngDimensions, flattenTree };
