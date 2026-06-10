# Unified DSL Pipeline API 完整接口文档

版本: 1.0.0  
更新时间: 2026-06-09  
服务端口: 3104

---

## 目录

1. [服务概览](#服务概览)
2. [接口列表](#接口列表)
3. [接口详细说明](#接口详细说明)
4. [数据格式](#数据格式)
5. [产物存储](#产物存储)
6. [错误处理](#错误处理)
7. [使用示例](#使用示例)

---

## 服务概览

### 架构

```
统一 DSL Pipeline (端口 3104)
├── IPC 模式（推荐）
│   ├── icon-agent 子进程（端口 3103，内部通信）
│   ├── component-service 子进程（端口 3102，内部通信）
│   └── dsl-to-hex 子进程（端口 3101，内部通信）
│
└── HTTP 模式（调试）
    ├── 需手动启动三个 HTTP 服务
    └── 各服务独立监听端口
```

### 启动方式

**IPC 模式（一键启动）：**
```bash
npm start
```

**HTTP 模式（需手动启动）：**
```bash
# 启动子服务
npm run start:icon
npm run start:component
npm run start:hex
DEFAULT_MODE=http npm start
```

---

## 接口列表

| 接口 | 方法 | 说明 | 调用方式 |
|------|------|------|----------|
| `/health` | GET | 健康检查 | - |
| `/init` | POST | 初始化服务模式 | JSON body |
| `/pipeline` | POST | 完整流程 | 文件上传 |
| `/enrich` | POST | 补全节点信息 | 文件上传 |
| `/convert` | POST | DSL 转 hex | 文件上传 |
| `/artifacts` | GET | 查看产物列表 | - |
| `/artifacts/:id` | GET | 查看产物详情 | - |
| `/artifacts/:id/:file` | GET | 下载产物文件 | - |
| `/shutdown` | POST | 关闭服务 | JSON body |

---

## 接口详细说明

### 1. GET /health

健康检查接口。

**请求：**
```bash
curl http://localhost:3104/health
```

**响应：**
```json
{
  "status": "ok",
  "mode": "ipc",        // 运行模式（ipc 或 http）
  "port": 3104          // 服务端口
}
```

**字段说明：**
- `status`: 服务状态（"ok" 表示正常）
- `mode`: 运行模式（ipc 或 http）
- `port`: 当前监听端口

---

### 2. POST /init

初始化服务模式（仅在 HTTP 模式下使用）。

**请求：**
```bash
curl -X POST http://localhost:3104/init \
  -H "Content-Type: application/json" \
  -d '{"mode": "ipc"}'
```

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 是 | 运行模式，可选值："ipc" 或 "http" |

**响应：**
```json
{
  "status": "initialized",
  "mode": "ipc"
}
```

**注意：**
- IPC 模式下，服务启动时已自动初始化
- 仅在 HTTP 模式下需手动调用此接口

---

### 3. POST /pipeline

完整流程接口：补全节点信息 → 转 design-dsl → 导出 hex → 保存产物。

**请求：**
```bash
curl -X POST http://localhost:3104/pipeline \
  -F "file=@input-node.json" \
  -F "page_name=页面名称" \
  -F "mode=ipc" \
  -F "skip_enrich=false"
```

**输入参数（multipart/form-data）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | JSON 文件（node-dsl 格式） |
| `page_name` | string | 否 | design-dsl 页面名称（默认取文件名） |
| `mode` | string | 否 | 运行模式（默认 "ipc"） |
| `skip_enrich` | string | 否 | 是否跳过补全（"true" 或 "false"，默认 "false"） |

**输入文件格式（node-dsl）：**

```json
{
  "nid": 1,
  "tag": "div",
  "semantic": "container",
  "label": "页面容器",
  "rect": { "x": 0, "y": 0, "w": 375, "h": 812 },
  "children": [
    {
      "nid": 2,
      "semantic": "button",
      "label": "确定按钮",
      "rect": { "x": 20, "y": 20, "w": 100, "h": 40 }
    },
    {
      "nid": 3,
      "semantic": "icon",
      "label": "设置图标 24×24 细线",
      "rect": { "x": 300, "y": 20, "w": 24, "h": 24 }
    }
  ]
}
```

**关键字段说明：**

| 字段 | 类型 | 说明 | 何时使用 |
|------|------|------|----------|
| `nid` | number | 节点唯一 ID | 所有节点 |
| `semantic` | string | 语义类型 | 补全节点时使用 |
| `label` | string | 节点描述 | 补全节点时使用 |
| `rect` | object | 矩形坐标 | 所有节点 |
| `children` | array | 子节点 | 有子节点的节点 |

**语义类型（semantic）：**

| 值 | 补全服务 | 说明 |
|------|----------|------|
| `icon` | icon-agent | 图标节点，补全 `iconSvg` 字段 |
| `button` | component-service | 按钮节点，补全 `component` 字段 |
| `input` | component-service | 输入框节点 |
| `navbar` | component-service | 导航栏节点 |
| `tabbar` | component-service | 标签栏节点 |
| `switch` | component-service | 开关节点 |
| `badge` | component-service | 角标节点 |
| `avatar` | component-service | 头像节点 |

**响应：**
```json
{
  "success": true,
  "request_id": "2026-06-09T08-30-23-492Z-78y2qz",
  "artifacts_dir": "/path/to/output-artifacts",
  "stats": {
    "enrich": {
      "icons": 5,        // 补全的图标数
      "components": 3    // 补全的组件数
    },
    "layers": {
      "total": 60,       // 总图层数
      "frames": 42,      // frame 数
      "texts": 18,       // text 数
      "instances": 0,    // instance 数
      "placeholders": 15 // placeholder 数
    },
    "missing_keys": 0    // 缺失的组件数
  },
  "hex": "...Pixso hex 二进制数据...",
  "zip": "UEsDBBQA...", // base64 编码的 zip 包
  "missing_keys": []    // 缺失组件的 key 列表
}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功 |
| `request_id` | string | 请求唯一标识（用于查看产物） |
| `artifacts_dir` | string | 产物存储目录路径 |
| `stats.enrich.icons` | number | 成功补全的图标数 |
| `stats.enrich.components` | number | 成功补全的组件数 |
| `stats.layers` | object | 图层统计信息 |
| `stats.missing_keys` | number | 缺失的组件数量 |
| `hex` | string | Pixso hex 文件内容（文本格式） |
| `zip` | string | zip 包（base64 编码） |
| `missing_keys` | array | 缺失组件的 key 列表 |

**注意：**
- 即使补全失败（API key 未配置），仍会返回 hex 和 zip
- `missing_keys` 不为空时，hex 文件仍可导入，但缺失的组件在 Pixso 中会丢失

---

### 4. POST /enrich

仅补全节点信息（图标 + 组件），不进行 DSL 转换。

**请求：**
```bash
curl -X POST http://localhost:3104/enrich \
  -F "file=@input-node.json"
```

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | JSON 文件（node-dsl 格式） |
| `mode` | string | 否 | 运行模式（默认 "ipc"） |

**响应：**
```json
{
  "success": true,
  "final": {              // 补全后的 node-dsl
    "nid": 1,
    "children": [
      {
        "nid": 2,
        "semantic": "icon",
        "label": "设置图标",
        "iconSvg": "<svg>...</svg>"    // ← 新增字段
      },
      {
        "nid": 3,
        "semantic": "button",
        "label": "确定按钮",
        "component": {                  // ← 新增字段
          "source": "ict-ui",
          "componentKey": "...",
          "variant": {...}
        }
      }
    ]
  },
  "raw_icons": {           // icon-agent 原始响应
    "success": true,
    "content": {...}
  },
  "raw_components": [      // component-service 原始响应
    {
      "nid": 3,
      "match": {...}
    }
  ]
}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功 |
| `final` | object | 补全后的完整 node-dsl |
| `raw_icons` | object | icon-agent 的原始响应（调试用） |
| `raw_components` | array | component-service 的原始响应（调试用） |

---

### 5. POST /convert

仅将 design-dsl 转换为 hex，不进行补全。

**请求：**
```bash
curl -X POST http://localhost:3104/convert \
  -F "file=@design-dsl.json"
```

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | JSON 文件（design-dsl 格式） |
| `mode` | string | 否 | 运行模式（默认 "ipc"） |
| `page_name` | string | 否 | 页面名称（默认取 meta.file_name） |

**输入文件格式（design-dsl）：**

```json
{
  "meta": {
    "version": "1.0.0",
    "file_name": "登录页"
  },
  "pages": [
    {
      "id": "0:1",
      "name": "Page 1",
      "layers": [
        {
          "id": "1:1",
          "name": "文本",
          "type": "text",
          "visible": true,
          "opacity": 1,
          "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 200, "height": 40 },
          "text_content": "Hello World",
          "text_style": {
            "font_family": "Arial",
            "font_style": "Regular",
            "font_size": 16,
            "color": "#000000FF",
            "letter_spacing": 0,
            "line_height": "auto",
            "align_h": "left",
            "align_v": "top"
          }
        }
      ]
    }
  ]
}
```

**关键字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `meta.version` | string | 是 | DSL 格式版本（如 "1.0.0"） |
| `meta.file_name` | string | 是 | 文件名称 |
| `pages` | array | 是 | 页面列表 |
| `pages[].id` | string | 是 | 页面 GUID（格式 "sessionID:localID"） |
| `pages[].name` | string | 是 | 页面名称 |
| `pages[].layers` | array | 是 | 根图层列表 |

**图层类型（type）：**

| 值 | 说明 |
|------|------|
| `frame` | 容器帧 |
| `group` | 编组 |
| `rectangle` | 矩形 |
| `ellipse` | 椭圆 |
| `text` | 文本 |
| `instance` | 云端组件实例 |

**响应：**
```json
{
  "success": true,
  "stats": {
    "layers": {
      "total": 10,
      "frames": 2,
      "texts": 5,
      "instances": 3,
      "placeholders": 0
    },
    "missing_keys": 0
  },
  "hex": "...Pixso hex 内容...",
  "zip": "UEsDBBQA...",
  "missing_keys": []
}
```

---

### 6. GET /artifacts

查看所有产物列表。

**请求：**
```bash
curl http://localhost:3104/artifacts
```

**响应：**
```json
{
  "artifacts_dir": "/path/to/output-artifacts",
  "total": 2,
  "artifacts": [
    {
      "request_id": "2026-06-09T08-30-23-492Z-78y2qz",
      "created_at": "2026-06-09T08:30:23.839Z",
      "files": [
        "manifest.json",
        "input-node.json",
        "icon-result.json",
        "component-result.json",
        "final-node.json",
        "design-dsl.json",
        "output.hex",
        "output.zip"
      ]
    },
    {
      "request_id": "2026-06-09T08-30-12-440Z-c9h8kb",
      "created_at": "2026-06-09T08:30:12.440Z",
      "files": [...]
    }
  ]
}
```

**注意：**
- 返回最近 50 条记录
- 按时间倒序排列（最新的在前）

---

### 7. GET /artifacts/:requestId

查看指定请求的产物详情。

**请求：**
```bash
curl http://localhost:3104/artifacts/2026-06-09T08-30-23-492Z-78y2qz
```

**响应：**
```json
{
  "request_id": "2026-06-09T08-30-23-492Z-78y2qz",
  "artifacts_dir": "/path/to/output-artifacts/2026-06-09T08-30-23-492Z-78y2qz",
  "manifest": {
    "request_id": "2026-06-09T08-30-23-492Z-78y2qz",
    "created_at": "2026-06-09T08:30:23.839Z",
    "artifacts": {
      "design-dsl.json": "design-dsl.json",
      "input.json": "input-node.json",
      "raw-icons.json": "icon-result.json",
      "raw-components.json": "component-result.json",
      "final.json": "final-node.json",
      "output.hex": "output.hex",
      "output.zip": "output.zip"
    }
  },
  "files": [
    "manifest.json",
    "component-result.json",
    "design-dsl.json",
    "final-node.json",
    "icon-result.json",
    "input-node.json",
    "output.hex",
    "output.zip"
  ]
}
```

---

### 8. GET /artifacts/:requestId/:filename

下载产物文件。

**请求示例：**

```bash
# 下载 JSON 文件
curl http://localhost:3104/artifacts/2026-06-09T08-30-23-492Z-78y2qz/design-dsl.json

# 下载 hex 文件
curl http://localhost:3104/artifacts/2026-06-09T08-30-23-492Z-78y2qz/output.hex > output.hex

# 下载 zip 包
curl http://localhost:3104/artifacts/2026-06-09T08-30-23-492Z-78y2qz/output.zip > output.zip
```

**响应格式：**
- `.json` 文件 → 返回 JSON 对象
- `.hex` / `.txt` 文件 → 返回文本流
- `.zip` 文件 → 返回二进制流（application/zip）
- 其他文件 → 作为下载文件返回

---

### 9. POST /shutdown

关闭服务（优雅退出）。

**请求：**
```bash
curl -X POST http://localhost:3104/shutdown
```

**响应：**
```json
{
  "status": "shutting down"
}
```

**行为：**
- 响应后立即停止所有子进程
- 清理 IPC 连接
- 进程退出（code 0）

---

## 数据格式

### node-dsl（输入格式）

完整的节点树结构，包含语义标注。

**核心字段：**
```json
{
  "nid": number,          // 节点 ID（必填）
  "semantic": string,     // 语义类型（补全时必填）
  "label": string,        // 节点描述（补全时必填）
  "rect": {               // 矩形坐标
    "x": number,
    "y": number,
    "w": number,
    "h": number
  },
  "children": [...]       // 子节点（可选）
}
```

---

### design-dsl（输出格式）

符合 Pixso 设计规范的 DSL 格式，详见 `设计dsl.md`。

**完整示例：**
```json
{
  "meta": {
    "version": "1.0.0",
    "source": "pixso",
    "file_id": "file-abc123",
    "file_name": "登录页",
    "created_at": "2026-06-09T08:00:00Z",
    "updated_at": "2026-06-09T08:00:00Z"
  },
  "pages": [
    {
      "id": "0:1",
      "name": "页面 1",
      "layers": [...]
    }
  ]
}
```

---

## 产物存储

### 存储位置

产物存储在项目外的独立目录：

```
/Users/ucd/Desktop/未命名文件夹/output-artifacts/  ← 项目外独立目录
└── unified-dsl-pipeline/                          ← 项目目录
    └── packages/                                  ← 子包
```

**具体路径：**
```
output-artifacts/                     ← 项目外的产物目录
└── {request_id}/
    ├── manifest.json
    ├── input-node.json
    ├── icon-result.json
    ├── component-result.json
    ├── final-node.json
    ├── design-dsl.json
    ├── output.hex
    └── output.zip
```

### 每次请求的产物

```
output-artifacts/{request_id}/
├── manifest.json           元数据清单
├── input-node.json         原始输入的 node-dsl
├── icon-result.json        icon-agent 补全结果
├── component-result.json   component-service 补全结果
├── final-node.json         补全后的最终 node-dsl
├── design-dsl.json         转换后的 design-dsl
├── output.hex              最终的 hex 文件
└── output.zip              zip 包（包含 hex + placeholder）
```

### 文件说明

| 文件 | 内容 | 用途 |
|------|------|------|
| `manifest.json` | 元数据（时间、文件列表） | 快速查看信息 |
| `input-node.json` | 原始输入 | 追溯原始数据 |
| `icon-result.json` | 图标补全响应 | 查看图标匹配详情 |
| `component-result.json` | 组件补全响应 | 查看组件匹配详情 |
| `final-node.json` | 补全后的 node-dsl | 重新处理起点 |
| `design-dsl.json` | 最终的 design-dsl | 验证转换结果 |
| `output.hex` | Pixso hex 文件 | 导入 Pixso |
| `output.zip` | zip 包 | 备份或分发 |

---

## 错误处理

### 错误响应格式

所有错误都返回统一格式：

```json
{
  "error": "错误信息描述"
}
```

### HTTP 状态码

| 状态码 | 说明 | 场景 |
|--------|------|------|
| 200 | 成功 | 正常处理完成 |
| 400 | 客户端错误 | 参数缺失、格式错误 |
| 404 | 资源不存在 | request_id 或文件不存在 |
| 500 | 服务端错误 | 处理失败、服务异常 |

### 常见错误

**1. 文件未上传**
```json
{
  "error": "请上传 JSON 文件（使用 -F \"file=@input.json\"）"
}
```

**2. JSON 格式错误**
```json
{
  "error": "Unexpected token '#', \"# ── 全局配置 \"... is not valid JSON"
}
```

**3. DSL 格式不完整**
```json
{
  "error": "dsl.pages must be an array"
}
```

**4. WASM 转换失败**
```json
{
  "error": "Aborted(). Build with -sASSERTIONS for more info."
}
```

**5. 产物不存在**
```json
{
  "error": "artifacts not found: {request_id}"
}
```

---

## 使用示例

### 示例 1：完整流程

```bash
# 1. 启动服务
npm start

# 2. 上传文件处理
curl -X POST http://localhost:3104/pipeline \
  -F "file=@login-node.json" \
  -F "page_name=登录页" \
  | jq '{success, request_id, stats}'

# 3. 查看产物
curl http://localhost:3104/artifacts/{request_id}

# 4. 下载 design-dsl 查看结果
curl http://localhost:3104/artifacts/{request_id}/design-dsl.json > design-dsl.json

# 5. 下载 hex 导入 Pixso
curl http://localhost:3104/artifacts/{request_id}/output.hex > output.txt
# 在 Pixso 中导入 output.txt
```

---

### 示例 2：仅补全节点

```bash
# 补全节点信息
curl -X POST http://localhost:3104/enrich \
  -F "file=@input-node.json" \
  > enrich-result.json

# 查看补全结果
cat enrich-result.json | jq '.final'
```

---

### 示例 3：仅转换 DSL

```bash
# 已有 design-dsl，直接转换
curl -X POST http://localhost:3104/convert \
  -F "file=@design-dsl.json" \
  | jq '{success, hex_length: (.hex | length)}'
```

---

### 示例 4：查看历史记录

```bash
# 查看所有产物
curl http://localhost:3104/artifacts | jq '.total'

# 查看最近一次的产物
curl http://localhost:3104/artifacts | jq '.artifacts[0]'

# 下载某次处理的 hex
curl http://localhost:3104/artifacts/{request_id}/output.hex > hex.txt
```

---

### 示例 5：处理失败后重新处理

```bash
# 1. 获取补全后的 node-dsl（从产物）
curl http://localhost:3104/artifacts/{request_id}/final-node.json > final.json

# 2. 直接调用 convert（跳过补全）
curl -X POST http://localhost:3104/convert \
  -F "file=@final.json"
```

---

## 生产部署

### PM2 部署

```bash
pm2 start packages/pipeline-server/ecosystem.config.js
pm2 logs unified-pipeline
pm2 monit
```

### Docker 部署

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY unified-dsl-pipeline .
RUN npm install --production
EXPOSE 3104
CMD ["npm", "start"]
```

```bash
docker build -t unified-dsl-pipeline .
docker run -p 3104:3104 \
  -v /path/to/output-artifacts:/app/output-artifacts \
  unified-dsl-pipeline
```

---

## 性能指标

| 指标 | IPC 模式 | HTTP 模式 |
|------|----------|-----------|
| 进程数 | 1 + 3 子进程 | 4 独立进程 |
| 启动时间 | ~10秒 | ~10秒 + 手动启动 |
| 通信方式 | process.send | HTTP |
| 内存占用 | 共享部分资源 | 各进程独立 |
| 处理时间 | ~2秒（无补全） | ~2秒 |
| 文件大小 | hex: ~4KB, zip: ~2KB | 同左 |

---

## 常见问题

**Q1: 补全失败（icons/components = 0）？**

A: API key 未配置或无效。更新：
```bash
vi packages/icon-agent/.env       # DEEPSEEK_API_KEY
vi packages/component-service/.env # DASHSCOPE_API_KEY
```

**Q2: 产物存储占用空间过大？**

A: 定期清理旧产物（产物在项目外，不影响项目代码）：
```bash
# 删除 7 天前的产物
cd /Users/ucd/Desktop/未命名文件夹/output-artifacts
find . -type d -mtime +7 -exec rm -rf {} +

# 或保留最近 100 条
ls -t | tail -n +101 | xargs rm -rf
```

**Q3: 如何查看处理失败的详细信息？**

A: 查看产物中的 `icon-result.json` 和 `component-result.json`：
```bash
curl http://localhost:3104/artifacts/{request_id}/icon-result.json
curl http://localhost:3104/artifacts/{request_id}/component-result.json
```

---

## 版本历史

### v1.0.0 (2026-06-09)

- ✅ npm workspaces 统一管理
- ✅ 接口统一改为文件上传
- ✅ 中间产物自动存储
- ✅ 产物查看 API
- ✅ request_id 唯一标识
- ✅ 完整文档

---

## 联系方式

- 项目路径: `/Users/ucd/Desktop/未命名文件夹/unified-dsl-pipeline`
- 文档路径: `/Users/ucd/Desktop/未命名文件夹/unified-dsl-pipeline/API.md` (本文件)

---

**完整接口文档 - 结束**