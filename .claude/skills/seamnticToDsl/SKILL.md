---
name: semantic-to-dsl
description: >
  Converts a semantic node tree (output of html-analysis Step 2 or Step 3) into a
  Pixso-compatible design DSL JSON (per 设计dsl.md), resolves component instances
  by querying the component-query API, then exports a Pixso-importable hex file
  via the dsl-to-hex API. Use when given a nodes JSON + styles JSON and asked to
  produce a design DSL or Pixso hex.
---

# Semantic → DSL Skill

## 概述

**输入**：语义节点树（`nodes-<filename>.json`）+ 精简样式（`styles-<filename>.json`）  
**输出**：符合 `设计dsl.md` 规范的 `dsl-<filename>.json` + Pixso 可导入的 `<filename>.hex`

## 定位 SKILL_DIR

本 SKILL.md 所在目录即为 SKILL_DIR（包含 `scripts/build-dsl.js`、`scripts/export-hex.js`）。

---

## 流程

```
Step A  [LLM]     组件识别 + API 查询
        → component-map-<filename>.json   ← nid → instance 引用

Step B  [Script]  节点树 → 设计 DSL
        → dsl-<filename>.json             ← 符合 设计dsl.md 规范

Step C  [Script]  DSL → Pixso hex
        → <filename>.hex                  ← Pixso 可导入文件
```

---

## Step A — 组件识别 + API 查询（LLM）

### 1. 读取输入文件

```
Read → nodes-<filename>.json    （语义节点树，含 semantic / label / rect / layout 字段）
Read → styles-<filename>.json   （精简样式映射 { nid: styleObj }）
```

### 2. 扫描组件候选节点

遍历节点树，以下节点视为设计库组件候选：

| 信号 | 判断依据 |
|------|---------|
| `semantic` 命中候选集 | `button` `icon` `avatar` `logo` `checkbox` `input` `select` `search` `pagination` `tab-item` `nav-item` `badge` `status` |
| `class` 含组件关键词 | `.btn` `.icon` `.avatar` `.checkbox` 等 |
| `label` 描述可复用组件 | "主按钮" "搜索框" "分页器" 等 |
| 尺寸特征 | icon 常为等宽高小正方形（`rect.w === rect.h && rect.w ≤ 48`） |

> ⚠️ **只映射容器节点**（有 `children` 或有明确边界的 frame），文本叶节点（`tag: p/span`）即使 semantic 是 button 也不映射为 instance。

### 3. 对每个候选调用组件查询 API

```
POST http://localhost:3100/query
Content-Type: application/json

{
  "name": "<根据 label / class / semantic 推断的组件名>",
  "props": { "<变体属性>": "<值>" }    ← 可选，根据上下文推断
}
```

- `found: true` → 记录到 component-map
- `found: false` → 该节点保持为普通图层，不进 map

### 4. 写入 component-map（中间产物）

```
Write → component-map-<filename>.json
```

格式：

```json
{
  "<nid>": {
    "name": "Button",
    "symbol_id":              "58:36403",
    "variant_key":            "58dacea4d97a7092ffc7ccbac4c62e7e619e2727",
    "component_set_key":      "7c366910bf8bc5d84d5ca1a3425f2a2e00ccc3af",
    "component_set_resolved": false,
    "variant_props": { "类型": "emphasize", "个数": "1" }
  }
}
```

字段来源（API 响应）：

| component-map 字段 | API 响应字段 |
|---|---|
| `symbol_id` | `matched_variants[0].symbol_id`（或评分最高变体） |
| `variant_key` | `matched_variants[0].variant_key` |
| `component_set_key` | `component_set.component_set_key` |
| `component_set_resolved` | 固定填 `false`（离线分析阶段） |
| `variant_props` | 与查询 props 对应 |

---

## Step B — 节点树 → 设计 DSL（Script）

