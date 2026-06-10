# 设计规范参考（generate-workflow 的决策依据）

> **以下规范供 LLM 在规划图层树和生成 Node DSL 时参考，确保生成的页面美观、专业。**

## 一、设计原则

**1. 视觉层级（Visual Hierarchy）**
- 通过字号、字重、颜色对比建立清晰的视觉层级
- 主标题 > 副标题 > 正文 > 辅助文字，字号差距至少 4px
- 重要元素使用主色/深色，次要元素使用次色/浅色

**2. 留白与间距（Whitespace）**
- 页面边缘留白：移动端 20px，桌面端 40px
- 卡片内边距：16px（小卡片）/ 24px（大卡片）
- 元素间距：8px（紧凑）/ 16px（正常）/ 24px（宽松）
- 避免拥挤，留白是设计的一部分

**3. 对齐与网格（Alignment）**
- 所有文字左对齐或居中对齐（页面级统一）
- 图标与文字垂直居中对齐
- 按钮组水平居中或两端对齐
- 卡片宽度统一（如 335px），形成网格感

**4. 对比与焦点（Contrast & Focus）**
- 主操作按钮使用主色背景 + 白色文字（高对比）
- 次操作按钮使用次色背景或白色背景 + 主色边框（低对比）
- 禁用状态：opacity 0.5 或灰色背景
- 错误状态：红色边框或红色文字

---

## 二、颜色配色规范

**主色方案（Primary Color）**
- **蓝色系**（科技、信任）：主色 `#3478F6FF`，深色 `#0A2E8AFF`，浅色 `#5B9BF8FF`
- **绿色系**（健康、成功）：主色 `#10B981FF`，深色 `#059669FF`，浅色 `#34D399FF`
- **橙色系**（活力、温暖）：主色 `#F5920BFF`，深色 `#D97706FF`，浅色 `#FBBF24FF`
- **紫色系**（创意、高端）：主色 `#8B5CF6FF`，深色 `#7C3AEDFF`，浅色 `#A78BFAFF`

**中性色方案（Neutral Colors）**
- **深色系**：主文字 `#1A1A1AFF`，次文字 `#666666FF`，辅助文字 `#999999FF`
- **浅色系**：页面背景 `#F5F5F5FF`，卡片背景 `#FFFFFFFF`，分割线 `#E5E5E5FF`

**语义色方案（Semantic Colors）**
- **成功**：`#10B981FF`（绿色）
- **错误**：`#EF4444FF`（红色）
- **警告**：`#F5920BFF`（橙色）
- **信息**：`#3478F6FF`（蓝色）

**渐变方案（Gradients）**
- **主色渐变**：`linear-gradient(180deg, #3478F6FF 0%, #0A2E8AFF 100%)`
- **浅色渐变**：`linear-gradient(180deg, #FFFFFFFF 0%, #F5F5F5FF 100%)`
- **深色渐变**：`linear-gradient(180deg, #1A1A1AFF 0%, #333333FF 100%)`

---

## 三、字体排版规范

**字号层级（Font Size Scale）**
- **特大标题**：32px（页面主标题）
- **大标题**：24px（区块标题）
- **中标题**：20px（卡片标题）
- **正文**：16px（主要文字）
- **小正文**：14px（辅助文字、标签）
- **极小文字**：12px（时间戳、版权等）

**字重层级（Font Weight Scale）**
- **粗体**：700（标题、强调）
- **中粗**：600（副标题、按钮文字）
- **中等**：500（重要正文）
- **常规**：400（普通正文）

**行高规范（Line Height）**
- **标题**：1.2倍字号（如 24px → lineHeight 28px）
- **正文**：1.5倍字号（如 16px → lineHeight 24px）
- **多行文本**：1.6倍字号（增强可读性）

**字体家族（Font Family）**
- **默认**：`HarmonyOS Sans`（或 `PingFang SC`）
- **英文**：`Helvetica Neue` / `Arial`
- **数字**：`DIN` / `Roboto`

