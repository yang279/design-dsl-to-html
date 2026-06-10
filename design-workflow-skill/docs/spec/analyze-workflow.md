# 分析流程（Step 1–4）

> 适用：用户提供一个 HTML 项目目录路径，需要提取语义结构并输出设计 DSL。  
> **需要 Chrome DevTools MCP**（Step 1）。

## 执行模式总览

| 步骤 | 执行者 | 核心工作 |
|------|--------|----------|
| Step 1 — 渲染 + 节点提取 | **Chrome DevTools MCP + 纯脚本** | 浏览器渲染、截图、DOM 遍历提取节点树，全程无 LLM |
| Step 2 — 语义标注 | **纯脚本**（剪枝/精简/线框）<br>**LLM**（语义标注） | 脚本做预处理和后处理；LLM 只负责给每个节点打 semantic/label/confidence |
| Step 3 — 补全节点信息 | **脚本** | 并行调用 iconAgent `/resolve` 和 Component Match `/match-dsl`，合并为最终 schema |
| Step 4 — 生成 Hex 文件 | **纯脚本** | `schema-to-design-dsl.js` 转格式，调用 dsl2hex `/convert`，产出 hex + 资源 zip |

## 产物目录结构

```
<PROJECT_DIR>-output/
├── step1/  screenshots/ + nodes-*.json + styles-*.json + manifest.json + run.json
├── step2/  nodes-*.json + styles-*.json + schema-*.json + wireframe-*.html + manifest.json + run.json
├── step3/  schema-final-*.json
└── step4/  design-dsl-*.json（保留）+ output-*.zip（含 output.hex 及 svg/png 资源）
```

---

## Step 1 — 渲染基准 + 全节点提取

> **执行者：Chrome DevTools MCP 工具 + 纯脚本（page-utils.js、extractNodes），无 LLM**  
> 通过浏览器真实渲染页面，执行 JS 脚本提取完整 DOM 树和 computedStyle。所有操作都是确定性的工具调用，不涉及语义理解。

**创建产物目录：**
```bash
mkdir -p "<PROJECT_DIR>-output/step1/screenshots"
```

**对每个 HTML 文件依次执行：**

> **顺序说明：先提取节点，再展开截图。**  
> 节点提取必须在任何 DOM 修改之前完成，以确保坐标反映页面真实渲染状态。截图在展开之后拍摄，仅作为视觉参考，不影响节点坐标。

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
6. **[Chrome DevTools MCP + 纯脚本]** `evaluate_script` → 调用 `expandForScreenshot()`  
   *(页面内执行的纯脚本：将 overflow:auto/scroll 容器改为 visible，使滚动内容撑开，仅用于截图，无 LLM 参与)*
7. **[Chrome DevTools MCP]** `take_screenshot` → `fullPage: true`，保存至 `step1/screenshots/<filename>.png`
8. **[Chrome DevTools MCP + 纯脚本]** `evaluate_script` → 调用 `expandForExtract()`  
   *(页面内执行的纯脚本：截图完成后，解除所有 overflow 约束并将容器高度撑开，使 extractNodes 能采集到 overflow:hidden/auto/scroll 内被裁剪的子节点坐标，无 LLM 参与)*  
   > **此步骤在截图之后**，不影响截图坐标；其目的是让后续步骤的节点坐标覆盖全部内容（包括折叠/滚动区域）
9. **[Chrome DevTools MCP]** `resize_page` → 恢复 1440×900
10. **[Chrome DevTools MCP]** `list_network_requests` → 收集本地资源（scripts / styles / images / fonts）
11. **[Chrome DevTools MCP]** `close_page` → 关闭当前页面，释放浏览器资源
12. **[纯脚本]** 写入 `step1/manifest.json`（页面元数据 + 资源引用）和 `step1/run.json`（执行日志）
13. **[纯脚本]** 清理执行过程中产生的所有临时文件（`/tmp/raw-*.json` 等），不得残留在项目根目录或其他位置

**Step 1 验收：** manifest 存在 + pages[] 长度等于 HTML 文件数 + 每页均有 nodes/styles/截图 → 才可进入 Step 2。

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

4. **[LLM]** 语义标注：为精简树（或当前块）中每个节点追加三个字段  
   - `semantic`（必填）：节点的语义类型，如 `button` / `input` / `navbar` / `text` / `container` 等  
   - `label`（必填）：结合节点的 `text`、`class`、`attrs`、父节点语义、页面上下文综合判断后的可读描述，要具体到业务含义，不能只写类型名。如同一页面有多个按钮应分别描述为 "登录按钮" / "注册按钮" / "忘记密码链接"，而非统一写 "按钮"。**当 `semantic` 为 `icon` 时，还须在描述中注明图标的尺寸（宽×高，单位 px）和线条粗细（细线/中等/粗），如 "返回图标 24×24 细线" / "搜索图标 20×20 中等"**  
   - `confidence`（必填）：`"high"` 或 `"low"`  
   ⛔ 三个字段均缺一不可；分块时每块单独标注，全部完成后才能合并写文件
