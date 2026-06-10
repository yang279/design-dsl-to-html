# 生成流程（Step A–D）

> 适用：用户提供一句话设计描述，需要生成节点语义 JSON 文件。

## 执行模式总览

| 步骤 | 执行者 | 核心工作 |
|------|--------|----------|
| Step A — 规划图层树 | **LLM** | 理解设计意图，决定页面结构与组件选型，补全缺失信息 |
| Step B — 生成 Node DSL JSON | **LLM** | 按 node-dsl.md 规范直接生成节点语义 JSON，写出文件 |
| Step C — 补全节点信息 | **脚本** | 并行调用 iconAgent 和 Component Match，合并两个响应为最终 JSON |
| Step D — 生成 Hex 文件 | **纯脚本** | `schema-to-design-dsl.js` 转格式，调用 dsl2hex `/convert`，产出 hex + 资源 zip |

## 产物目录结构

```
<slug>-output/
├── <slug>-node.json        ← Node DSL JSON（Step B）
├── <slug>-final.json       ← 补全 iconSvg + component 后的 JSON（Step C）
├── <slug>-design-dsl.json  ← design-dsl 格式（Step D，保留）
└── <slug>-output.zip       ← hex + 资源 zip（Step D 最终产物）
```

`<slug>` 取自页面名称的短 slug（如 `login`、`settings`）。

---

## Step A — 解析描述，规划图层树

> **执行者：LLM**  
> LLM 理解用户描述，识别页面类型、功能区划分、各元素的语义类型。缺失信息按移动端设计规范自行补全，不反问用户。此步骤在心里完成，不输出。

**画布默认尺寸：**
- 移动端：375 × 812
- 桌面端：1440 × 900

**层次结构规则：**
- 顶层：一个根容器节点（语义 `container`，覆盖整个画布）
- 区块：每个功能区（导航栏、Hero 区、表单区、列表区等）是独立子节点
- 内容元素：文字节点用 `text` / `heading`，形状装饰用 `container`，组件库元素用对应语义类型

**以下元素须使用对应组件语义类型：**

| 元素 | semantic |
|---|---|
| 按钮 | `button` |
| 输入框 / 文本域 | `input` |
| 图标 | `icon` |
| 顶部导航栏 | `navbar` |
| 底部标签栏 | `tabbar` |
| 开关 | `switch` |
| 复选框 / 单选框 | `container` |
| 徽标 / 标签 | `badge` |
| 头像 | `avatar` |
| 卡片 | `card` |

---

## Step B — 生成 Node DSL JSON

> **执行者：LLM**  
> 按 [node-dsl.md](node-dsl.md) 规范构建完整节点树，直接写入 `<slug>-output/<slug>-node.json`。

**nid 规则（固定规则）：** 全树自增整数，从 `1` 开始，按深度优先顺序递增，每个节点唯一。

**depth 规则（固定规则）：** 根节点 `depth` 为 `2`，每嵌套一层 +1。

**rect 规则（固定规则）：** 所有节点使用页面绝对坐标（累加所有祖先偏移），单位 px，字段为 `x`/`y`/`w`/`h`。

**label 规则：** 结合页面上下文描述具体业务含义，同类节点须可区分（如"登录按钮"/"注册按钮"）。`semantic` 为 `icon` 时须注明尺寸和线条粗细（如 `"返回图标 24×24 细线"`）。

**style 规则：** 只写非默认值字段，值为 CSS 字符串格式。常用字段：

| 字段 | 格式示例 |
|---|---|
| `backgroundColor` | `"#FFFFFFFF"` |
| `backgroundImage` | `"linear-gradient(180deg, #3478F6FF 0%, #0A2E8AFF 100%)"` |
| `borderRadius` | `"16px"` / `"8px 8px 0px 0px"` |
| `border` | `"1px solid #E5E5E5FF"` |
| `boxShadow` | `"0px 8px 24px rgba(0,0,0,0.1)"` |
| `display` | `"flex"` |
| `flexDirection` | `"column"` / `"row"` |
| `gap` | `"16px"` |
| `alignItems` | `"center"` / `"flex-start"` / `"stretch"` |
| `justifyContent` | `"center"` / `"space-between"` / `"space-evenly"` |
| `fontSize` | `"16px"` |
| `fontWeight` | `"700"` / `"500"` / `"400"` |
| `color` | `"#1A1A1AFF"` |
| `lineHeight` | `"24px"` |
| `textAlign` | `"center"` / `"right"` |
| `opacity` | `"0.5"` |
| `position` | `"fixed"` |
| `bottom` / `top` | `"0px"` |
| `zIndex` | `"100"` |

**常用尺寸参考：**

| 元素 | 尺寸 |
|---|---|
| 页面根容器（移动） | 375 × 812 |
| NavBar | w=375, h=56 |
| TabBar | w=375, h=64 |
| 表单卡片 | w=335, h 自适应 |
| 大按钮 / 大输入框 | w=295, h=48 |
| 小按钮 | w=160, h=36 |

**常用颜色参考：**

| 用途 | 颜色 |
|---|---|
| 页面背景 | `#F5F5F5FF` |
| 卡片背景 | `#FFFFFFFF` |
| 主文字 | `#1A1A1AFF` |
| 次文字 | `#666666FF` |
| 提示文字 | `#999999FF` |
| 主色蓝 | `#3478F6FF` |
| 分割线 | `#E5E5E5FF` |

---

## Step C — 补全节点信息