---

## 四、布局间距规范

**页面级间距**
- **页面边距**：移动端 `20px`，桌面端 `40px`
- **区块间距**：`24px`（大区块）/ `16px`（小区块）
- **卡片间距**：`12px`（紧凑布局）/ `16px`（正常布局）

**容器级间距**
- **卡片内边距**：`padding: 16px`（小卡片）/ `padding: 24px`（大卡片）
- **表单项间距**：`gap: 12px` 或 `margin-bottom: 12px`
- **按钮组间距**：`gap: 12px`（水平排列）

**元素级间距**
- **图标与文字**：`gap: 8px`（水平排列）
- **标签与内容**：`gap: 4px`（垂直排列）
- **列表项间距**：`gap: 8px`（紧凑）/ `12px`（正常）

**Flex 布局间距**
- **水平排列**：`gap: 12px` 或 `justifyContent: space-between`
- **垂直排列**：`gap: 16px` 或 `margin-bottom: 16px`

---

## 五、组件设计规范

**按钮（Button）**
- **大按钮**：w=295px, h=48px, borderRadius=8px
  - 主按钮：backgroundColor=`主色`, color=`#FFFFFFFF`, fontWeight=600
  - 次按钮：backgroundColor=`#FFFFFFFF`, border=`1px solid 主色`, color=`主色`
  - 禁用按钮：backgroundColor=`#E5E5E5FF`, color=`#999999FF`
- **小按钮**：w=160px, h=36px, borderRadius=6px
- **圆角按钮**：w=80px, h=80px, borderRadius=40px（圆形）

**输入框（Input）**
- **大输入框**：w=295px, h=48px, borderRadius=8px
  - 默认状态：backgroundColor=`#FFFFFFFF`, border=`1px solid #E5E5E5FF`
  - 聚焦状态：border=`2px solid 主色`
  - 错误状态：border=`1px solid #EF4444FF`
  - 内边距：padding=`16px 12px`
- **小输入框**：w=160px, h=36px, borderRadius=6px
- **文本域**：h 自适应（如 120px），padding=`12px`

**卡片（Card）**
- **标准卡片**：w=335px, borderRadius=12px, padding=16px
  - backgroundColor=`#FFFFFFFF`
  - boxShadow=`0px 2px 8px rgba(0,0,0,0.08)`（浅阴影）
  - border=`none` 或 `1px solid #E5E5E5FF`
- **大卡片**：w=335px, borderRadius=16px, padding=24px
  - boxShadow=`0px 8px 24px rgba(0,0,0,0.1)`（中阴影）
- **小卡片**：w=160px, borderRadius=8px, padding=12px

**导航栏（Navbar）**
- **标准导航栏**：w=375px, h=56px
  - backgroundColor=`#FFFFFFFF` 或 `主色`
  - 标题：fontSize=18px, fontWeight=600, color=`#1A1A1AFF` 或 `#FFFFFFFF`
  - 左侧图标：返回箭头（24×24）
  - 右侧按钮：操作按钮（如"保存"、"设置")

**标签栏（Tabbar）**
- **标准标签栏**：w=375px, h=64px, backgroundColor=`#FFFFFFFF`
  - boxShadow=`0px -2px 8px rgba(0,0,0,0.08)`（向上阴影）
  - 图标：24×24，选中时用主色，未选中时用 `#999999FF`
  - 文字：fontSize=12px，选中时用主色，未选中时用 `#999999FF`

---

## 六、常见页面模板

