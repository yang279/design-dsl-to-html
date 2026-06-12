# 分析流程（Step 1–3）

> 适用：用户提供一个 HTML 项目目录路径，需要提取语义结构并输出设计 DSL。  
> **需要 Chrome DevTools MCP**（Step 1）。

## 执行模式总览

| 步骤 | 执行者 | 核心工作 |
|------|--------|----------|
| Step 1 — 渲染 + 节点提取 | **Chrome DevTools MCP + 纯脚本** | 浏览器渲染、DOM 遍历提取节点树，全程无 LLM |
| Step 2 — 语义标注 | **纯脚本**（剪枝/精简/线框）<br>**LLM**（语义标注） | 脚本做预处理和后处理；LLM 只负责给每个节点打 semantic/label/confidence |
| Step 3 — 完整流程 | **脚本** | 调用 `/pipeline` 接口，一次性完成补全 + 转 DSL + 导出 hex（仅需一次 HTTP 请求） |

## 产物目录结构

```
<PROJECT_DIR>-output/
├── step1/  <filename>.json（节点树 + 原始样式 + 图片数据，合并为单文件）
├── step2/  schema-*.json
└── step3/  pipeline-result-*.json + output-*.zip + 解压产物
```

---

## Step 1 — 加载页面 + 提取节点数据

> **执行者：Chrome DevTools MCP + 纯脚本（page-utils.js），无 LLM**  
> 用浏览器真实渲染页面，提取所有 DOM 节点的原始样式和图片数据。**不对 DOM 做任何修改**，所有字段定义以 [node-dsl.md](node-dsl.md) 为准。

**创建产物目录：**
```bash
mkdir -p "<PROJECT_DIR>-output/step1"
```

**对每个 HTML 文件依次执行：**

1. **[Chrome DevTools MCP]** `resize_page` → 1440×900，`navigate_page` → `file://<PROJECT_DIR>/<filename>.html`

2. **[Chrome DevTools MCP + 纯脚本]** `evaluate_script` → 读取 `SCRIPTS/page-utils.js`，调用 `extractNodes()`  
   采集完整 DOM 节点树（字段定义见 node-dsl.md 的 Node 结构）及每个节点的全量原始 computedStyle；  
   对 `img` 标签和内联 `<svg>` 同步采集图片数据（`imageData` / `svgContent`），写入 styles 对象对应 nid 条目。  
   **不对 DOM 做任何修改，只读取节点信息。**

3. **[Chrome DevTools MCP]** `close_page` → 关闭页面（若为最后一个 tab 无法关闭则跳过）

4. **[纯脚本]** 将 `extractNodes()` 返回值直接写入：  
   `step1/<filename>.json` — 合并格式 `{ "tree": <节点树>, "styles": { "[nid]": <rawStyle> } }`  
   - `tree`：节点树，每个节点字段按 node-dsl.md Node 定义（含 nid/tag/rect/text/src/alt/naturalWidth/naturalHeight/loaded/href/type/passthrough/children 等）  
   - `styles`：以 nid 字符串为键，值为原始 computedStyle 对象（含 `imageData`/`svgContent`）；**不做任何精简，全量保留**

5. **[纯脚本]** Bash 调用 `resolve-bg-images.js`，将 styles 中 `backgroundImage` 的 `file://` 本地静态资源解析为 `imageData`/`svgContent`（浏览器端因安全限制无法读取本地二进制文件，由 Node.js 补全）：
   ```bash
   node SCRIPTS/resolve-bg-images.js \
     "<PROJECT_DIR>-output/step1/<filename>.json"
   ```
   原地修改 step1 JSON，无新增产物。

**Step 1 验收：** 每页的 `step1/<filename>.json` 存在，`tree` 非空，`styles` 的键数等于树的节点总数 → 才可进入 Step 2。

---

## Step 2 — 语义标注

> **执行者：纯脚本（剪枝、样式精简、线框生成）+ LLM（语义标注）**  
> 脚本负责"能算出来的"部分：剪掉不可见节点、去掉冗余样式字段、生成 HTML 线框。  
> LLM 只负责"需要理解的"部分：判断每个节点的语义类型（button/input/navbar 等）并打置信度标签。

**创建产物目录：**
```bash
mkdir -p "<PROJECT_DIR>-output/step2"
```

**对每个页面依次执行：**

1. **[纯脚本]** Bash 调用 `prune-nodes.js`，剪掉不可见节点：
   ```bash
   node SCRIPTS/prune-nodes.js \
     "<PROJECT_DIR>-output/step1/<filename>.json" \
     > /tmp/pruned-<filename>.json
   ```
   基于 `display:none` / `visibility:hidden` / `opacity:0` 剪枝，输出 `{ tree, styles }` 到 stdout

