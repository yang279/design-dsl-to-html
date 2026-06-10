# 生成流程（Step A–C）

> 适用：用户提供一句话设计描述，需要生成节点语义 JSON 文件。

## 执行模式总览

| 步骤 | 执行者 | 核心工作 |
|------|--------|----------|
| Step A — 规划图层树 | **LLM** | 理解设计意图，决定页面结构与组件选型，补全缺失信息 |
| Step B — 生成 Node DSL JSON | **LLM** | 按 node-dsl.md 规范直接生成节点语义 JSON，写出文件 |
| Step C — 完整流程 | **脚本** | 调用 `/pipeline` 接口，一次性完成补全 + 转 DSL + 导出 hex（仅需一次 HTTP 请求） |

## 产物目录结构

```
<slug>-output/
├── <slug>-node.json        ← Node DSL JSON（Step B）
├── pipeline-result.json    ← 完整流程响应（Step C）
├── <slug>-output.hex       ← 最终产物（Step C，可直接导入 Pixso）
└── <slug>-output.zip       ← zip 包（含 hex + placeholder 资源）
```

`<slug>` 取自页面名称的短 slug（如 `login`、`settings`）。

---

## 设计规范参考

> **⚠️ 重要：Step A 和 Step B 的决策依据**  
> LLM 在规划图层树和生成 Node DSL 时，必须遵循专业设计规范，确保生成的页面美观、易用。  
> **详细规范见**：[design-guidelines.md](design-guidelines.md)（必读）

**核心设计原则（摘要）：**
1. **视觉层级**：字号、字重、颜色建立清晰层级（主标题 32px > 副标题 24px > 正文 16px）
2. **留白间距**：页面边距 20px、卡片内边距 16-24px、元素间距 8-16px（避免拥挤）
3. **配色规范**：使用主色方案（蓝/绿/橙/紫）+ 中性色 + 语义色，避免随意配色
4. **组件规范**：按钮（295×48）、输入框（295×48）、卡片（335px宽），遵循标准尺寸
5. **字体规范**：字号层级 32→24→20→16→14→12px，字重 700→600→500→400
6. **阴影圆角**：卡片用浅阴影 `0px 2px 8px rgba(0,0,0,0.08)`，圆角 12px

**常用页面模板（推荐）：**
- **登录页**：Logo 区 + 表单卡片 + 底部提示（见 design-guidelines.md 第 6 节）
- **首页**：Navbar + Hero 区 + 内容卡片区 + Tabbar
- **设置页**：Navbar + 设置分组 + 设置卡片

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

## Step C — 完整流程（补全 + 生成 Hex）

> **执行者：脚本**  
> 以 Step B 生成的 `<slug>-node.json` 为输入，调用 Unified DSL Pipeline API 的 `/pipeline` 接口（端口 3104），**一次性完成**补全节点信息（iconSvg + component）+ 转 design-dsl + 导出 hex，仅需一次 HTTP 请求。

**服务信息：**

| 服务 | 端口 | 接口 | 输入 | 输出 |
|---|---|---|---|---|
| Unified DSL Pipeline | 3204 | `POST /pipeline` | node-dsl JSON 文件 | zip（补全 + 转 DSL + 导出一次性完成，hex 在 zip 内） |

**调用步骤：**

**① 调用 `/pipeline` 接口（完整流程）**

```bash
# 调用 Unified DSL Pipeline 的 pipeline 接口
# 上传 node-dsl JSON，一次性完成：补全 + 转 design-dsl + 导出 hex
curl -s -X POST http://localhost:3204/pipeline \
  -F "file=@<slug>-output/<slug>-node.json" \
  -F "page_name=<slug>" \
  -F "skip_enrich=false" \
  -o "<slug>-output/pipeline-result.json"

# 解析响应，提取 zip（hex 在 zip 内的 output.hex）
node -e "
const r = JSON.parse(require('fs').readFileSync('<slug>-output/pipeline-result.json'));
if (r.success) {
  const zipBuffer = Buffer.from(r.zip, 'base64');
  require('fs').writeFileSync('<slug>-output/<slug>-output.zip', zipBuffer);
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

# 从 zip 中提取 hex 文件
unzip -p "<slug>-output/<slug>-output.zip" output.hex > "<slug>-output/<slug>-output.hex"

# 查看 zip 内容（optional）
unzip -l "<slug>-output/<slug>-output.zip"
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
| `<slug>-output.hex` | 最终产物，可直接导入 Pixso（从 zip 中提取） |
| `<slug>-output.zip` | zip 包（含 output.hex + placeholder 资源） |
| `{guid}.svg` | icon placeholder 的 SVG 内容（zip 内） |
| `{guid}.png` | image placeholder 的图片内容（zip 内） |

> **调试说明：** `pipeline-result.json` 保存完整响应，包含所有统计信息和产物数据。

**降级规则：**

- 接口请求失败 → 报错提示，不生成产物
- `missing_keys` 非空 → 记录警告，hex/zip 仍有效
- 补全失败（icons/components = 0）但接口返回成功 → hex/zip 仍生成，无补全数据

**Step C 验收：** `<slug>-output.hex` 存在（可直接导入 Pixso）。