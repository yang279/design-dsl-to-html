# dsl-to-hex 服务接口文档

接收设计 DSL JSON，调用 WASM 生成 Pixso 可导入的 hex 文件，并将 hex 与 placeholder 资源文件打包为 zip 返回。

- 默认端口：`3101`
- 依赖服务：[component-query](../component-query/)（负责提供组件 hex 数据）
- 无外部 npm 依赖，使用系统 `zip` 命令打包

---

## 启动

```bash
cd nodejs/dsl-to-hex

# 使用默认配置（component-query 须已在 3100 端口运行）
node server.js

# 自定义配置
PORT=3101 COMPONENT_QUERY_URL=http://localhost:3100 node server.js
```

启动时会预热 WASM，加载成功后才开始监听请求。

**环境变量：**

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3101` | 监听端口 |
| `COMPONENT_QUERY_URL` | `http://localhost:3100` | component-query 服务地址，用于拉取组件 hex 数据 |
| `WASM_PATH` | `./bin/dsl_to_hex.js` | WASM 加载器路径（`.wasm` 文件须在同目录） |

---

## 内部处理流程

```
POST /convert { dsl }
  │
  ├─ 1. 扫描 DSL 图层树，收集所有 instance 图层的 component_set_key
  ├─ 2. 并发请求 component-query GET /hex/{key}，获取组件 hex 内容
  │      拉取失败的 key 记入 missing_keys，不中断流程
  ├─ 3. 创建临时目录，写入：
  │      {key}.txt        —— 组件 hex（供 WASM 查找）
  │      {guid}.svg/png   —— placeholder 资源文件
  │      dsl.json         —— DSL 输入
  ├─ 4. 调用 WASM：dslToHex(dslPath, tmpDir) → hex 字符串
  ├─ 5. 将 hex 写为 output.hex，与 svg/png 文件一起打包为 output.zip
  ├─ 6. 清理临时目录
  └─ 返回 { zip: base64, missing_keys? }
```

---

## 接口

### GET /health

健康检查。

**响应 200：**
```json
{ "status": "ok" }
```

---

### POST /convert

将设计 DSL 转换为 zip 包，包含 hex 文件及 placeholder 资源文件。

**请求头：** `Content-Type: application/json`

**请求体：**

```json
{
  "dsl": {
    "meta": { "name": "登录页" },
    "pages": [
      {
        "id": "0:1",
        "name": "Page 1",
        "layers": [ ... ]
      }
    ]
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `dsl` | object | 是 | 符合设计 DSL 规范的 JSON 对象 |
| `dsl.pages` | array | 是 | 页面数组，不可为空 |

---

**响应 200 — 转换成功：**

```json
{
  "zip": "UEsDBAoAAAAAAMh..."
}
```

**响应 200 — 转换成功，但有组件缺失：**

```json
{
  "zip": "UEsDBAoAAAAAAMh...",
  "missing_keys": [
    "ecb8481025909ec9371c3b25104bb8b7c1079224"
  ]
}
```

`missing_keys` 存在时表示部分组件 hex 未能从 component-query 获取，对应 instance 节点在 Pixso 中将缺失，但 zip 仍有效可导入。

**响应 500 — WASM 转换失败：**

```json
{ "error": "buildMsg failed" }
```

**响应 400 — 请求参数错误：**

```json
{ "error": "dsl (object) is required" }
{ "error": "dsl.pages must be an array" }
{ "error": "invalid JSON body" }
```

---

## zip 包内容

解压后包含以下文件：

| 文件名 | 说明 |
|---|---|
| `output.hex` | Pixso 可导入的 hex 文件，写入 `.txt` 扩展名导入 Pixso 即可 |
| `{guid}.svg` | DSL 中 `placeholder.replacement_type = "svg"` 的图层，`note` 字段内容即完整 SVG 文本 |
| `{guid}.png` | DSL 中 `placeholder.replacement_type = "image"` 的图层，`note` 字段的 base64 图片解码后的二进制 PNG |

**guid 命名规则：** 图层 `id` 字段（格式 `sessionId:localId`）中冒号替换为下划线，例如 `1:14` → `1_14`。

无 placeholder 图层时，zip 仅包含 `output.hex`。

---

## placeholder 触发条件

DSL 图层满足以下条件时，才会生成对应资源文件：

```json
{
  "id": "1:14",
  "placeholder": {
    "is_placeholder": true,
    "replacement_type": "svg",
    "note": "<svg xmlns=...>...</svg>"
  }
}
```

- `is_placeholder` 必须为 `true`
- `replacement_type` 为 `"svg"` 或 `"image"`
- `note` 字段存在且非空
- `replacement_type = "image"` 时，`note` 支持带或不带 `data:image/xxx;base64,` 前缀

---

## 调用示例

```bash
# 发起转换
curl -s -X POST http://localhost:3101/convert \
  -H "Content-Type: application/json" \
  -d '{ "dsl": { "meta": { "name": "test" }, "pages": [{ "id": "0:1", "name": "Page 1", "layers": [] }] } }' \
  | jq -r '.zip' \
  | base64 -d > output.zip

# 解压
unzip output.zip
# 得到 output.hex（及 svg/png 文件）
```
