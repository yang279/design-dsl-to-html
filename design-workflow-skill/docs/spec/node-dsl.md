# 语义节点 Schema

将剪枝后的节点树（nodes）、精简样式映射（styles）与 LLM 语义标注三者合并为单一 JSON 文件，每个节点内联自身样式，无需跨文件关联。

---

## 顶层结构

```
Node | Node[]
```

顶层为单个节点对象（单根页面）或节点数组（html/body 被剥掉后出现多个顶层子节点）。

---

## Node

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `nid` | number | 是 | 节点全局自增 ID，与 step1 styles 文件通过此字段关联 |
| `tag` | string | 是 | HTML 标签名，小写，如 `div` / `button` / `img` |
| `depth` | number | 是 | DOM 树深度，根节点为 `2`（html/body 已剥掉）|
| `rect` | Rect | 是 | 节点绝对坐标和尺寸，见 [Rect](#rect) |
| `semantic` | string | 是 | LLM 标注的语义类型，见 [SemanticType](#semantictype) |
| `label` | string | 是 | LLM 标注的可读描述。结合节点 `text`、`class`、`attrs`、父节点语义及页面整体上下文综合判断，描述到具体业务含义。同类节点在同一页面内必须可区分，如 `"登录按钮"` / `"注册按钮"`，不得笼统写 `"按钮"`。**`semantic` 为 `icon` 时还须注明尺寸和线条粗细，如 `"返回图标 24×24 细线"` / `"搜索图标 20×20 中等"`** |
| `confidence` | string | 是 | LLM 标注置信度：`"high"` 或 `"low"` |
| `style` | Style | 是 | 内联精简样式，见 [Style](#style)；样式全为默认值时为 `{}` |
| `id` | string | 否 | 元素 `id` 属性 |
| `class` | string | 否 | 元素 `class` 属性，截断至 200 字符 |
| `attrs` | object | 否 | 除 id/class/style 外的所有 HTML 属性键值对 |
| `text` | string | 否 | 直接子文本节点内容，截断至 300 字符 |
| `src` | string | 否 | img / video / audio / script 的 src |
| `alt` | string | 否 | img 的 alt |
| `href` | string | 否 | a / link 的 href |
| `type` | string | 否 | input 的 type |
| `naturalWidth` | number | 否 | img 原始宽度（px）|
| `naturalHeight` | number | 否 | img 原始高度（px）|
| `loaded` | boolean | 否 | img 是否加载成功 |
| `passthrough` | boolean | 否 | `true` 表示节点自身尺寸为 0 但有可见后代，是透传容器 |
| `children` | Node[] | 否 | 子节点列表（有子节点时输出）|

---

## Rect

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `x` | number | 是 | 页面坐标系 X（`getBoundingClientRect().left`，已四舍五入）|
| `y` | number | 是 | 页面坐标系 Y（`top + scrollY`；`position:fixed` 元素不加 scrollY）|
| `w` | number | 是 | 宽度（px）|
| `h` | number | 是 | 高度（px）|
| `fixed` | boolean | 否 | 仅 `position:fixed` 元素出现，值固定为 `true` |

---

## Style

精简样式对象，只含非浏览器默认值的字段。所有字段均为可选。

**文字**

| 字段 | 类型 | 过滤条件（符合时才输出）|
|---|---|---|
| `fontSize` | string | 始终输出，如 `"16px"` |
| `fontWeight` | string | 非 `"400"` |
| `color` | string | 非 `"rgb(0, 0, 0)"` |
| `lineHeight` | string | 非 `"normal"` |
| `letterSpacing` | string | 非 `"normal"` 且非 `"0px"` |
| `textAlign` | string | 非 `"start"` 且非 `"left"` |
| `textTransform` | string | 非 `"none"` |
| `whiteSpace` | string | 非 `"normal"` |

**布局**

| 字段 | 类型 | 过滤条件 |
|---|---|---|
| `display` | string | 非 `"block"` 且非 `"inline"`，如 `"flex"` / `"grid"` |
| `position` | string | 非 `"static"`，如 `"absolute"` / `"fixed"` |
| `flexDirection` | string | 非 `"row"`，如 `"column"` |
| `flexWrap` | string | 非 `"nowrap"` |
| `justifyContent` | string | 非 `"normal"` 且非 `"flex-start"` |
| `alignItems` | string | 非 `"normal"` 且非 `"stretch"` |
| `gap` | string | 非 `"normal"` 且非 `"0px"` |
| `gridTemplateColumns` | string | 非 `"none"` |

**定位**

| 字段 | 类型 | 过滤条件 |
|---|---|---|
| `top` / `left` / `right` / `bottom` | string | 非 `"auto"` |
| `zIndex` | string | 非 `"auto"` |

**背景**

| 字段 | 类型 | 过滤条件 |
|---|---|---|
| `backgroundColor` | string | 非透明（非 `"rgba(0, 0, 0, 0)"` 且非 `"transparent"`）|
| `backgroundImage` | string | 非 `"none"`（CSS 渐变或 `url(...)`）|
| `backgroundSize` | string | 有 `backgroundImage` 时才出现 |
| `backgroundPosition` | string | 有 `backgroundImage` 时才出现 |
| `backgroundRepeat` | string | 非 `"repeat"` 且有 `backgroundImage` |

**装饰**

| 字段 | 类型 | 过滤条件 |
|---|---|---|
| `borderRadius` | string | 非 `"0px"` |
| `border` | string | 不以 `"0px"` 开头 |
| `boxShadow` | string | 非 `"none"` |
| `opacity` | string | 非 `"1"` |
| `overflow` | string | 非 `"visible"` |
| `transform` | string | 非 `"none"` |

**遮罩**

| 字段 | 类型 | 过滤条件 |
|---|---|---|
| `maskImage` | string | 非 `"none"` |
| `maskSize` / `maskPosition` | string | 有 `maskImage` 时才出现 |
| `backdropFilter` | string | 非 `"none"` |

---

## SemanticType

| 值 | 含义 |
|---|---|
| `navbar` | 顶部导航栏 |
| `tabbar` | 底部标签栏 |
| `button` | 可点击按钮 |
| `icon` | 图标（SVG / img）|
| `input` | 文本输入框 |
| `avatar` | 用户头像 |
| `switch` | 开关控件 |
| `card` | 内容卡片容器 |
| `list` | 列表容器 |
| `list-item` | 列表单项 |
| `image` | 图片展示区 |
| `text` | 纯文字节点 |
| `heading` | 标题文字 |
| `divider` | 分割线 |
| `container` | 通用布局容器 |
| `modal` | 弹层 / 对话框 |
| `badge` | 角标 / 徽标 |

---

## 完整示例

```json
{
  "nid": 3,
  "tag": "div",
  "depth": 2,
  "rect": { "x": 0, "y": 0, "w": 375, "h": 812 },
  "id": "app",
  "class": "page page--login",
  "semantic": "container",
  "label": "登录页根容器",
  "confidence": "high",
  "style": { "display": "flex", "flexDirection": "column", "backgroundColor": "rgb(245,245,245)" },
  "children": [

    {
      "nid": 4,
      "tag": "header",
      "depth": 3,
      "rect": { "x": 0, "y": 0, "w": 375, "h": 56, "fixed": true },
      "class": "navbar",
      "semantic": "navbar",
      "label": "顶部导航栏",
      "confidence": "high",
      "style": {
        "display": "flex",
        "alignItems": "center",
        "position": "fixed",
        "top": "0px",
        "zIndex": "100",
        "backgroundColor": "rgb(255,255,255)",
        "boxShadow": "0px 1px 0px rgba(0,0,0,0.08)"
      },
      "children": [
        {
          "nid": 5,
          "tag": "span",
          "depth": 4,
          "rect": { "x": 16, "y": 16, "w": 24, "h": 24 },
          "class": "icon icon--back",
          "semantic": "icon",
          "label": "返回图标",
          "confidence": "high",
          "style": { "fontSize": "24px" }
        },
        {
          "nid": 6,
          "tag": "h1",
          "depth": 4,
          "rect": { "x": 130, "y": 12, "w": 115, "h": 32 },
          "text": "登录",
          "semantic": "heading",
          "label": "页面标题",
          "confidence": "high",
          "style": { "fontSize": "18px", "fontWeight": "600", "textAlign": "center" }
        }
      ]
    },

    {
      "nid": 10,
      "tag": "form",
      "depth": 3,
      "rect": { "x": 20, "y": 80, "w": 335, "h": 360 },
      "class": "login-form",
      "semantic": "container",
      "label": "登录表单",
      "confidence": "high",
      "style": {
        "display": "flex",
        "flexDirection": "column",
        "gap": "16px",
        "backgroundColor": "rgb(255,255,255)",
        "borderRadius": "16px",
        "boxShadow": "0px 8px 24px rgba(0,0,0,0.08)"
      },
      "children": [

        {
          "nid": 11,
          "tag": "div",
          "depth": 4,
          "rect": { "x": 20, "y": 80, "w": 335, "h": 56 },
          "class": "input-field",
          "semantic": "input",
          "label": "用户名输入框",
          "confidence": "high",
          "style": {
            "display": "flex",
            "alignItems": "center",
            "border": "1px solid rgb(229,229,229)",
            "borderRadius": "8px",
            "backgroundColor": "rgb(250,250,250)"
          },
          "children": [
            {
              "nid": 12,
              "tag": "input",
              "depth": 5,
              "rect": { "x": 36, "y": 96, "w": 303, "h": 24 },
              "attrs": { "placeholder": "请输入用户名" },
              "type": "text",
              "semantic": "input",
              "label": "用户名 input",
              "confidence": "high",
              "style": { "fontSize": "16px", "color": "rgb(26,26,26)" }
            }
          ]
        },

        {
          "nid": 20,
          "tag": "button",
          "depth": 4,
          "rect": { "x": 20, "y": 260, "w": 335, "h": 48 },
          "class": "btn btn--primary",
          "text": "登录",
          "semantic": "button",
          "label": "主登录按钮",
          "confidence": "high",
          "style": {
            "display": "flex",
            "justifyContent": "center",
            "alignItems": "center",
            "backgroundColor": "rgb(52,120,246)",
            "borderRadius": "8px",
            "fontSize": "16px",
            "fontWeight": "600",
            "color": "rgb(255,255,255)"
          }
        },

        {
          "nid": 21,
          "tag": "img",
          "depth": 4,
          "rect": { "x": 0, "y": 0, "w": 0, "h": 0 },
          "src": "/icons/eye.svg",
          "alt": "",
          "naturalWidth": 24,
          "naturalHeight": 24,
          "loaded": true,
          "passthrough": true,
          "semantic": "icon",
          "label": "密码可见切换图标",
          "confidence": "low",
          "style": {}
        }

      ]
    },

    {
      "nid": 30,
      "tag": "nav",
      "depth": 3,
      "rect": { "x": 0, "y": 746, "w": 375, "h": 66, "fixed": true },
      "class": "tabbar",
      "semantic": "tabbar",
      "label": "底部标签栏",
      "confidence": "high",
      "style": {
        "display": "flex",
        "justifyContent": "space-around",
        "alignItems": "center",
        "position": "fixed",
        "bottom": "0px",
        "zIndex": "100",
        "backgroundColor": "rgb(255,255,255)",
        "boxShadow": "0px -1px 0px rgba(0,0,0,0.06)"
      }
    }

  ]
}
```
