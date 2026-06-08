#!/usr/bin/env node
'use strict';
/**
 * import-to-pixso.js — Step F：将 hex 文件粘贴到 Pixso 画布
 *
 * 用法:
 *   node SCRIPTS/import-to-pixso.js <hex-file> [--port 9222]
 *
 * 前置条件：scripts/launch-pixso.js 已在后台运行，
 *           Chrome 在 --port 上开放远程调试，Pixso 设计页已加载。
 */
const fs   = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

function parseArgs(argv) {
  const a = { hex: null, port: 9222 };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if      (rest[i] === '--port') a.port = Number(rest[++i]);
    else if (!a.hex) a.hex = rest[i];
  }
  return a;
}

function getWSEndpoint(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/json/version`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).webSocketDebuggerUrl); }
        catch (e) { reject(new Error(`无法解析 /json/version 响应: ${e.message}`)); }
      });
    }).on('error', () => reject(new Error(
      `无法连接到 localhost:${port}，请先运行 node SCRIPTS/launch-pixso.js`
    )));
  });
}

function buildClipboardScript(hexContent) {
  const b64 = Buffer.from(hexContent).toString('base64');
  return `
    (function() {
      const content = atob(${JSON.stringify(b64)});
      const el = document.createElement('textarea');
      el.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px';
      el.value = content;
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    })()
  `;
}

const FOCUS_CANVAS_SCRIPT = `
  (function() {
    const c = document.querySelector('canvas');
    if (!c) return false;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    ['mousedown','mouseup','click'].forEach(type =>
      c.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy }))
    );
    return true;
  })()
`;

async function main() {
  const args = parseArgs(process.argv);
  if (!args.hex) {
    console.error('用法: node SCRIPTS/import-to-pixso.js <hex-file> [--port 9222]');
    process.exit(1);
  }

  const hexContent = fs.readFileSync(args.hex, 'utf8');
  console.log(`读取 ${path.basename(args.hex)}  (${Buffer.byteLength(hexContent)} 字节)`);

  const wsEndpoint = await getWSEndpoint(args.port);
  const browser    = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
  console.log('已连接到 Chrome');

  const pages   = await browser.pages();
  const pixsoPage = pages.find(p => p.url().includes('pixso.cn/app/design'));
  if (!pixsoPage) {
    throw new Error('Pixso 设计页未找到，请确认 launch-pixso.js 已运行且设计文件已加载');
  }
  console.log(`Pixso 页面: ${pixsoPage.url()}`);

  await pixsoPage.waitForSelector('canvas', { timeout: 30000 });

  const clipboardOk = await pixsoPage.evaluate(buildClipboardScript(hexContent));
  if (!clipboardOk) throw new Error('剪贴板写入失败（execCommand 返回 false）');
  console.log('剪贴板写入成功');

  const canvasFound = await pixsoPage.evaluate(FOCUS_CANVAS_SCRIPT);
  if (!canvasFound) throw new Error('未找到 canvas 元素，Pixso 可能尚未完全加载');
  console.log('画布已获得焦点');

  await pixsoPage.keyboard.down('Control');
  await pixsoPage.keyboard.press('v');
  await pixsoPage.keyboard.up('Control');
  console.log('Ctrl+V 已发送，等待 Pixso 导入...');

  await new Promise(r => setTimeout(r, 3000));
  console.log('✓ 导入完成');

  await browser.disconnect();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