> **执行者：脚本**  
> 以 Step B 生成的 `<slug>-node.json` 为基础，**并行**调用 [iconAgent](../api/icon-api.md) 和 [Component Match API](../api/component-api.md)，分别获得注入 `iconSvg` 和注入 `component` 的两份完整 JSON；两份 JSON 结构相同、节点 nid 一致，按 nid 深度优先合并为一份最终 JSON，写入 `<slug>-final.json`。

**两个服务的职责：**

| 服务 | 端口 | 接口 | 输入 | 处理节点 | 注入字段 |
|---|---|---|---|---|---|
| iconAgent | 3103 | `POST /resolve` | 文件上传（整棵树） | `semantic=icon` | `iconSvg` |
| Component Match | 3102 | `POST /match-dsl` | 文件上传（整棵树） | `button/input/navbar/tabbar/switch/badge/avatar` | `component` |

**调用步骤：**

**① 并行上传同一份文件到两个服务**

```bash
# iconAgent：递归找所有 icon 节点，返回注入 iconSvg 后的完整树
# 原始响应存入 <slug>-output/raw-icons.json 供调试；提取 .content 存入临时文件
curl -s -X POST http://localhost:3103/resolve \
  -F "file=@<slug>-output/<slug>-node.json" \
  -o "<slug>-output/raw-icons.json" && \
  node -e "const r=JSON.parse(require('fs').readFileSync('<slug>-output/raw-icons.json')); process.stdout.write(JSON.stringify(r.content,null,2))" \
  > /tmp/<slug>-icons.json &

# Component Match：递归找所有可匹配节点，返回 [{nid, semantic, label, match}] 数组
# 原始响应同时存入 <slug>-output/raw-components.json 供调试
curl -s -X POST http://localhost:3102/match-dsl \
  -F "file=@<slug>-output/<slug>-node.json" \
  -o "<slug>-output/raw-components.json" && \
  cp "<slug>-output/raw-components.json" /tmp/<slug>-components.json &

wait
```

> **调试说明：** `raw-icons.json` 保存 iconAgent 的完整原始响应（含 `errorCode`/`success` 字段），`raw-components.json` 保存 Component Match 的完整原始响应。流程失败时可直接检查这两个文件定位问题。

**② 合并为最终 JSON**

- 以 iconAgent 响应（`/tmp/<slug>-icons.json`，即 `raw-icons.json` 中的 `content` 字段）为基础树（已含 `iconSvg`）
- 遍历 Component Match 响应数组，对每个 `{ nid, match }` 项：按 nid 找到基础树中对应节点，若 `match` 非 `null` 则注入 `component: match`
- 递归处理所有 `children`，写出 `<slug>-output/<slug>-final.json`

**最终节点示例：**

```json
{ "nid": 3, "semantic": "icon", "label": "返回上一页图标 24×24 细线",
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

- 两个服务均接收同一份原始 `<slug>-node.json`，无需预处理
- Component Match 响应中 `match=null` 的节点不注入 `component` 字段
- 未被任一服务处理的节点内容与 Step B 原文件一致

**降级规则：**

- iconAgent 请求失败 → 跳过 `iconSvg` 注入，继续执行 Component Match 合并
- Component Match 请求失败 → 跳过 `component` 注入，以 iconAgent 响应（或原始 JSON）作为最终产物
- 两个服务均失败 → 直接将 `<slug>-node.json` 复制为 `<slug>-final.json`，不报错退出
- 无论成功与否，`raw-icons.json` 和 `raw-components.json` 均应写出（即便为空或错误响应），以便调试

---

## Step D — 生成 Hex 文件

> **执行者：纯脚本**  
> [dsl2hex 服务](../api/dsl2hex-api.md)（端口 3101）接收 design-dsl 格式，而 Step C 产出的是 node-dsl 格式。Step D 分两阶段：先由脚本将 `<slug>-final.json` 转换为 design-dsl（保留），再调用 `POST /convert` 获得 hex zip 包。

**① 脚本将 node-dsl 转换为 design-dsl（保留产物）**

```bash
node SCRIPTS/schema-to-design-dsl.js \
  "<slug>-output/<slug>-final.json" \
  --page-name "<slug>" \
  --out "<slug>-output/<slug>-design-dsl.json"
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
  -d "{\"dsl\": $(cat <slug>-output/<slug>-design-dsl.json)}" \
  | node -e "const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{ const r=JSON.parse(Buffer.concat(c)); if(r.zip){ require('fs').writeFileSync('out.b64', r.zip); if(r.missing_keys) console.error('missing_keys:', r.missing_keys); } else { console.error(r.error); process.exit(1); } })"

base64 -d out.b64 > "<slug>-output/<slug>-output.zip"
rm out.b64

unzip -o "<slug>-output/<slug>-output.zip" -d "<slug>-output/"
```

**zip 解压后的产物：**

| 文件 | 说明 |
|---|---|
| `output.hex` | 解压出来即为最终产物，原样保留，不做改名/复制等额外处理 |
| `{guid}.svg` | icon placeholder 的 SVG 内容 |
| `{guid}.png` | image placeholder 的图片内容 |

**降级规则：**
- `missing_keys` 非空 → 记录警告，zip 仍有效，对应 instance 节点在 Pixso 中缺失但不影响导入
- 服务返回 500 → 保留 `<slug>-design-dsl.json`，报错提示，不继续解压

**Step D 验收：** `<slug>-output.zip` 存在 + 解压后含 `output.hex`。