5. 写入 `step2/nodes-<filename>.json`
6. **[纯脚本]** 调用 `simplifyStyles(prunedTree, styles)` → 写入 `step2/styles-<filename>.json`  
   按固定规则去掉浏览器默认值，只保留对设计有意义的字段
7. **[纯脚本]** Bash 调用 `gen-wireframe.js`（Node.js CLI 脚本，不能用 evaluate_script）：
   ```bash
   node SCRIPTS/gen-wireframe.js \
     "<PROJECT_DIR>-output/step2/nodes-<filename>.json" \
     "<PROJECT_DIR>-output/step1/screenshots/<filename>.png" \
     "<PROJECT_DIR>-output/step2/wireframe-<filename>.html" \
     --dpr 2
   ```
   按 semantic 类型生成色块线框 HTML

8. **[LLM]** 生成 `step2/schema-<filename>.json`：将 nodes 树与 styles 映射合并为统一 schema 格式，结构定义见 [node-dsl.md](node-dsl.md)  
   合并规则：遍历 nodes 树中每个节点，将 `styles-<filename>.json` 中对应 nid 的样式对象以 `style` 字段内联进节点，递归处理 `children`，保留 nodes 文件中所有原有字段（`semantic`、`label`、`confidence`、`passthrough` 等）  
   若某节点在 styles 中无对应条目（样式全为默认值），则 `style` 字段设为 `{}`

**所有页面完成后：**

9. 写入 `step2/manifest.json`（`step: 2`，每页加 `wireframe` 和 `schema` 字段）
10. 写入 `step2/run.json`

**Step 2 验收：** 每个页面的 nodes/styles/wireframe/schema 均存在 + 所有节点有 `semantic` 字段 + run.json 存在。

---

## Step 3 — 补全节点信息

> **执行者：脚本**  
> 以 Step 2 生成的 `schema-<filename>.json` 为输入，**并行**调用 [iconAgent](../api/icon-api.md) 和 [Component Match API](../api/component-api.md) 两个服务，分别注入 `iconSvg` 和 `component` 字段，合并为最终 schema，写入 `step3/schema-final-<filename>.json`。

**两个服务的职责：**

| 服务 | 端口 | 接口 | 输入 | 处理节点 | 注入字段 |
|---|---|---|---|---|---|
| iconAgent | 3103 | `POST /resolve` | 文件上传（整棵树） | `semantic=icon` | `iconSvg` |
| Component Match | 3102 | `POST /match-dsl` | 文件上传（整棵树） | `button/input/navbar/tabbar/switch/badge/avatar` | `component` |

**创建产物目录：**
```bash
mkdir -p "<PROJECT_DIR>-output/step3"
```

**对每个页面依次执行：**

**① 并行上传同一份文件到两个服务**

```bash
# iconAgent：递归找所有 icon 节点，返回注入 iconSvg 后的完整树
# 原始响应存入 step3/raw-icons-<filename>.json 供调试；提取 .content 存入临时文件
curl -s -X POST http://localhost:3103/resolve \
  -F "file=@<PROJECT_DIR>-output/step2/schema-<filename>.json" \
  -o "<PROJECT_DIR>-output/step3/raw-icons-<filename>.json" && \
  node -e "const r=JSON.parse(require('fs').readFileSync('<PROJECT_DIR>-output/step3/raw-icons-<filename>.json')); process.stdout.write(JSON.stringify(r.content,null,2))" \
  > /tmp/icons-<filename>.json &

# Component Match：递归找所有可匹配节点，返回 [{nid, semantic, label, match}] 数组
# 原始响应同时存入 step3/raw-components-<filename>.json 供调试
curl -s -X POST http://localhost:3102/match-dsl \
  -F "file=@<PROJECT_DIR>-output/step2/schema-<filename>.json" \
  -o "<PROJECT_DIR>-output/step3/raw-components-<filename>.json" && \
  cp "<PROJECT_DIR>-output/step3/raw-components-<filename>.json" /tmp/components-<filename>.json &

wait
```

> **调试说明：** `step3/raw-icons-<filename>.json` 保存 iconAgent 的完整原始响应（含 `errorCode`/`success` 字段），`step3/raw-components-<filename>.json` 保存 Component Match 的完整原始响应。两个文件在流程失败时可直接检查以定位问题。

**② 合并为最终 JSON**

- 以 iconAgent 响应（`/tmp/icons-<filename>.json`，即 `raw-icons` 中的 `content` 字段）为基础树（已含 `iconSvg`）
- 遍历 Component Match 响应数组，对每个 `{ nid, match }` 项：按 nid 找到基础树中对应节点，若 `match` 非 `null` 则注入 `component: match`
- 递归处理所有 `children`，写出 `<PROJECT_DIR>-output/step3/schema-final-<filename>.json`

**最终节点示例：**

