#!/usr/bin/env node
'use strict';
/**
 * export-hex.js — 调用 dsl-to-hex 服务，将设计 DSL 转换为 Pixso 可导入的 hex + zip
 *
 * 用法:
 *   node export-hex.js DSL.json [--url http://localhost:3101] [--out output.hex]
 *
 * 产物（写入与 DSL.json 同目录，或 --out 指定目录）：
 *   <slug>.zip    — 原始 zip 包（含 output.hex 及 svg/png 资源）
 *   <out>         — 从 zip 中提取的 hex 文件（默认 output.hex）
 */
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');
const http  = require('http');
const https = require('https');

function load(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port,
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        else resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseArgs(argv) {
  const a = { dsl: null, url: 'http://localhost:3101', out: 'output.hex' };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if      (rest[i] === '--url') a.url = rest[++i];
    else if (rest[i] === '--out') a.out = rest[++i];
    else if (!a.dsl) a.dsl = rest[i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dsl) {
    console.error('Usage: node export-hex.js DSL.json [--url http://localhost:3101] [--out output.hex]');
    process.exit(1);
  }

  const dsl = load(args.dsl);
  console.log(`POST ${args.url}/convert  (file: ${dsl.meta?.file_name || args.dsl})`);

  const result = await post(`${args.url}/convert`, { dsl });

  // API 返回 { zip: base64, missing_keys? }，不是 { hex }
  if (!result.zip) {
    console.error('转换失败:', JSON.stringify(result));
    process.exit(1);
  }

  // 1. base64 解码写出 zip
  const outAbs   = path.resolve(args.out);
  const outDir   = path.dirname(outAbs);
  const zipPath  = outAbs.replace(/\.(hex|txt)$/, '') + '.zip';
  const zipBuf   = Buffer.from(result.zip, 'base64');
  fs.writeFileSync(zipPath, zipBuf);
  console.log(`已写出 ${zipPath}  (${zipBuf.length} 字节)`);

  // 2. 解压（含 output.hex 及 svg/png 资源）
  execSync(`unzip -o "${zipPath}" -d "${outDir}"`);

  // 3. 将解压出的 output.hex 重命名为 --out 指定路径
  const extractedHex = path.join(outDir, 'output.hex');
  if (path.resolve(extractedHex) !== outAbs && fs.existsSync(extractedHex)) {
    fs.renameSync(extractedHex, outAbs);
  }
  console.log(`已提取 ${outAbs}`);

  if (result.missing_keys && result.missing_keys.length) {
    console.warn(`⚠ 缺失组件 ${result.missing_keys.length} 个: ${result.missing_keys.slice(0, 3).join(', ')}${result.missing_keys.length > 3 ? '...' : ''}`);
  } else {
    console.log('✓ 所有组件均已解析');
  }

  return result;
}

main().catch(e => { console.error(e.message); process.exit(1); });
