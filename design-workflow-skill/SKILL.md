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
├── spec/                         ← 流程规范 + DSL 结构定义
│   ├── analyze-workflow.md       分析流程（Step 1–4）
│   ├── generate-workflow.md      生成流程（Step A–D）
│   ├── node-dsl.md               语义节点 Schema 规范
│   └── design-dsl.md             设计 DSL（Pixso 图层格式）规范
└── api/                          ← 外部服务接口文档
    ├── icon-api.md               iconAgent（端口 3103）
    ├── component-api.md          Component Match（端口 3102）
    └── dsl2hex-api.md            dsl-to-hex（端口 3101）
```

---

## 强制约束：不得主动启动外部服务

> ⛔ **以下行为严格禁止：**
> - 主动执行 `npm start` / `node server.js` / `PORT=xxxx npm start` 等命令来启动任何外部服务
> - 以任何形式"先检查再启动"——即便服务未响应，也不得自行启动
>
> **正确做法：** 若调用接口时服务未启动（连接拒绝 / 超时），按各流程的**降级规则**处理（跳过对应注入步骤，继续后续流程），并在最终输出中说明哪个服务不可用。
>
> 涉及的服务端口：iconAgent `3103`、Component Match `3102`、dsl-to-hex `3101`、Chrome DevTools MCP（由外部管理）。

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
| `page-utils.js` | 页面展开（`expandForScreenshot`）、图片检测（`checkImagesLoaded`）、节点提取（`extractNodes`） | ⚠️ **浏览器脚本**，必须通过 `evaluate_script` 读文件内容后在页面内执行 |
| `prune-nodes.js` | 节点剪枝 + 样式精简 | ⚠️ **Node.js 脚本**，必须通过 `node SCRIPTS/prune-nodes.js` 在 Bash 中执行，不能用 evaluate_script |
| `gen-wireframe.js` | 语义线框 HTML 生成 | ⚠️ **Node.js CLI 脚本**，必须通过 `node SCRIPTS/gen-wireframe.js` 在 Bash 中执行，不能用 evaluate_script |
| `build-dsl.js` | 节点树 → DSL JSON（旧流程，nodes+styles 分离格式） | **Node.js 脚本**，`node SCRIPTS/build-dsl.js` |
| `schema-to-design-dsl.js` | node-dsl schema-final JSON → design-dsl JSON（含 iconSvg/component 字段处理） | **Node.js 脚本**，`node SCRIPTS/schema-to-design-dsl.js` |
| `export-hex.js` | DSL JSON → Pixso hex | **Node.js 脚本**，`node SCRIPTS/export-hex.js` |
| `launch-pixso.js` | 启动/连接 Chrome 并打开 Pixso 设计页 | **Node.js 脚本**，`node SCRIPTS/launch-pixso.js [--login]`，需在后台常驻 |
| `import-to-pixso.js` | 将 hex 粘贴到 Pixso 画布 | **Node.js 脚本**，`node SCRIPTS/import-to-pixso.js <hex-file>` |

---

## Step 0 — 意图识别与路由

> **执行者：LLM**  
> 理解用户意图，选择进入哪条流程。在心里完成，不输出路由结论。

| 用户意图关键词 | 路由 |
|---|---|
| 写一个 / 做一个 / 生成 / 创建 / 设计 / 帮我画 | → 生成流程，见 [generate-workflow.md](docs/spec/generate-workflow.md) |
| 分析 / 解析 / 检查 / 解读 / 提取 / inspect | → 分析流程，见 [analyze-workflow.md](docs/spec/analyze-workflow.md) |

若意图模糊，默认进入生成流程。