2. **[LLM]** 语义标注：统计剪枝后节点数，为每个节点追加以下字段（字段含义见 [node-dsl.md](node-dsl.md)）：
   - `layerType`（必填）：`frame` / `text` / `image` / `icon` / `component` 选一
   - `layerName`（必填）：节点语义的简短名称，同页面同类节点必须可区分
   - `layerDescription`（必填）：节点的详细业务描述；`icon` 须注明尺寸和线条粗细
   - `layerConfidence`（可选）：把握不足时填 `"low"`，省略即为 high  
   ⛔ 节点数 > 150 时**必须分块**：按顶层子节点拆分，每块 ≤ 150 节点，逐块标注完成后合并  
   ⛔ 标注完成后将结果写入 `/tmp/annotated-<filename>.json`，格式 `{ "tree": <标注后节点树> }`

3. **[纯脚本]** Bash 调用 `build-schema.js`，合并标注结果与精简样式，输出最终 schema：
   ```bash
   node SCRIPTS/build-schema.js \
     /tmp/annotated-<filename>.json \
     /tmp/pruned-<filename>.json \
     "<PROJECT_DIR>-output/step2/schema-<filename>.json"
   ```
   内部自动对每个节点的样式调用 `simplifyStyle` 精简后内联；`text`/`icon`/`component` 节点剥除 `children`

4. **[纯脚本]** 清理临时文件：`rm /tmp/pruned-<filename>.json /tmp/annotated-<filename>.json`

**Step 2 验收：** 每页的 `schema-<filename>.json` 存在 + 所有节点有 `layerType` / `layerName` / `layerDescription` 字段。

---

## Step 3 — 完整流程（补全 + 生成 Hex）

> **执行者：脚本**  
> 以 Step 2 生成的 `schema-<filename>.json` 为输入，调用 Unified DSL Pipeline API 的 `/pipeline` 接口（端口 3204），**一次性完成**补全节点信息（iconSvg + component）+ 转 design-dsl + 导出 hex，仅需一次 HTTP 请求。

**服务信息：**

| 服务 | 端口 | 接口 | 输入 | 输出 |
|---|---|---|---|---|
| Unified DSL Pipeline | 3204 | `POST /pipeline` | node-dsl JSON 文件 | zip（补全 + 转 DSL + 导出一次性完成，hex 在 zip 内） |

**创建产物目录：**
```bash
mkdir -p "<PROJECT_DIR>-output/step3"
```

**对每个页面依次执行：**

**① 调用 `/pipeline` 接口（完整流程）**

```bash
# 调用 Unified DSL Pipeline 的 pipeline 接口
# 上传 node-dsl JSON，一次性完成：补全 + 转 design-dsl + 导出 hex
curl -s -X POST http://localhost:3204/pipeline \
  -F "file=@<PROJECT_DIR>-output/step2/schema-<filename>.json" \
  -F "page_name=<filename>" \
  -F "skip_enrich=false" \
  -o "<PROJECT_DIR>-output/step3/pipeline-result-<filename>.json"

# 解析响应，提取 zip（hex 在 zip 内的 output.hex）
node -e "
const r = JSON.parse(require('fs').readFileSync('<PROJECT_DIR>-output/step3/pipeline-result-<filename>.json'));
if (r.success) {
  const zipBuffer = Buffer.from(r.zip, 'base64');
  require('fs').writeFileSync('<PROJECT_DIR>-output/step3/output-<filename>.zip', zipBuffer);
  console.log('artifact_id:', r.artifact_id);
  console.log('补全图标:', r.stats.enrich.icons);
  console.log('补全组件:', r.stats.enrich.components);
  console.log('总图层数:', r.stats.layers.total);
  if (r.missing_keys && r.missing_keys.length > 0) {
    console.error('缺失组件:', r.missing_keys.join(', '));
  }
} else {
  console.error('pipeline 失败:', r.error);
  process.exit(1);
}
"

# 解压 zip
unzip -o "<PROJECT_DIR>-output/step3/output-<filename>.zip" -d "<PROJECT_DIR>-output/step3/"
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `success` | boolean | 是否成功 |
| `artifact_id` | string | 本次产物唯一标识，产物同时存储于服务端 `artifacts/` 目录 |
| `stats.enrich.icons` | number | 补全的图标数 |
| `stats.enrich.components` | number | 补全的组件数 |
| `stats.layers.total` | number | 总图层数 |
| `stats.layers.frames/texts/instances/placeholders` | number | 各类型图层统计 |
| `stats.missing_keys` | number | 缺失的组件数量 |
| `zip` | string | zip 包（base64 编码） |
| `missing_keys` | array | 缺失组件的 key 列表 |

> **调试说明：** `pipeline-result-<filename>.json` 保存完整响应，包含所有统计信息和产物数据。

**降级规则：**

- 接口请求失败 → 报错提示，不生成产物
- `missing_keys` 非空 → 记录警告，hex/zip 仍有效，对应 instance 节点在 Pixso 中缺失但不影响导入
- 补全失败（icons/components = 0）但接口返回成功 → hex/zip 仍生成，无补全数据

**Step 3 验收：** 每个页面的 zip 文件已解压。