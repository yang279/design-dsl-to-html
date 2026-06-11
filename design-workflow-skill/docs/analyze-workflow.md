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
├── step1/  nodes-*.json + styles-*.json + manifest.json + run.json
├── step2/  nodes-*.json + styles-*.json + schema-*.json + wireframe-*.html + manifest.json + run.json
└── step3/  pipeline-result-*.json + output-*.zip + output.hex + {guid}.svg/png（解压产物）
```

---

## Step 1 — 渲染基准 + 全节点提取

> **执行者：Chrome DevTools MCP 工具 + 纯脚本（page-utils.js、extractNodes），无 LLM**  
> 通过浏览器真实渲染页面，执行 JS 脚本提取完整 DOM 树和 computedStyle。所有操作都是确定性的工具调用，不涉及语义理解。

**创建产物目录：**
```bash
mkdir -p "<PROJECT_DIR>-output/step1"
```

**对每个 HTML 文件依次执行：**

1. **[Chrome DevTools MCP]** `resize_page` → 1440×900
2. **[Chrome DevTools MCP]** `navigate_page` → `file://<PROJECT_DIR>/<filename>.html`
3. **[Chrome DevTools MCP]** `wait_for` → 等待主体元素可见
4. **[Chrome DevTools MCP + 纯脚本]** `evaluate_script` → 调用 `checkImagesLoaded()`  
   *(页面内执行的纯脚本：检查所有 img 是否加载完成，确保坐标稳定，无 LLM 参与)*  
   若 `allLoaded` 为 `false`，等待 500ms 后最多重试 10 次；超时则继续，不中断流程
5. **[Chrome DevTools MCP + 纯脚本]** `evaluate_script` → 读取 `SCRIPTS/page-utils.js`，调用 `extractNodes()`  
   *(页面内执行的纯脚本：DOM 未经任何修改，直接遍历采集节点树 + computedStyle，坐标与页面真实渲染一致，无 LLM 参与)*  
    
   结果**以任意方式**写入以下两个产物文件（临时文件中转或直接写出均可），**格式要求不得违反**：
   - `step1/nodes-<filename>.json`：写 `extractNodes()` 返回值的 `tree` 字段，直接存储
   - `step1/styles-<filename>.json`：**必须包含 `styles` 包装层**，格式为 `{ "styles": { nid: computedStyle } }`  
     ⚠️ `extractNodes()` 返回的 `styles` 是平铺对象 `{ nid: ... }`，保存时必须手动添加包装：  
     ```js
     { styles: result.styles }   // ✅ 正确
     result.styles               // ❌ 错误，prune-nodes.js 会报 Cannot read properties of undefined
     ```
6. **[Chrome DevTools MCP + 纯脚本]** `evaluate_script` → 调用 `expandForExtract()`  
   *(页面内执行的纯脚本：解除所有 overflow 约束并将容器高度撑开，使 extractNodes 能采集到 overflow:hidden/auto/scroll 内被裁剪的子节点坐标，无 LLM 参与)*
7. **[Chrome DevTools MCP]** `resize_page` → 恢复 1440×900
8. **[Chrome DevTools MCP]** `list_network_requests` → 收集本地资源（scripts / styles / images / fonts）
9. **[Chrome DevTools MCP]** `close_page` → 关闭当前页面，释放浏览器资源
10. **[纯脚本]** 写入 `step1/manifest.json`（页面元数据 + 资源引用）和 `step1/run.json`（执行日志）
11. **[纯脚本]** 清理执行过程中产生的所有临时文件（`/tmp/raw-*.json` 等），不得残留在项目根目录或其他位置

**Step 1 验收：** manifest 存在 + pages[] 长度等于 HTML 文件数 + 每页均有 nodes/styles → 才可进入 Step 2。

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

1. 读取 `step1/nodes-<filename>.json` + `step1/styles-<filename>.json`
2. **[纯脚本]** Bash 调用 `prune-nodes.js`（Node.js 进程脚本，不能用 evaluate_script）：
   ```bash
   node SCRIPTS/prune-nodes.js \
     "<PROJECT_DIR>-output/step1/nodes-<filename>.json" \
     "<PROJECT_DIR>-output/step1/styles-<filename>.json" \
     > /tmp/pruned-<filename>.json
   ```
   基于 CSS `display:none` / `visibility:hidden` / `opacity:0` 等规则剪枝，输出 `{ tree, styles }` 到 stdout