**登录页模板**
```
结构：
- 根容器（375×812，backgroundColor=#F5F5F5FF）
- Logo 区（居中，顶部 100px）
  - Logo 图标（80×80）
  - 应用名称（fontSize=24px, fontWeight=700）
- 表单卡片（w=335px, 居中，top=200px）
  - 标题："登录"（fontSize=20px, fontWeight=600）
  - 用户名输入框（w=295px, h=48px）
  - 密码输入框（w=295px, h=48px）
  - 登录按钮（w=295px, h=48px, 主色背景）
- 底部提示（居中，bottom=40px）
  - "忘记密码？"链接（fontSize=14px, color=主色）
  - "注册账号"链接（fontSize=14px, color=主色）
```

**首页模板**
```
结构：
- 根容器（375×812，backgroundColor=#F5F5F5FF）
- Navbar（w=375px, h=56px, backgroundColor=#FFFFFFFF）
  - 左侧：菜单图标（24×24）
  - 中间：应用名称（fontSize=18px, fontWeight=600）
  - 右侧：搜索图标（24×24）
- Hero 区（w=375px, h=200px, backgroundColor=主色渐变）
  - 标题："欢迎回来"（fontSize=32px, fontWeight=700, color=#FFFFFFFF）
  - 副标题："开始你的旅程"（fontSize=16px, color=#FFFFFFFF）
- 内容卡片区（w=335px, 居中，top=280px）
  - 卡片 1：推荐内容（padding=16px）
  - 卡片 2：热门内容（padding=16px）
  - 卡片 3：最新内容（padding=16px）
- Tabbar（w=375px, h=64px, 固定在底部）
```

**设置页模板**
```
结构：
- 根容器（375×812，backgroundColor=#F5F5F5FF）
- Navbar（w=375px, h=56px）
  - 左侧：返回图标（24×24）
  - 中间："设置"（fontSize=18px, fontWeight=600）
- 设置分组（w=335px, 居中）
  - 分组标题："账户"（fontSize=16px, fontWeight=600, marginBottom=8px）
  - 设置卡片（backgroundColor=#FFFFFFFF, borderRadius=12px）
    - 设置项 1："个人信息" + 箭头图标（24×24）
    - 设置项 2："修改密码" + 箭头图标（24×24）
    - 设置项 3："退出登录" + 箭头图标（24×24）
  - 分组标题："偏好"（fontSize=16px, fontWeight=600, marginBottom=8px）
  - 设置卡片（backgroundColor=#FFFFFFFF, borderRadius=12px）
    - 设置项 1："通知" + 开关（switch）
    - 设置项 2："主题" + 当前值 + 箭头图标
```

---

## 七、阴影与圆角规范

**阴影层级（Shadow Levels）**
- **无阴影**：页面背景、分割线
- **浅阴影**：`0px 2px 8px rgba(0,0,0,0.08)`（卡片、输入框）
- **中阴影**：`0px 8px 24px rgba(0,0,0,0.1)`（弹窗、悬浮卡片）
- **深阴影**：`0px 16px 48px rgba(0,0,0,0.15)`（模态框）

**圆角层级（Border Radius Levels）**
- **无圆角**：分割线、导航栏边缘
- **小圆角**：4px（按钮组、标签）
- **中圆角**：8px（输入框、小按钮）
- **大圆角**：12px（卡片、大按钮）
- **特大圆角**：16px（大卡片、弹窗）
- **圆形**：40px（圆形按钮、头像）

---

## 八、图标规范

**图标尺寸标准**
- **导航图标**：24×24（Navbar、Tabbar）
- **功能图标**：20×20（卡片内、按钮旁）
- **装饰图标**：16×16（小标签、辅助文字旁）
- **Logo 图标**：80×80（登录页 Logo）

**图标线条粗细**
- **细线**：strokeWidth=1px（简洁风格）
- **中等**：strokeWidth=1.5px（标准风格）
- **粗线**：strokeWidth=2px（强调风格）

**图标颜色**
- **主色图标**：color=`主色`（选中状态、重要操作）
- **次色图标**：color=`#999999FF`（未选中状态、辅助操作）
- **白色图标**：color=`#FFFFFFFF`（深色背景上的图标）