```bash
node SKILL_DIR/scripts/build-dsl.js \
  nodes-<filename>.json \
  styles-<filename>.json \
  --component-map component-map-<filename>.json \
  --out dsl-<filename>.json
```

脚本的转换规则（详见 `设计dsl.md`）：

| nodes 字段 | → DSL 字段 | 规则 |
|---|---|---|
| `rect`（绝对坐标） | `box`（相对父节点） | `box.x = rect.x - parent.rect.x` |
| `layout.mode:"flex"`, `direction:"row"` | `auto_layout.direction:"horizontal"` | — |
| `layout.mode:"flex"`, `direction:"column"` | `auto_layout.direction:"vertical"` | — |
| `layout.mode:"grid"` | `auto_layout` wrap 模式 | `direction:horizontal, wrap:true` |
| `layout.mode:"absolute"` | 无 `auto_layout` | 子节点坐标仍相对父节点 |
| `layout.gap` | `auto_layout.gap` | 数值直接映射 |
| `layout.padding` | `auto_layout.padding` | `[top, right, bottom, left]` |
| `layout.alignItems` | `auto_layout.align_items` | `flex-start→min, center→center, flex-end→max, stretch→stretch` |
| `layout.justifyContent` | `auto_layout.justify_content` | `flex-start→min, space-between/around→space_evenly` |
| `backgroundColor` | `fills[{type:"solid"}]` | CSS rgb → `#RRGGBBFF` |
| `backgroundImage:url(...)` | `fills[{type:"image"}]` | 文件名（去扩展名）→ `image_hash` |
| `border` | `strokes` | 解析 `Npx solid rgb(...)` |
| `boxShadow` | `effects[{type:"drop_shadow"}]` | 解析偏移/模糊/颜色 |
| `borderRadius` | `corner_radius` / `corner_radii` | — |
| `fontSize/fontWeight/color…` | `text_style` | 仅 `text` 类型节点 |
| nid 在 component-map 中 | `type:"instance"` | 填充 `CloudInstanceRef` |
| 有子节点 | `type:"frame"` | 带 `children` |
| 无子节点、无文本 | `type:"rectangle"` | — |
| `tag:"img"` | `type:"rectangle"` + image fill | — |
| `tag:"svg"` | `type:"vector"` | — |

---

## Step C — DSL → Pixso hex（Script）

```bash
node SKILL_DIR/scripts/export-hex.js \
  dsl-<filename>.json \
  --url http://localhost:3101 \
  --out <filename>.hex
```

调用 `POST http://localhost:3101/convert`（详见 `API.md`），将响应中的 `hex` 字段写入文件。

- 若响应含 `missing_keys`：打印警告，hex 仍有效（缺失组件被跳过），不中断流程
- 若 API 返回错误：输出错误信息，退出

---

## 验收条件

- [ ] `component-map-<filename>.json` 存在，所有 found=true 的组件均已记录
- [ ] `dsl-<filename>.json` 存在，顶层结构含 `meta` + `pages`
- [ ] 所有 `InstanceLayer` 的 `symbol_id` / `variant_key` / `component_set_key` 均非空
- [ ] `<filename>.hex` 存在且非空
- [ ] 脚本输出 `✓ 所有组件均已解析` 或有明确的 `missing_keys` 警告

---

## 常见坑

- **不要把文本叶节点当组件**：`semantic:"button"` 的 `<p>` 标签是按钮内的文字，不是按钮组件实例，只有其容器 frame 才应映射。
- **`component_set_resolved` 固定填 `false`**：离线分析阶段库不可用，resolver 在 Pixso 导入时处理。
- **`image_hash` 用文件名**：`backgroundImage: url('../image/logo.png')` → `image_hash: "logo"`，与本地 `image/` 目录文件名保持一致。
- **box 是相对坐标**：nodes 里的 `rect` 是绝对页面坐标，转 DSL 时必须减去父节点的 `rect.x/y`。
