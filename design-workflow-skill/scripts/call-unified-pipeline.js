#!/usr/bin/env node
'use strict';
/**
 * call-unified-pipeline.js — 调用 Unified DSL Pipeline API（端口 3204）
 *
 * 用法:
 *   node call-unified-pipeline.js enrich <input-node.json> <output-final.json>
 *   node call-unified-pipeline.js convert <design-dsl.json> <output-zip.json> [--page-name "Page 1"]
 *   node call-unified-pipeline.js pipeline <input-node.json> <output-dir> [--page-name "Page 1"]
 *
 * 接口说明:
 *   - enrich: 仅补全节点信息（图标 + 组件）
 *   - convert: 仅将 design-dsl 转换为 hex
 *   - pipeline: 完整流程（补全 + 转 design-dsl + 导出 hex）
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PIPELINE_PORT = 3204;
const PIPELINE_HOST = 'localhost';

function parseArgs(argv) {
  const args = {
    action: null,
    inputFile: null,
    outputFile: null,
    outputDir: null,
    pageName: null,
    mode: 'ipc',
    skipEnrich: false
  };
  
  const rest = argv.slice(2);
  if (rest.length === 0) {
    console.error('用法: node call-unified-pipeline.js <action> <input> <output> [--page-name "Page 1"]');
    console.error('action: enrich | convert | pipeline');
    process.exit(1);
  }
  
  args.action = rest[0];
  if (rest[1]) args.inputFile = rest[1];
  
  if (args.action === 'pipeline') {
    if (rest[2]) args.outputDir = rest[2];
  } else {
    if (rest[2]) args.outputFile = rest[2];
  }
  
  for (let i = 3; i < rest.length; i++) {
    if (rest[i] === '--page-name') args.pageName = rest[++i];
    else if (rest[i] === '--mode') args.mode = rest[++i];
    else if (rest[i] === '--skip-enrich') args.skipEnrich = rest[++i] === 'true';
  }
  
  return args;
}

function buildMultipartBody(filePath, params) {
  const boundary = '----CallUnifiedPipelineBoundary' + Date.now();
  const parts = [];
  
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);
  
  parts.push(`--${boundary}`);
  parts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"`);
  parts.push('Content-Type: application/json');
  parts.push('');
  parts.push(fileContent);
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      parts.push(`--${boundary}`);
      parts.push(`Content-Disposition: form-data; name="${key}"`);
      parts.push('');
      parts.push(value);
    }
  }
  
  parts.push(`--${boundary}--`);
  
  const buffers = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (Buffer.isBuffer(part)) {
      buffers.push(part);
    } else {
      buffers.push(Buffer.from(part + '\r\n', 'utf8'));
    }
  }
  
  return {
    boundary,
    body: Buffer.concat(buffers)
  };
}

function httpRequest(method, path, body, contentType) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: PIPELINE_HOST,
      port: PIPELINE_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.length
      }
    };
    
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        try {
          const json = JSON.parse(text);
          resolve({ statusCode: res.statusCode, body: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: text });
        }
      });
    });
    
    req.on('error', (e) => reject(e));
    req.write(body);
    req.end();
  });
}

async function callEnrich(args) {
  if (!args.inputFile) {
    console.error('缺少输入文件');
    process.exit(1);
  }
  
  const params = { mode: args.mode };
  const { boundary, body } = buildMultipartBody(args.inputFile, params);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  
  console.log(`调用 /enrich 接口...`);
  const result = await httpRequest('POST', '/enrich', body, contentType);
  
  if (result.statusCode !== 200 || !result.body.success) {
    console.error('enrich 失败:', result.body.error || result.body);
    process.exit(1);
  }
  
  const outputPath = args.outputFile || args.inputFile.replace(/\.json$/, '-final.json');
  fs.writeFileSync(outputPath, JSON.stringify(result.body.final, null, 2), 'utf8');
  
  console.log(`补全成功:`);
  console.log(`  - icons: ${result.body.raw_icons?.content?.icons?.length || 0}`);
  console.log(`  - components: ${result.body.raw_components?.length || 0}`);
  console.log(`  - 输出文件: ${outputPath}`);
}

async function callConvert(args) {
  if (!args.inputFile) {
    console.error('缺少输入文件');
    process.exit(1);
  }
  
  const params = { 
    mode: args.mode,
    page_name: args.pageName || path.basename(args.inputFile, '.json')
  };
  const { boundary, body } = buildMultipartBody(args.inputFile, params);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  
  console.log(`调用 /convert 接口...`);
  const result = await httpRequest('POST', '/convert', body, contentType);
  
  if (result.statusCode !== 200 || !result.body.success) {
    console.error('convert 失败:', result.body.error || result.body);
    process.exit(1);
  }
  
  const outputPath = args.outputFile || args.inputFile.replace(/\.json$/, '-output.json');
  fs.writeFileSync(outputPath, JSON.stringify(result.body, null, 2), 'utf8');
  
  console.log(`转换成功:`);
  console.log(`  - 总图层数: ${result.body.stats?.layers?.total || 0}`);
  console.log(`  - frames: ${result.body.stats?.layers?.frames || 0}`);
  console.log(`  - texts: ${result.body.stats?.layers?.texts || 0}`);
  console.log(`  - instances: ${result.body.stats?.layers?.instances || 0}`);
  console.log(`  - placeholders: ${result.body.stats?.layers?.placeholders || 0}`);
  if (result.body.missing_keys && result.body.missing_keys.length > 0) {
    console.warn(`  - 缺失组件: ${result.body.missing_keys.join(', ')}`);
  }
  console.log(`  - 输出文件: ${outputPath}`);
  console.log(`  - hex 字段已包含，zip 字段已包含（base64）`);
}

async function callPipeline(args) {
  if (!args.inputFile) {
    console.error('缺少输入文件');
    process.exit(1);
  }
  
  if (!args.outputDir) {
    args.outputDir = path.dirname(args.inputFile);
  }
  
  const params = {
    mode: args.mode,
    page_name: args.pageName || path.basename(args.inputFile, '.json'),
    skip_enrich: args.skipEnrich ? 'true' : 'false'
  };
  const { boundary, body } = buildMultipartBody(args.inputFile, params);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  
  console.log(`调用 /pipeline 接口（完整流程）...`);
  const result = await httpRequest('POST', '/pipeline', body, contentType);
  
  if (result.statusCode !== 200 || !result.body.success) {
    console.error('pipeline 失败:', result.body.error || result.body);
    process.exit(1);
  }
  
  const artifactId = result.body.artifact_id;
  const artifactsDir = path.join(args.outputDir, artifactId);
  fs.mkdirSync(artifactsDir, { recursive: true });

  const zipBuffer = Buffer.from(result.body.zip, 'base64');
  const zipPath = path.join(artifactsDir, 'output.zip');
  fs.writeFileSync(zipPath, zipBuffer);

  const { execSync } = require('child_process');
  execSync(`unzip -o "${zipPath}" -d "${artifactsDir}"`);

  const manifestPath = path.join(artifactsDir, 'manifest.json');
  const manifest = {
    artifact_id: artifactId,
    created_at: new Date().toISOString(),
    input_file: args.inputFile,
    stats: result.body.stats,
    missing_keys: result.body.missing_keys
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`完整流程成功:`);
  console.log(`  - artifact_id: ${artifactId}`);
  console.log(`  - 补全图标: ${result.body.stats?.enrich?.icons || 0}`);
  console.log(`  - 补全组件: ${result.body.stats?.enrich?.components || 0}`);
  console.log(`  - 总图层数: ${result.body.stats?.layers?.total || 0}`);
  if (result.body.missing_keys && result.body.missing_keys.length > 0) {
    console.warn(`  - 缺失组件: ${result.body.missing_keys.join(', ')}`);
  }
  console.log(`  - 产物目录: ${artifactsDir}`);
  console.log(`  - zip 文件: ${zipPath}`);
}

const args = parseArgs(process.argv);

(async () => {
  try {
    if (args.action === 'enrich') {
      await callEnrich(args);
    } else if (args.action === 'convert') {
      await callConvert(args);
    } else if (args.action === 'pipeline') {
      await callPipeline(args);
    } else {
      console.error('未知的 action:', args.action);
      console.error('支持的 action: enrich, convert, pipeline');
      process.exit(1);
    }
  } catch (e) {
    console.error('请求失败:', e.message);
    process.exit(1);
  }
})();