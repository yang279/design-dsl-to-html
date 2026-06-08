# Node.js 服务接口文档

两个服务均使用纯 HTTP JSON 接口，无外部依赖。

---

## 服务一：组件查询服务（component-query）

**默认端口：** `3100`

**启动：**
```bash
cd nodejs/component-query
# 标准目录布局下无需设置环境变量
node server.js

# 自定义路径
COMPONENT_DIR=/path/to/harmony_out/component node server.js
```

**环境变量：**

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3100` | 监听端口 |
| `COMPONENT_DIR` | `../../pixso-parse/pix-split/harmony_out/component` | 组件 hex 文件目录（含 `component_index.json`） |
| `INDEX_PATH` | `{COMPONENT_DIR}/component_index.json` | 索引文件路径（通常不需要单独设置） |

---

### GET /health

健康检查。

**响应 200：**
```json
{
  "status": "ok",
  "component_sets": 184,
  "standalone_components": 142
}
```

---

### POST /query

根据组件名称和变体属性查询变体数据。

**请求头：** `Content-Type: application/json`

**请求体：**

```json
{
  "name": "Button",
  "props": {
    "类型": "文本",
    "状态": "正常"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 组件名称，支持中文/英文/混合，模糊匹配 |
| `props` | object | 否 | 变体属性过滤，键值对，大小写不敏感 |

**`name` 匹配规则：**

索引中组件名格式为 `.Button`、`.Title` 等（带前导点）。匹配时：
1. 去掉前导 `.`，小写化
2. 精确匹配 → 100 分
3. 包含匹配 → 60 分
4. 按空格/斜杠分词，每个 token 命中 → 10 分

返回评分最高的一个 componentSet。

**`props` 匹配规则：**

变体 name 格式为 `"类型=文本,状态=正常,尺寸=大"`，解析后与 props 逐字段比对，命中数即为 score。`matched_variants` 按 score 降序排列。

**响应 200（找到）：**

```json
{
  "found": true,
  "component_set": {
    "name": ".Button",
    "component_set_key": "ecb8481025909ec9371c3b25104bb8b7c1079224",
    "canvas_name": "1. Buttons 按钮类"
  },
  "default_variant": {
    "name": "类型=填充,状态=正常,尺寸=大",
    "symbol_id": "1:100",
    "variant_key": "549fdf93a10fec402c93432a2e228e407ccc2954",
    "component_set_key": "ecb8481025909ec9371c3b25104bb8b7c1079224",
    "score": 0
  },
  "matched_variants": [
    {
      "name": "类型=文本,状态=正常,尺寸=大",
      "symbol_id": "1:234",
      "variant_key": "abc123...",
      "component_set_key": "ecb8481025909ec9371c3b25104bb8b7c1079224",
      "score": 2
    },
    {
      "name": "类型=填充,状态=正常,尺寸=大",
      "symbol_id": "1:100",
      "variant_key": "549fdf93...",
      "component_set_key": "ecb8481025909ec9371c3b25104bb8b7c1079224",
      "score": 1
    }
  ]
}
```

**响应 200（未找到）：**

```json
{ "found": false }
```

**响应字段说明：**

| 字段 | 说明 |
|---|---|
| `found` | 是否找到匹配的组件集 |
| `component_set.component_set_key` | 组件集 key，用于设计DSL 的 `instance.component_set_key` |
| `default_variant.symbol_id` | 变体 GUID（`sessionID:localID` 格式），用于设计DSL 的 `instance.symbol_id` |
| `default_variant.variant_key` | 变体 componentKey，用于设计DSL 的 `instance.variant_key` |
| `variant.score` | 与 props 的命中数；无 props 时均为 0 |

**standalone 组件（无变体）：** `variant_key == component_set_key`，`default_variant.name` 为组件名称本身。

**响应 400：**
```json
{ "error": "name (string) is required" }
```

---

### GET /hex/:key

返回指定 componentKey 对应的 hex 文件内容（供 dsl-to-hex 服务调用）。

**路径参数：** `key` — 40 位小写 hex 字符串（SHA1 componentKey）

**响应 200：** `Content-Type: text/plain`，hex 文件原始内容

**响应 404：**
```json
{ "error": "component not found: abc123..." }
```

**响应 400（key 格式错误）：**
```json
{ "error": "key must be a 40-char lowercase hex string" }
```

---

## 服务二：DSL转hex服务（dsl-to-hex）

**默认端口：** `3101`

**启动：**
```bash
cd nodejs/dsl-to-hex
# 标准目录布局下无需设置环境变量，但 component-query 必须已启动
node server.js
```

**环境变量：**

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3101` | 监听端口 |
| `COMPONENT_QUERY_URL` | `http://localhost:3100` | 组件查询服务地址 |
| `WASM_PATH` | `../../pixso-parse/pix-dsl/bin/dsl_to_hex.js` | WASM 加载器路径（`.js` 文件，`.wasm` 必须在同目录） |

**启动顺序：** 先启动 `component-query`，再启动 `dsl-to-hex`（后者启动时会预热 WASM，不依赖 component-query，但 `/convert` 请求需要 component-query 在线）。

---

### GET /health

**响应 200：**
```json
{ "status": "ok" }
```

---

### POST /convert

接收设计DSL JSON，输出 Pixso 可导入的 hex 字符串。

**请求头：** `Content-Type: application/json`

**请求体：**

```json
{
  "dsl": {
    "meta": { ... },
    "pages": [ ... ]
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `dsl` | object | 是 | 符合 `设计dsl.md` 规范的设计DSL JSON 对象 |

**响应 200（转换成功）：**

```json
{
  "hex": "<!-- pixso binary data -->\n0a1b2c3d..."
}
```

**响应 200（转换成功，但有组件缺失）：**

```json
{
  "hex": "<!-- pixso binary data -->\n0a1b2c3d...",
  "missing_keys": [
    "ecb8481025909ec9371c3b25104bb8b7c1079224"
  ]
}
```

`missing_keys` 存在时，hex 仍有效（WASM 跳过缺失组件继续生成），但对应 instance 节点将缺失。

**响应 500（转换失败）：**

```json
{ "error": "buildMsg failed" }
```

**响应 400：**

```json
{ "error": "dsl (object) is required" }
```

---

## 完整调用流程示例

### 1. 查询 Button 文本变体

```bash
curl -X POST http://localhost:3100/query \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Button",
    "props": { "类型": "文本" }
  }'
```

取响应中 `default_variant` 的 `symbol_id`、`variant_key`、`component_set_key`，填入设计DSL 的 `instance` 字段。

### 2. 转换设计DSL为hex

```bash
curl -X POST http://localhost:3101/convert \
  -H "Content-Type: application/json" \
  -d '{
    "dsl": { "meta": { ... }, "pages": [ ... ] }
  }'
```

响应中的 `hex` 字段即为可导入 Pixso 的文件内容，写入 `.txt` 文件即可。

### 3. 获取组件hex（通常由 dsl-to-hex 内部调用）

```bash
curl http://localhost:3100/hex/ecb8481025909ec9371c3b25104bb8b7c1079224
```
