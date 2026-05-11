# Mobile Native Shell — Design

**Date**: 2026-05-11
**Branch**: feat/mobile-native-shell (off main)
**Trigger**: APK 验证反馈"像嵌入手机的网页"。具体痛点:
1. 左右滑动(Android 边缘返回手势)直接退出应用,没有拦截
2. 卡片内容垂直居中,手机上长屏比例导致上下大块留白
3. 设置弹窗里 `<select>` 选项值过长被截断
4. 整体不像原生应用 chrome

## Goals

把已经发布的 PWA 在 Android APK 里改造成原生质感的 shell,**不破坏现有视觉语言**(immersive card / day-dusk 双主题 / Newsreader serif)。

非目标:
- 不重写计算逻辑(`RETIREMENT_RULES` 不动)
- 不改通知调度链路
- 不引入 React/Vue 等框架
- iOS 端不做额外验证(项目当前只发 Android APK,iOS 配置保留可编译状态即可)

## Architecture

### 新增 Capacitor 插件

| 插件 | 用途 | 调用点 |
|---|---|---|
| `@capacitor/app` | 拦截返回手势/键 | `init()` 注册 `backButton` 监听 |
| `@capacitor/status-bar` | 状态栏色匹配 mood | `applyMood()` 切主题时调 `StatusBar.setStyle/setBackgroundColor` |
| `@capacitor/haptics` | 触觉反馈 | mood toggle / sheet 开关 / 保存 / picker 选中 / slider 到边界 |

所有 native 分支用 `await import('@capacitor/...')` 动态加载 + try/catch 包裹,web 端永不触达。

### CSS 变化总览

- `body` 改 `padding` 使用 `env(safe-area-inset-*)`,避开刘海/导航条
- `.countdown-card` 内部从 `justify-content: center` 改 `space-between`,加两个 `.cluster` 包顶部/底部簇
- `.settings-dialog` 在 ≤640px 时从居中圆角矩形变成贴底部 sheet(顶部圆角 + 拖把手 + 滑入动画)
- 新增 `.picker-sheet` 二级 sheet,覆盖在设置 sheet 之上展示选项列表

### HTML 变化总览

- `.countdown-card` 内部包两层 `<div class="cluster cluster--top">` / `<div class="cluster cluster--bottom">`
- 三个 `<select>`(calculationMode / workerType / flexMode)各替换为:
  - `<input type="hidden">` 保留 form 值
  - `<button class="picker-trigger" data-picker="<id>">` 显示当前选中文案 + ↓ 图标
- 新增 `<dialog class="picker-sheet" id="pickerSheet">` 通用选项列表容器,标题 + ✓ 标记当前选项,内容由 JS 注入

### JS 变化总览(`src/main.js`)

新增模块:
1. **back-gesture handler** — `App.addListener('backButton', ...)`:
   - 优先级 1:有打开的 `<dialog>` (picker sheet) → close
   - 优先级 2:设置 sheet 打开 → close
   - 优先级 3:`App.minimizeApp()` 后台化(而非退出)
2. **bottom sheet drag-to-close** — 监听设置 sheet 顶部把手区域的 `touchstart/move/end`,下拉超过阈值(80px 或速度 > 0.5px/ms)→ 调 `dialog.close()`
3. **picker controller** — 一个 `openPicker(triggerEl)` 函数:
   - 读 `data-picker` 拿到字段名
   - 从注册表(JS 常量)取选项清单
   - 渲染 `<dialog id="pickerSheet">` 内容,标记当前选中
   - 点选 → 写 hidden input → 触发 `input` event → 关闭 sheet
4. **status bar sync** — 在 `applyMood()` 末尾调 native StatusBar 接口
5. **haptics helper** — `triggerHaptic(style = 'Light')`,封装动态 import + try/catch

### 数据流(保持不变)

```
用户操作 picker → hidden input.value = newValue → 'input' event 冒泡
    ↓
现有监听器(onWorkerTypeChange / onFlexModeChange / ...) 触发重算
    ↓
recomputePolicyResult() / updateCountdown() / scheduleNotification()
    ↓
localStorage[retirement-countdown-settings] 持久化
```

Picker 只换了输入控件外壳,下游零改。

## File Plan

| 文件 | 变更类型 | 大致行数 |
|---|---|---|
| `package.json` | 加 3 个 dep + version bump | +3 |
| `package-lock.json` | npm install 产物 | 自动 |
| `index.html` | 包 cluster div / select → picker-trigger / 加 picker-sheet 容器 | ~+40 / -20 |
| `styles.css` | safe-area / 卡片均分 / sheet 样式 / picker 样式 / picker-trigger 样式 | ~+200 |
| `src/main.js` | back-button / drag-close / picker / status bar / haptics | ~+180 |
| `capacitor.config.json` | StatusBar 默认配置 | +5 |

## Implementation Slices

单 PR / 单 commit,但内部按顺序写以便回滚定位:

1. 装插件 + `cap sync`
2. 卡片纵向均匀分布 + safe-area
3. dialog → bottom sheet 视觉 + 拖拽关闭
4. select → picker(button + 选项 sheet)
5. StatusBar 跟随 mood 主题
6. Haptics 加在 5 个点(mood toggle / sheet 开关 / 保存 / picker 选中 / slider 到 0/36)
7. Capacitor App 返回手势拦截

## Error Handling

- **Web 浏览器**:所有 native 路径走动态 import + isNativePlatform 双重判断,完全无副作用
- **老 Android(无 Haptics 硬件)**:Capacitor API 仍返回 resolve,系统层无振动,无报错
- **StatusBar 在某些机型不支持**:try/catch 吞掉,主流程不阻塞
- **picker 数据缺失**:`openPicker` 找不到字段定义时 console.warn 并不打开 sheet,fallback 安全

## Testing

- `npm test` 11/11 必须仍绿(`retirement.js` 不动)
- `npm run build` 无 warning
- CI APK 构建必须出包(本 PR 触发 pull_request workflow)
- **人工验证清单**(用户在 APK 上跑):
  - [ ] 边缘左滑/右滑:有 sheet → 关 sheet;无 sheet → 退后台不退应用
  - [ ] 主屏卡片顶部 / 底部分别贴 safe-area 边界,中间 hero 居中
  - [ ] 设置面板从底部滑入,顶部把手可下拉关闭
  - [ ] 三个 picker 点开显示完整文案,选中后 ✓ 标记,关闭后触发器按钮显示新值
  - [ ] 状态栏在 day 主题为浅底深字,dusk 主题为深底浅字
  - [ ] 5 个 haptic 触发点都有轻振动反馈

## Migration / Rollout

- 单独分支 `feat/mobile-native-shell` 直接 base on main
- 开 PR,CI 触发 APK 构建
- 用户下载 APK 验证
- 通过后 squash-merge 到 main

## Open Risks

| 风险 | 缓解 |
|---|---|
| Capacitor 插件版本与现有 v8 不兼容 | 锁定到 `^8.x` 同主版本,失败则降级到必要功能子集 |
| `<dialog>` 在 Android WebView 老版本支持差 | 项目已用 `<dialog>`,既有用户未反馈过该问题,继续用 |
| 拖拽关闭手势与 Android 边缘返回冲突 | drag handler 只绑在 sheet 顶部把手 32px 高度区,远离屏幕边缘 |
| 触觉过密让用户烦 | 范围已收敛到"决策点",非每按钮触发 |
