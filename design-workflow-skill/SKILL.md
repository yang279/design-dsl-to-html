---
name: design-workflow
description: >
  设计稿生成与 HTML 页面转设计稿的统一入口。
  当用户描述一个页面需求（如"生成一个登录页"、"做一个首页"、"写一个设置页面"）时，
  根据描述直接生成 Pixso 可导入的设计 hex 文件；
  当用户提供 HTML 项目路径并要求分析或转换时，通过 Chrome DevTools 渲染页面、
  提取节点、语义标注、布局推断，最终同样输出设计 hex 文件。
  分析模式需要 Chrome DevTools MCP 可用。
---

# Design Workflow

## 文档目录

```
docs/
├── analyze-workflow.md     分析流程（Step 1–3）
├── generate-workflow.md    生成流程（Step A–C）
├── design-guidelines.md    设计规范参考（必读）
└── node-dsl.md             语义节点 Schema 规范
```

---

## 强制约束：不得主动启动外部服务

> ⛔ **以下行为严格禁止：**
> - 主动执行 `npm start` / `node server.js` / `PORT=xxxx npm start` 等命令来启动任何外部服务
> - 以任何形式"先检查再启动"——即便服务未响应，也不得自行启动
>
> **正确做法：** 若调用接口时服务未启动（连接拒绝 / 超时），按各流程的**降级规则**处理（跳过对应注入步骤，继续后续流程），并在最终输出中说明哪个服务不可用。
>
> 涉及的服务端口：Unified DSL Pipeline `3204`（推荐）、Chrome DevTools MCP（由外部管理）。旧版服务端口（iconAgent `3103`、Component Match `3102`、dsl-to-hex `3101`）已弃用。

---

## Unified DSL Pipeline 服务说明

> **推荐使用 `/pipeline` 接口**（端口 3204），优势：
> - ✅ **减少 HTTP 请求**：从 3 次（enrich + schema-to-design-dsl + convert）减少到 1 次（pipeline）
> - ✅ **流程简化**：补全 + 转 DSL + 导出 hex 一次性完成
> - ✅ **产物精简**：不再需要保留中间产物（schema-final.json、design-dsl.json）
> - ✅ **服务端自动存储产物**：每次请求的产物自动保存至服务端 `artifacts/` 目录，可通过 `artifact_id` 标识

**响应说明：** `/pipeline` 接口返回 `artifact_id` + `zip`（base64），hex 文件包含在 zip 包内（`output.hex`），不再作为独立字段返回。

---

## 强制约束：必须使用 SCRIPTS 目录下的脚本

> ⛔ **以下行为严格禁止，不得以任何理由绕过：**
> - 自行编写 inline JS 代码片段替代 SCRIPTS 下的脚本
> - 自行实现节点提取、剪枝、样式精简、线框生成、DSL 构建、hex 导出等逻辑
> - 将 SCRIPTS 脚本的功能"简化"后内联执行
>
> **所有脚本调用必须通过以下两种方式之一：**
> 1. `Bash` 工具执行 `node SCRIPTS/<scriptName>.js ...`（分析流程的布局分析、DSL 构建、hex 导出）
> 2. `evaluate_script` 工具读取脚本文件内容后在浏览器中执行（页面内 JS：`page-utils.js`、`extractNodes`）
>
> 若 SCRIPTS 目录下某个脚本不存在或执行报错，应报告错误并停止，不得自行替代实现。

## 脚本路径常量

本 SKILL.md 所在目录即为 SKILL_DIR。

```
SCRIPTS = SKILL_DIR/scripts
```

| 脚本文件 | 用途 | 调用方式 |
|----------|------|----------|
| `page-utils.js` | DOM 节点树提取（`extractNodes`）+ 图片数据采集（imageData/svgContent） | ⚠️ **浏览器脚本**，必须通过 `evaluate_script` 读文件内容后在页面内执行 |
| `prune-nodes.js` | 节点剪枝 + 样式精简 | ⚠️ **Node.js 脚本**，必须通过 `node SCRIPTS/prune-nodes.js` 在 Bash 中执行，不能用 evaluate_script |
| `build-schema.js` | LLM 标注结果 + prune 产物 → node-dsl schema（内部自动 simplifyStyle + 内联 style） | **Node.js CLI 脚本**，`node SCRIPTS/build-schema.js <annotated.json> <pruned.json> <output.json>` |
| `call-unified-pipeline.js` | 调用 Unified DSL Pipeline API（端口 3204）：补全 + 转 DSL + 导出，一次请求 | **Node.js 脚本**，`node SCRIPTS/call-unified-pipeline.js pipeline <input.json> <output-dir>` |

---

## Step 0 — 意图识别与路由

> **执行者：LLM**  
> 理解用户意图，选择进入哪条流程。在心里完成，不输出路由结论。

| 用户意图关键词 | 路由 |
|---|---|
| 写一个 / 做一个 / 生成 / 创建 / 设计 / 帮我画 | → 生成流程，见 [generate-workflow.md](docs/generate-workflow.md) |
| 分析 / 解析 / 检查 / 解读 / 提取 / inspect | → 分析流程，见 [analyze-workflow.md](docs/analyze-workflow.md) |

若意图模糊，默认进入生成流程。