/**
 * 将 LLM 语义标注后的节点树与 prune 产物合并为 node-dsl schema
 *
 * 做了什么：
 *   1. 从 pruned.json 的 styles 字段取原始计算样式，调用 simplifyStyle 精简
 *   2. 将精简样式以 style 字段内联进标注后的节点树
 *   3. text / icon / component 节点自动剥除 children（符合 node-dsl.md 约束）
 *
 * CLI 用法：
 *   node build-schema.js <annotated.json> <pruned.json> <output.json>
 *   - annotated.json  格式：{ tree: Node | Node[] }  （LLM 标注后的节点树）
 *   - pruned.json     格式：{ tree, styles }          （prune-nodes.js 的输出）
 *   - output.json     写入合并后的 Node | Node[]
 */

const { simplifyStyle } = require('./prune-nodes');

const LEAF_TYPES = new Set(['text', 'icon', 'component']);

function mergeNode(node, rawStyles) {
  const style = simplifyStyle(rawStyles[String(node.nid)] || {});

  const out = { nid: node.nid, tag: node.tag, rect: node.rect };

  if (node.layerType)        out.layerType        = node.layerType;
  if (node.layerName)        out.layerName        = node.layerName;
  if (node.layerDescription) out.layerDescription = node.layerDescription;
  if (node.layerConfidence)  out.layerConfidence  = node.layerConfidence;

  if (node.id)            out.id            = node.id;
  if (node.class)         out.class         = node.class;
  if (node.attrs)         out.attrs         = node.attrs;
  if (node.text)          out.text          = node.text;
  if (node.src  != null)  out.src           = node.src;
  if (node.alt  != null)  out.alt           = node.alt;
  if (node.href != null)  out.href          = node.href;
  if (node.type != null)  out.type          = node.type;
  if (node.naturalWidth  != null) out.naturalWidth  = node.naturalWidth;
  if (node.naturalHeight != null) out.naturalHeight = node.naturalHeight;
  if (node.loaded        != null) out.loaded        = node.loaded;
  if (node.passthrough)   out.passthrough   = node.passthrough;

  out.style = style;

  const isLeaf = LEAF_TYPES.has(node.layerType);
  if (!isLeaf && node.children && node.children.length > 0) {
    out.children = node.children.map(c => mergeNode(c, rawStyles));
  }

  return out;
}

function buildSchema(annotatedTree, rawStyles) {
  if (Array.isArray(annotatedTree)) return annotatedTree.map(n => mergeNode(n, rawStyles));
  return mergeNode(annotatedTree, rawStyles);
}

if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const [,, annotatedPath, prunedPath, outputPath] = process.argv;
  if (!annotatedPath || !prunedPath || !outputPath) {
    console.error('Usage: node build-schema.js <annotated.json> <pruned.json> <output.json>');
    process.exit(1);
  }
  const annotated = JSON.parse(fs.readFileSync(annotatedPath, 'utf8'));
  const pruned    = JSON.parse(fs.readFileSync(prunedPath,    'utf8'));
  const schema    = buildSchema(annotated.tree, pruned.styles);
  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
  const count = (function c(n) {
    if (Array.isArray(n)) return n.reduce((a, x) => a + c(x), 0);
    return 1 + (n.children || []).reduce((a, x) => a + c(x), 0);
  })(schema);
  console.error('schema nodes:', count, '→', outputPath);
}

if (typeof module !== 'undefined') {
  module.exports = { buildSchema, mergeNode };
}