```json
{ "nid": 3, "semantic": "icon", "label": "返回图标 24×24 细线",
  "iconSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" ...>...</svg>", "...": "..." }

{ "nid": 17, "semantic": "button", "label": "登录按钮（主操作，蓝色）",
  "component": {
    "sourceLabel": "ICT UI 组件库", "componentSetName": "1.按钮",
    "componentKey": "4280:103404", "hexFile": "component/4280_103404.txt",
    "variant": { "variantKey": "4280:102987", "name": "status=primary, size=large, disabled=false" },
    "reason": "status=primary 对应主按钮，size=large 对应大号"
  }, "...": "..." }
```

**处理规则：**

- 两个服务均接收同一份原始 `step2/schema-<filename>.json`，无需预处理
- Component Match 响应中 `match=null` 的节点不注入 `component` 字段
- 未被任一服务处理的节点内容与 Step 2 原文件一致

**降级规则：**

- iconAgent 请求失败 → 跳过 `iconSvg` 注入，以 Step 2 原始 schema 继续执行 Component Match 合并
- Component Match 请求失败 → 跳过 `component` 注入，以 iconAgent 响应（或原始 schema）作为最终产物
- 两个服务均失败 → 直接将 `step2/schema-<filename>.json` 复制为 `step3/schema-final-<filename>.json`，不报错退出
- 无论成功与否，`raw-icons-<filename>.json` 和 `raw-components-<filename>.json` 均应写出（即便为空或错误响应），以便调试

**Step 3 验收：** 每个页面均有 `step3/schema-final-*.json`（至少为 Step 2 原始结构）。

---

## Step 4 — 生成 Hex 文件

> **执行者：纯脚本**  
> [dsl2hex 服务](../api/dsl2hex-api.md)（端口 3101）接收 design-dsl 格式，而 Step 3 产出的是 node-dsl 格式。Step 4 分两阶段：先由脚本将 `schema-final-<filename>.json` 转换为 design-dsl（保留），再调用 `POST /convert` 获得 hex zip 包。

**创建产物目录：**
```bash
mkdir -p "<PROJECT_DIR>-output/step4"
```

**对每个页面依次执行：**

**① 脚本将 node-dsl 转换为 design-dsl（保留产物）**

```bash
node SCRIPTS/schema-to-design-dsl.js \
  "<PROJECT_DIR>-output/step3/schema-final-<filename>.json" \
  --page-name "<filename>" \
  --out "<PROJECT_DIR>-output/step4/design-dsl-<filename>.json"
```

脚本转换规则（见 [design-dsl.md](design-dsl.md)）：

| node-dsl 字段 | design-dsl 对应 |
|---|---|
| `nid` / `rect` | `id: "1:{nid}"` / `box`（相对父节点坐标） |
| `style` | 拆解为 `fills` / `strokes` / `effects` / `corner_radius` / `auto_layout` |
| `semantic ∈ {button,input,navbar,tabbar,switch,badge,avatar}` + `component` | `type: "instance"`，写入 `symbol_id`（取 `variant.guid`）/ `variant_key`（取 `variant.variantKey`）/ `component_set_key`（取 `componentKey`）/ `path`（取 `component.path`，由 component-service 拼好返回，原样写入） |
| `semantic=icon` + `iconSvg` | `type: "frame"` + `placeholder`（将 `iconSvg` 原样写入 `note` 字段） |
| `semantic ∈ {text,heading}` + `text`（无子节点） | `type: "text"` + `text_style` |
| 其余节点 | `type: "frame"`，递归处理 `children` |

**② 调用 dsl2hex 生成 zip**

```bash
curl -s -X POST http://localhost:3101/convert \
  -H "Content-Type: application/json" \
  -d "{\"dsl\": $(cat <PROJECT_DIR>-output/step4/design-dsl-<filename>.json)}" \
  | node -e "const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{ const r=JSON.parse(Buffer.concat(c)); if(r.zip){ require('fs').writeFileSync('out.b64', r.zip); if(r.missing_keys) console.error('missing_keys:', r.missing_keys); } else { console.error(r.error); process.exit(1); } })"

# base64 解码为 zip
base64 -d out.b64 > "<PROJECT_DIR>-output/step4/output-<filename>.zip"
rm out.b64

# 解压（含 output.hex 及 svg/png 资源）
unzip -o "<PROJECT_DIR>-output/step4/output-<filename>.zip" \
  -d "<PROJECT_DIR>-output/step4/"
```

**zip 解压后的产物：**

| 文件 | 说明 |
|---|---|
| `output.hex` | 解压出来即为最终产物，原样保留，不做改名/复制等额外处理 |
| `{guid}.svg` | icon placeholder 的 SVG 内容 |
| `{guid}.png` | image placeholder 的图片内容 |

**降级规则：**
- `missing_keys` 非空 → 记录警告，zip 仍有效，对应 instance 节点在 Pixso 中缺失但不影响导入
- 服务返回 500 → 保留 `step4/design-dsl-<filename>.json`，报错提示，不继续解压

**Step 4 验收：** 每个页面均有 `output-<filename>.zip` + 解压后含 `output.hex`。
