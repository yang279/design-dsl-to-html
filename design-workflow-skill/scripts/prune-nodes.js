/**
 * Step 2 预处理：节点树剪枝 + 样式精简
 *
 * 导出：
 *   pruneTree(tree, styles)
 *     → 剪枝后的节点树（不含 style 字段，结构与 step1 nodes 一致，html/body 已剥掉）
 *     → 整棵不可见时返回 null
 *
 *   simplifyStyles(tree, styles)
 *     → 精简样式映射 { [nid]: simplifiedStyle }，仅含剪枝后存活节点
 *
 *   simplifyStyle(styleObj)
 *     → 单个样式对象去默认值后的差异字段
 *
 * CLI 用法：
 *   node prune-nodes.js <nodes-file.json> <styles-file.json>
 *   → 输出 { tree, styles } 到 stdout
 */

const SKIP_TAGS = new Set([
  'head', 'meta', 'script', 'noscript', 'style', 'title', 'link', 'template'
]);

const REPLACED_ELEMENTS = new Set([
  'img', 'svg', 'canvas', 'input', 'textarea', 'video', 'audio', 'select', 'iframe'
]);

// ─── 样式精简 ────────────────────────────────────────────────────────────────

/**
 * 去掉计算样式中的浏览器默认值，只保留对语义判断有意义的字段
 * @param {object} s - computedStyle 对象
 * @returns {object}
 */
function simplifyStyle(s) {
  if (!s) return {};
  const o = {};

  // 文字
  if (s.fontSize)                                                       o.fontSize      = s.fontSize;
  if (s.fontWeight && s.fontWeight !== '400')                           o.fontWeight    = s.fontWeight;
  if (s.color && s.color !== 'rgb(0, 0, 0)')                           o.color         = s.color;
  if (s.lineHeight && s.lineHeight !== 'normal')                        o.lineHeight    = s.lineHeight;
  if (s.letterSpacing && s.letterSpacing !== 'normal'
                      && s.letterSpacing !== '0px')                     o.letterSpacing = s.letterSpacing;
  if (s.textAlign && s.textAlign !== 'start' && s.textAlign !== 'left') o.textAlign     = s.textAlign;
  if (s.textTransform && s.textTransform !== 'none')                    o.textTransform = s.textTransform;
  if (s.whiteSpace && s.whiteSpace !== 'normal')                        o.whiteSpace    = s.whiteSpace;

  // 布局
  if (s.display && s.display !== 'block' && s.display !== 'inline')    o.display       = s.display;
  if (s.position && s.position !== 'static')                            o.position      = s.position;
  if (s.flexDirection && s.flexDirection !== 'row')                     o.flexDirection = s.flexDirection;
  if (s.flexWrap && s.flexWrap !== 'nowrap')                            o.flexWrap      = s.flexWrap;
  if (s.justifyContent && s.justifyContent !== 'normal'
                       && s.justifyContent !== 'flex-start')            o.justifyContent = s.justifyContent;
  if (s.alignItems && s.alignItems !== 'normal'
                   && s.alignItems !== 'stretch')                       o.alignItems    = s.alignItems;
  if (s.gap && s.gap !== 'normal' && s.gap !== '0px')                  o.gap           = s.gap;
  if (s.gridTemplateColumns && s.gridTemplateColumns !== 'none')        o.gridTemplateColumns = s.gridTemplateColumns;

  // 定位坐标
  if (s.top    && s.top    !== 'auto') o.top    = s.top;
  if (s.left   && s.left   !== 'auto') o.left   = s.left;
  if (s.right  && s.right  !== 'auto') o.right  = s.right;
  if (s.bottom && s.bottom !== 'auto') o.bottom = s.bottom;
  if (s.zIndex && s.zIndex !== 'auto') o.zIndex = s.zIndex;

  // 背景
  const bg = s.backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') o.backgroundColor = bg;
  if (s.backgroundImage && s.backgroundImage !== 'none') {
    o.backgroundImage = s.backgroundImage;
    if (s.backgroundSize)                                        o.backgroundSize     = s.backgroundSize;
    if (s.backgroundPosition)                                    o.backgroundPosition = s.backgroundPosition;
    if (s.backgroundRepeat && s.backgroundRepeat !== 'repeat')   o.backgroundRepeat   = s.backgroundRepeat;
  }

  // 装饰
  if (s.borderRadius && s.borderRadius !== '0px')   o.borderRadius = s.borderRadius;
  if (s.border && !s.border.startsWith('0px'))       o.border       = s.border;
  if (s.boxShadow && s.boxShadow !== 'none')         o.boxShadow    = s.boxShadow;
  if (s.opacity && s.opacity !== '1')                o.opacity      = s.opacity;
  if (s.overflow && s.overflow !== 'visible')        o.overflow     = s.overflow;
  if (s.transform && s.transform !== 'none')         o.transform    = s.transform;

  // 遮罩
  if (s.maskImage && s.maskImage !== 'none') {
    o.maskImage = s.maskImage;
    if (s.maskSize)     o.maskSize     = s.maskSize;
    if (s.maskPosition) o.maskPosition = s.maskPosition;
  }
  if (s.backdropFilter) o.backdropFilter = s.backdropFilter;

  // 图片内容（非 CSS 字段，透传）
  if (s.imageData)  o.imageData  = s.imageData;
  if (s.svgContent) o.svgContent = s.svgContent;

  return o;
}