3. **[纯脚本]** 统计剪枝后节点总数：
   - **≤ 150 节点**：整棵树作为一个块，直接进行第 4 步
   - **> 150 节点**：⛔ **必须分块，不得跳过此步骤**  
     按顶层子节点拆分为多个块，每块 ≤ 150 节点；对每个块**分别**执行第 4 步语义标注；  
     所有块标注完成后合并回完整树，再执行第 5 步写文件

4. **[LLM]** 语义标注：为精简树（或当前块）中每个节点追加以下字段，字段含义见 [node-dsl.md](node-dsl.md)  
   - `layerType`（必填）：图层类型，从 `frame` / `text` / `image` / `icon` / `component` 中选一  
   - `layerName`（必填）：节点语义的简短名称，如 `"登录按钮"` / `"用户头像"`；同页面同类节点必须可区分  
   - `layerDescription`（必填）：节点的详细业务描述，说明该节点具体做了什么事情；**`layerType` 为 `icon` 时还须注明尺寸和线条粗细，如 `"返回图标 24×24 细线"`**  
   - `layerConfidence`（可选）：仅标注把握不足时添加，值固定为 `"low"`；省略即表示 high  
   ⛔ 前三个字段缺一不可；分块时每块单独标注，全部完成后才能合并写文件
5. 写入 `step2/nodes-<filename>.json`
6. **[纯脚本]** 调用 `simplifyStyles(prunedTree, styles)` → 写入 `step2/styles-<filename>.json`  
   按固定规则去掉浏览器默认值，只保留对设计有意义的字段
7. **[纯脚本]** Bash 调用 `gen-wireframe.js`（Node.js CLI 脚本，不能用 evaluate_script）：
   ```bash
   node SCRIPTS/gen-wireframe.js \
     "<PROJECT_DIR>-output/step2/nodes-<filename>.json" \
     "<PROJECT_DIR>-output/step2/wireframe-<filename>.html"
   ```
   按 semantic 类型生成色块线框 HTML

8. **[LLM]** 生成 `step2/schema-<filename>.json`：将 nodes 树与 styles 映射合并为统一 schema 格式，结构定义见 [node-dsl.md](node-dsl.md)  
   合并规则：遍历 nodes 树中每个节点，将 `styles-<filename>.json` 中对应 nid 的样式对象以 `style` 字段内联进节点，递归处理 `children`，保留 nodes 文件中所有原有字段（`layerType`、`layerName`、`layerDescription`、`layerConfidence`、`passthrough` 等）  
   若某节点在 styles 中无对应条目（样式全为默认值），则 `style` 字段设为 `{}`

**所有页面完成后：**

9. 写入 `step2/manifest.json`（`step: 2`，每页加 `wireframe` 和 `schema` 字段）
10. 写入 `step2/run.json`

**Step 2 验收：** 每个页面的 nodes/styles/wireframe/schema 均存在 + 所有节点有 `layerType` / `layerName` / `layerDescription` 字段 + run.json 存在。

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

# 解压 zip，解压出什么就是什么
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
| `zip` | string | zip 包（base64 编码），解压后含 `output.hex` 及 svg/png 资源 |
| `missing_keys` | array | 缺失组件的 key 列表 |

**产物说明：**

| 文件 | 说明 |
|---|---|
| `output-<filename>.zip` | zip 包（含 output.hex + placeholder 资源） |
| `output.hex` | 解压产物，可直接导入 Pixso |
| `{guid}.svg` | icon placeholder 的 SVG 内容（解压产物） |
| `{guid}.png` | image placeholder 的图片内容（解压产物） |

> **调试说明：** `pipeline-result-<filename>.json` 保存完整响应，包含所有统计信息和产物数据。

**降级规则：**

- 接口请求失败 → 报错提示，不生成产物
- `missing_keys` 非空 → 记录警告，hex/zip 仍有效，对应 instance 节点在 Pixso 中缺失但不影响导入
- 补全失败（icons/components = 0）但接口返回成功 → hex/zip 仍生成，无补全数据

**Step 3 验收：** 每个页面均有 `output.hex`（解压产物，可直接导入 Pixso）。