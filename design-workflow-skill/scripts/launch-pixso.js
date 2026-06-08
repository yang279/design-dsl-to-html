#!/usr/bin/env node
'use strict';
/**
 * launch-pixso.js — 启动（或连接）Chrome 并打开 Pixso 设计页
 *
 * 用法:
 *   node launch-pixso.js [--login] [--port 9222]
 *
 *   --login   执行手机号/密码登录流程（未登录时使用）
 *   --port    Chrome 远程调试端口，默认 9222
 *
 * 环境变量:
 *   PIXSO_PHONE    手机号，默认 15220204107
 *   PIXSO_PASS     密码，默认 a123456
 *   PIXSO_URL      设计页 URL，默认见下方 TARGET_URL
 */
const puppeteer = require('puppeteer');
const http      = require('http');
const path      = require('path');

const TARGET_URL   = process.env.PIXSO_URL ||
  'https://pixso.cn/app/design/FqBKf_TBzAFE53TQ5g2zTQ?showQuickFrame=true&new=1&icon_type=1&page-id=0%3A1';
const LOGIN_URL    = 'https://pixso.cn/user/login/?redirect_uri=https%3A%2F%2Fpixso.cn%2Fapp%2F&from=1&product=pixso&ux_mode=redirect&from_url=https%3A%2F%2Fpixso.cn%2F';
const CHROME_PROFILE = path.join(__dirname, '..', 'chrome-profile');

const PHONE = process.env.PIXSO_PHONE || '15220204107';
const PASS  = process.env.PIXSO_PASS  || 'a123456';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const a = { login: false, port: 9222 };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if      (rest[i] === '--login') a.login = true;
    else if (rest[i] === '--port')  a.port  = Number(rest[++i]);
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
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function doLogin(page) {
  console.log('执行登录...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1000);

  // 已跳转到 app 说明已登录
  if (new URL(page.url()).pathname.startsWith('/app/')) {
    console.log('已处于登录状态');
    return true;
  }

  // 切到手机号登录
  const hasTips = await page.$('.change-box-tips-content');
  if (hasTips) { await page.click('.change-box-tips-content'); await sleep(700); }

  // 切到密码登录 tab
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(
      e => e.children.length === 0 && e.innerText?.trim() === '密码登录'
    );
    if (el) el.click();
  });
  await sleep(500);

  await page.waitForSelector('input[type="password"]', { timeout: 8000 });

  // 填手机号 + 密码
  await page.evaluate(phone => {
    const inputs   = Array.from(document.querySelectorAll('input'));
    const phoneEl  = inputs.find(el => el.placeholder?.includes('手机号'));
    if (phoneEl) {
      phoneEl.focus();
      phoneEl.value = phone;
      phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, PHONE);
  await sleep(200);

  const pwInput = await page.$('input[type="password"]');
  await pwInput.click({ clickCount: 3 });
  await pwInput.type(PASS, { delay: 60 });

  // 勾选隐私政策
  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]');
    if (cb) (cb.closest('label') || cb.parentElement || cb).click();
  });
  await sleep(300);

  await page.click('.btn--next');
  console.log('登录表单已提交...');

  // 处理隐私政策弹窗
  await sleep(1500);
  await page.evaluate(() => {
    const ok = Array.from(document.querySelectorAll('*')).find(
      e => e.children.length === 0 && e.innerText?.trim() === '确定' && e.offsetParent !== null
    );
    if (ok) ok.click();
  });

  await sleep(4000);
  const loggedIn = new URL(page.url()).pathname.startsWith('/app/');
  if (loggedIn) console.log('登录成功');
  else          console.error('登录可能失败，当前 URL:', page.url());
  return loggedIn;
}

(async () => {
  const args = parseArgs(process.argv);

  // 优先连接已有 Chrome
  let browser;
  try {
    const ws = await getWSEndpoint(args.port);
    browser  = await puppeteer.connect({ browserWSEndpoint: ws });
    console.log('已连接到已有 Chrome 实例');
  } catch {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir: CHROME_PROFILE,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--remote-debugging-port=${args.port}`,
      ],
    });
    console.log('已启动新 Chrome 实例');
  }

  const page = await browser.newPage();

  if (args.login) {
    const ok = await doLogin(page);
    if (!ok) { console.error('登录失败'); process.exit(1); }
  }

  // 导航到设计页（若不在设计页）
  if (!page.url().includes('/app/design/')) {
    console.log('正在打开设计页...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  }

  console.log('已就绪:', await page.title());
  console.log('按 Ctrl+C 退出');
  await new Promise(() => {});  // 保持进程存活
})().catch(e => { console.error(e.message); process.exit(1); });