// ─── 可绘制性判断 ─────────────────────────────────────────────────────────────

function isSelfPaintable(node, style) {
  if (REPLACED_ELEMENTS.has(node.tag))                             return true;
  if (node.text && node.text.trim())                               return true;
  const bg = style.backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent')   return true;
  if (style.backgroundImage && style.backgroundImage !== 'none')  return true;
  if (style.boxShadow && style.boxShadow !== 'none')              return true;
  if (style.border && !style.border.startsWith('0px'))            return true;
  return false;
}

// ─── 剪枝主函数 ───────────────────────────────────────────────────────────────

/**
 * 自底向上剪枝，不内联样式（样式由 simplifyStyles 单独输出，保持结构与样式分离）
 * @param {object} tree   - nodes-<filename>.json 的 tree 字段
 * @param {object} styles - styles-<filename>.json 的 styles 字段 { [nid]: computedStyle }
 * @returns {object|null}
 */
function pruneTree(tree, styles) {
  // <html> 和 <body> 是纯结构包裹层，逐层剥掉，从实际内容节点开始
  if (tree.tag === 'html' || tree.tag === 'body') {
    const kids = (tree.children || [])
      .map(c => pruneTree(c, styles))
      .filter(Boolean);
    if (kids.length === 1) return kids[0];
    if (kids.length  >  1) return kids; // 多个顶层子节点时返回数组
    return null;
  }

  function visit(node) {
    if (SKIP_TAGS.has(node.tag)) return null;

    const style = styles[String(node.nid)] || {};

    if (style.display    === 'none')    return null;
    if (style.visibility === 'hidden')  return null;
    if (style.opacity    === '0')       return null;

    // 先递归子节点（自底向上）
    const children = (node.children || []).map(visit).filter(Boolean);

    const paintable = isSelfPaintable(node, style);
    const hasKids   = children.length > 0;

    // 自身不可绘制且无可见后代 → 整棵剪掉
    if (!paintable && !hasKids) return null;

    const out = {
      nid:  node.nid,
      tag:  node.tag,
      rect: node.rect
    };

    if (node.id)    out.id    = node.id;
    if (node.class) out.class = node.class;
    if (node.attrs) out.attrs = node.attrs;
    if (node.text)  out.text  = node.text;

    // 特定元素专属字段
    if (node.src !== undefined)           out.src           = node.src;
    if (node.alt !== undefined)           out.alt           = node.alt;
    if (node.href !== undefined)          out.href          = node.href;
    if (node.naturalWidth !== undefined)  out.naturalWidth  = node.naturalWidth;
    if (node.naturalHeight !== undefined) out.naturalHeight = node.naturalHeight;
    if (node.loaded !== undefined)        out.loaded        = node.loaded;

    // 0 尺寸但有可见后代：透传容器，标记供 LLM 跳过语义判断
    if (node.rect.w === 0 && node.rect.h === 0 && !paintable && hasKids) {
      out.passthrough = true;
    }

    if (hasKids) out.children = children;

    return out;
  }

  return visit(tree);
}

// ─── 样式精简（存活节点） ──────────────────────────────────────────────────────

/**
 * 收集剪枝后树中所有存活节点的 nid
 */
function collectNids(node, acc = new Set()) {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => collectNids(n, acc)); return acc; }
  acc.add(String(node.nid));
  (node.children || []).forEach(c => collectNids(c, acc));
  return acc;
}

/**
 * 为剪枝后的存活节点生成精简样式映射
 * @param {object|Array} prunedTree - pruneTree() 的返回值
 * @param {object} styles           - step1 styles-<filename>.json 的 styles 字段
 * @returns {{ [nid]: simplifiedStyle }}
 */
function simplifyStyles(prunedTree, styles) {
  const nids   = collectNids(prunedTree);
  const result = {};
  for (const nid of nids) {
    const slim = simplifyStyle(styles[nid] || {});
    if (Object.keys(slim).length) result[nid] = slim;
  }
  return result;
}

// ─── 模块导出 ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined') {
  module.exports = { pruneTree, simplifyStyles, simplifyStyle };
}

// ─── CLI 入口 ─────────────────────────────────────────────────────────────────
// node prune-nodes.js <combined.json>
// combined.json 格式：{ tree, styles }  （Step 1 的合并产物）
// → stdout: { tree, styles }

if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const [,, combinedPath] = process.argv;
  if (!combinedPath) {
    console.error('Usage: node prune-nodes.js <combined.json>');
    process.exit(1);
  }
  const combined = JSON.parse(fs.readFileSync(combinedPath, 'utf8'));
  const tree   = pruneTree(combined.tree, combined.styles);
  const styles = simplifyStyles(tree, combined.styles);
  console.log(JSON.stringify({ tree, styles }, null, 2));
}
