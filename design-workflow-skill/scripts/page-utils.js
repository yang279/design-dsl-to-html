/**
 * 获取页面完整渲染尺寸（宽+高），兼容 position:absolute 溢出父框的情况
 * 用途：Step 1 扩展视口前获取真实页面宽高，确保截图不被截断
 * 返回：{ pageWidth, pageHeight }
 * 调用方式：evaluate_script → function getPageFullSize() { ... }
 */
function getPageFullSize() {
  // scrollHeight/scrollWidth 不统计 position:absolute 溢出元素，需遍历所有节点取最大值
  let maxBottom = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );
  let maxRight = Math.max(
    document.body.scrollWidth,
    document.body.offsetWidth,
    document.documentElement.scrollWidth,
    document.documentElement.offsetWidth
  );
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    const b = r.top  + window.scrollY + r.height;
    const e = r.left + window.scrollX + r.width;
    if (b > maxBottom) maxBottom = b;
    if (e > maxRight)  maxRight  = e;
  });
  return { pageWidth: Math.ceil(maxRight), pageHeight: Math.ceil(maxBottom) };
}

/**
 * 【截图专用】将所有 overflow:auto/scroll 容器改为 visible，让内容撑开文档高度
 * 保留 overflow:hidden（视觉裁剪效果不变）
 * 截图方式：take_screenshot fullPage:true（视口高度受屏幕限制，不能依赖 resize_page + fullPage:false）
 * 返回展开后 { scrollW, scrollH }
 */
function expandForScreenshot() {
  // 释放 html/body 的 height:100% 约束，让内容高度决定文档高度
  document.documentElement.style.height = 'auto';
  document.documentElement.style.minHeight = '0';
  document.body.style.height = 'auto';
  document.body.style.minHeight = '0';

  // 对每个 overflow:auto/scroll 容器：改为 visible，并把 height 改为 auto
  // 同时向下传播一级：直接子元素若是 height:100%，也改为 auto
  document.querySelectorAll('*').forEach(el => {
    const cs = window.getComputedStyle(el);
    const isScrollX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const isScrollY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    if (!isScrollX && !isScrollY) return;

    if (isScrollX) el.style.overflowX = 'visible';
    if (isScrollY) el.style.overflowY = 'visible';
    el.style.height = 'auto';
    el.style.minHeight = '0';

    for (const child of el.children) {
      const ccs = window.getComputedStyle(child);
      if (ccs.height.endsWith('%')) {
        child.style.height = 'auto';
        child.style.minHeight = '0';
      }
    }
  });

  return { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
}

/**
 * 【节点提取专用】展开所有溢出容器，使节点坐标覆盖全部隐藏内容
 * 用途：在截图完成后调用，解除所有 overflow 约束，使 extractNodes 能采集到
 *       overflow:hidden/auto/scroll 容器内被裁剪的子节点坐标和样式
 * 返回：展开后真实 { totalWidth, totalHeight }
 * 调用方式：evaluate_script → function expandForExtract() { ... }
 */
function expandForExtract() {
  document.querySelectorAll('*').forEach(el => {
    const hasV = el.scrollHeight > el.clientHeight + 2;
    const hasH = el.scrollWidth  > el.clientWidth  + 2;
    if (!hasV && !hasH) return;
    el.style.overflow = 'visible';
    if (hasV) el.style.minHeight = el.scrollHeight + 'px';
    if (hasH) el.style.minWidth  = el.scrollWidth  + 'px';
  });
  let maxRight = 0, maxBottom = 0;
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.left + r.width  > maxRight)  maxRight  = r.left + r.width;
    if (r.top  + r.height > maxBottom) maxBottom = r.top  + r.height;
  });
  maxRight = Math.ceil(maxRight); maxBottom = Math.ceil(maxBottom);
  document.documentElement.style.minHeight = maxBottom + 'px';
  document.documentElement.style.minWidth  = maxRight  + 'px';
  document.body.style.minHeight = maxBottom + 'px';
  document.body.style.minWidth  = maxRight  + 'px';
  return { totalWidth: document.documentElement.scrollWidth, totalHeight: document.documentElement.scrollHeight };
}

/**
 * 检查页面内所有 <img> 是否已加载完成
 * 用途：Step 1 扩展视口触发懒加载后，等待图片就绪再截图
 * 返回：{ total, loaded, allLoaded }
 * 调用方式：evaluate_script → function checkImagesLoaded() { ... }
 */
function checkImagesLoaded() {
  const imgs  = [...document.querySelectorAll('img')];
  const total  = imgs.length;
  const loaded = imgs.filter(img => img.complete && img.naturalWidth > 0).length;
  return { total, loaded, allLoaded: total === 0 || loaded === total };
}

/**
 * 提取完整 DOM 节点树 + computedStyle 映射
 * 返回 { tree: Node | Node[], styles: { [nid]: object } }
 * - tree: 以 body 直接子节点为根（html/body 已剥掉），单子节点时为对象，多子节点时为数组
 * - styles: nid（字符串键）→ 全量 computedStyle 字段对象（由 prune-nodes.js 精简）
 * 调用方式：evaluate_script → 读文件内容后整体执行，再调用 extractNodes()
 */
