/**
 * 判断 src 是否指向 SVG（含 data:image/svg+xml 和 .svg 后缀 URL）
 */
function _isSvgSrc(src) {
  if (!src) return false;
  if (src.startsWith('data:image/svg')) return true;
  return src.split('?')[0].toLowerCase().endsWith('.svg');
}

/**
 * 获取 SVG 内容字符串
 * - data URL：直接解码
 * - file/http URL：同步 XHR 读取原始 XML
 */
function _getSvgContent(src) {
  if (!src) return null;
  if (src.startsWith('data:image/svg')) {
    const comma = src.indexOf(',');
    if (comma === -1) return null;
    const isBase64 = src.substring(0, comma).includes('base64');
    const data = src.substring(comma + 1);
    try { return isBase64 ? atob(data) : decodeURIComponent(data); } catch (e) { return null; }
  }
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', src, false);
    xhr.send();
    return (xhr.status === 0 || xhr.status === 200) ? xhr.responseText.trim() : null;
  } catch (e) { return null; }
}

/**
 * 将 <img> 元素内容转为 base64 Data URL
 * - 已是 data URL 时直接返回
 * - 否则通过 canvas drawImage 编码为 PNG base64
 */
function _imgToBase64(imgEl) {
  if (imgEl.src && imgEl.src.startsWith('data:')) return imgEl.src;
  try {
    const w = imgEl.naturalWidth  || imgEl.offsetWidth  || 1;
    const h = imgEl.naturalHeight || imgEl.offsetHeight || 1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(imgEl, 0, 0);
    return c.toDataURL();
  } catch (e) { return null; } // 跨域图片 canvas 污染时返回 null
}

/**
 * 将静态资源 URL 转为 base64 Data URL（同步 XHR 二进制读取）
 * - 已是 data URL 时直接返回
 * - 使用 charset=x-user-defined 绕过 sync XHR 不能设 responseType 的限制
 */
function _urlToBase64(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', src, false);
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    xhr.send();
    if (xhr.status !== 0 && xhr.status !== 200) return null;
    const raw = xhr.responseText;
    let binary = '';
    for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw.charCodeAt(i) & 0xff);
    const ext = src.split('?')[0].toLowerCase().split('.').pop();
    const mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp' }[ext] || 'image/png';
    return 'data:' + mime + ';base64,' + btoa(binary);
  } catch (e) { return null; }
}

/**
 * 从 CSS background-image 值中提取第一个 url() 的 src
 * 忽略 linear-gradient / radial-gradient 等纯 CSS 值
 */
function _bgImageSrc(bgImage) {
  if (!bgImage || bgImage === 'none') return null;
  const m = bgImage.match(/url\("?([^")\s]+)"?\)/);
  return m ? m[1] : null;
}

/**
 * 提取完整 DOM 节点树 + computedStyle 映射
 * 返回 { tree: Node | Node[], styles: { [nid]: object } }
 * - tree: 以 body 直接子节点为根（html/body 已剥掉），单子节点时为对象，多子节点时为数组
 * - styles: nid（字符串键）→ 全量 computedStyle 字段对象 + imageData/svgContent
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

    // 图片内容内嵌：img 标签转 base64 / SVG XML；内联 <svg> 取 outerHTML
    if (tag === 'img' && el.complete && el.naturalWidth > 0) {
      if (_isSvgSrc(el.src)) {
        const xml = _getSvgContent(el.src);
        if (xml) s.svgContent = xml;
      } else {
        const b64 = _imgToBase64(el);
        if (b64) s.imageData = b64;
      }
    } else if (tag === 'svg') {
      s.svgContent = el.outerHTML;
    }

    // CSS background-image 静态资源采集（img/svg 未命中时才检查）
    if (!s.imageData && !s.svgContent) {
      const bgSrc = _bgImageSrc(s.backgroundImage);
      if (bgSrc) {
        if (_isSvgSrc(bgSrc)) {
          const xml = _getSvgContent(bgSrc);
          if (xml) s.svgContent = xml;
        } else {
          const b64 = _urlToBase64(bgSrc);
          if (b64) s.imageData = b64;
        }
      }
    }

    // 构建节点
    const node = { nid: nid, tag: tag, rect: { x: x, y: y, w: w, h: h } };
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
