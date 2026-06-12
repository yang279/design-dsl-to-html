/**
 * Step 1 后处理：将 styles 中 backgroundImage 的 file:// 静态资源解析为 imageData / svgContent
 *
 * 浏览器端因安全限制无法通过 XHR 读取 file:// 二进制文件，
 * 此脚本在 Node.js 侧直接读取本地文件并写回 step1 JSON。
 *
 * - data:image/svg+xml  → 已由浏览器端 page-utils.js 解码，跳过
 * - file://*.svg        → fs 读取文本，写入 svgContent
 * - file://*.(png|jpg…) → fs 读取二进制，base64 编码，写入 imageData
 *
 * CLI 用法：
 *   node resolve-bg-images.js <step1.json>
 *   直接原地修改，无 stdout 输出（进度打印到 stderr）
 */

const fs = require('fs');

const [,, inputPath] = process.argv;
if (!inputPath) {
  console.error('Usage: node resolve-bg-images.js <step1.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', bmp:'image/bmp' };

function bgImageSrc(bgImage) {
  if (!bgImage || bgImage === 'none') return null;
  const m = bgImage.match(/url\("?([^")\s]+)"?\)/);
  return m ? m[1] : null;
}

function fileUrlToPath(url) {
  return decodeURIComponent(url.replace(/^file:\/\//, ''));
}

function isSvg(filePath) {
  return filePath.split('?')[0].toLowerCase().endsWith('.svg');
}

let resolved = 0;
for (const style of Object.values(data.styles)) {
  if (style.imageData || style.svgContent) continue;

  const src = bgImageSrc(style.backgroundImage);
  if (!src || !src.startsWith('file://')) continue;

  const filePath = fileUrlToPath(src);
  if (!fs.existsSync(filePath)) continue;

  if (isSvg(filePath)) {
    style.svgContent = fs.readFileSync(filePath, 'utf8');
  } else {
    const buf = fs.readFileSync(filePath);
    const ext = filePath.split('.').pop().toLowerCase();
    const mime = MIME[ext] || 'image/png';
    style.imageData = 'data:' + mime + ';base64,' + buf.toString('base64');
  }
  resolved++;
}

fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
console.error('resolve-bg-images: resolved', resolved, '→', inputPath);