function extractNodes() {
  let _nid = 0;
  const styles = {};

  const STYLE_PROPS = [
    'display','visibility','opacity','position','zIndex',
    'top','right','bottom','left',
    'width','height','minWidth','minHeight','maxWidth','maxHeight',
    'margin','marginTop','marginRight','marginBottom','marginLeft',
    'padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
    'flexDirection','flexWrap','flexGrow','flexShrink','flexBasis',
    'justifyContent','alignItems','alignSelf','gap','rowGap','columnGap',
    'gridTemplateColumns','gridTemplateRows','gridColumn','gridRow',
    'backgroundColor','backgroundImage','backgroundSize',
    'backgroundPosition','backgroundRepeat','backgroundAttachment',
    'color','fontSize','fontWeight','fontFamily','fontStyle',
    'lineHeight','letterSpacing','textAlign','textDecoration',
    'textTransform','whiteSpace','wordBreak','overflowWrap',
    'border','borderTop','borderRight','borderBottom','borderLeft',
    'borderRadius',
    'borderTopLeftRadius','borderTopRightRadius',
    'borderBottomRightRadius','borderBottomLeftRadius',
    'boxShadow','outline','outlineOffset',
    'overflow','overflowX','overflowY',
    'transform','transformOrigin',
    'cursor','pointerEvents','userSelect',
    'maskImage','maskSize','maskPosition','maskRepeat',
    'backdropFilter','filter',
    'boxSizing','objectFit','objectPosition',
    'verticalAlign','float','clear',
    'listStyleType','listStylePosition',
    'tableLayout','borderCollapse','borderSpacing',
  ];

  const SKIP_TAGS = new Set([
    'script','style','noscript','template',
    'meta','link','title','head',
  ]);

  function getDirectText(el) {
    let t = '';
    el.childNodes.forEach(function(n) {
      if (n.nodeType === 3) t += n.textContent;
    });
    t = t.trim();
    return t ? t.slice(0, 300) : undefined;
  }

  function getAttrs(el) {
    const skip = { id: 1, class: 1, style: 1 };
    const obj = {};
    Array.from(el.attributes).forEach(function(a) {
      if (!skip[a.name.toLowerCase()]) obj[a.name] = a.value;
    });
    return Object.keys(obj).length ? obj : undefined;
  }

  function visit(el, depth) {
    if (!el || el.nodeType !== 1) return null;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (!tag || SKIP_TAGS.has(tag)) return null;

    const cs = window.getComputedStyle(el);
    // 跳过 display:none（不可见且不占空间）
    if (cs.display === 'none') return null;

    const bcr = el.getBoundingClientRect();
    const isFixed = cs.position === 'fixed';
    const x = Math.round(bcr.left + (isFixed ? 0 : window.scrollX));
    const y = Math.round(bcr.top  + (isFixed ? 0 : window.scrollY));
    const w = Math.round(bcr.width);
    const h = Math.round(bcr.height);

    const nid = ++_nid;

    // 收集 computedStyle
    const s = {};
    STYLE_PROPS.forEach(function(p) {
      const v = cs[p];
      if (v !== undefined && v !== '') s[p] = v;
    });
    styles[String(nid)] = s;

    // 构建节点
    const node = { nid: nid, tag: tag, depth: depth, rect: { x: x, y: y, w: w, h: h } };
    if (isFixed) node.rect.fixed = true;
    if (el.id) node.id = el.id;
    if (el.className && typeof el.className === 'string' && el.className.trim())
      node.class = el.className.trim().slice(0, 200);

    const text = getDirectText(el);
    if (text !== undefined) node.text = text;
    const attrs = getAttrs(el);
    if (attrs) node.attrs = attrs;

    // 标签特有字段
    if (tag === 'img') {
      if (el.src)  node.src           = el.src;
      if (el.alt)  node.alt           = el.alt;
      node.naturalWidth  = el.naturalWidth;
      node.naturalHeight = el.naturalHeight;
      node.loaded        = el.complete && el.naturalWidth > 0;
    } else if (tag === 'a') {
      if (el.href) node.href = el.href;
    } else if (tag === 'input' || tag === 'textarea') {
      if (el.type)        node.type        = el.type;
      if (el.placeholder) node.attrs = Object.assign({ placeholder: el.placeholder }, node.attrs || {});
    } else if (tag === 'video' || tag === 'audio' || tag === 'source') {
      if (el.src) node.src = el.src;
    } else if (tag === 'link') {
      if (el.href) node.href = el.href;
    }

    // 递归子节点
    const children = [];
    Array.from(el.children).forEach(function(c) {
      const child = visit(c, depth + 1);
      if (child) children.push(child);
    });
    if (children.length) node.children = children;

    // passthrough：自身尺寸为 0 但有可见后代
    if (w === 0 && h === 0 && children.length) node.passthrough = true;

    return node;
  }

  // 从 body 直接子节点开始（剥掉 html/body）
  const body = document.body;
  if (!body) return { tree: null, styles: styles };

  const roots = Array.from(body.children)
    .map(function(c) { return visit(c, 2); })
    .filter(Boolean);

  return {
    tree:   roots.length === 1 ? roots[0] : roots,
    styles: styles,
  };
}
