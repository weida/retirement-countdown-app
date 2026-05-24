# 退休倒计时项目 — 评审行动清单

本清单基于 `docs/architecture-review.md` 与当前代码评审整理,可作为修复任务直接分配。条目按优先级 P0 → P2 排列,**条目内尽量独立,可单独取出做一个 PR**。

## 当前状态(截至 2026-05-10 评审)

| 项 | 状态 | 落地处 |
|---|---|---|
| P0-1 退休后停止/调整提醒 | ✅ 已完成 | `src/retirement.js` `isRetired()`、`src/main.js` `scheduleReminder` / `notifyRetirementReachedOnce` |
| P0-2 PWA 缓存修复 | ✅ 已完成(runtime caching 路线) | `public/service-worker.js` v3,network-first + activate 清理旧 cache |
| P0-3 lockfile + `npm ci` | ✅ 已完成 | `package-lock.json` 已提交,workflow 切到 `npm ci` + `cache: npm` + setup-gradle |
| P1-1 政策计算抽离 + 单测 | ✅ 已完成 | `src/retirement.js`(纯函数 + `+1` 注释)、`src/retirement.test.js` 11 个测试,样例覆盖 P1-1 列出的全部边界 |
| P1-2 双日期 UI | ✅ 已完成 | `index.html` `#policyResult` 卡片、`src/main.js:179-183` 渲染、`styles.css` `.policy-result` |
| P1-3 清理根目录旧资源 | ✅ 已完成 | `app.js` / `icon.svg` / `manifest.webmanifest` / `service-worker.js` 已删,`docs/architecture-review.md` §3 同步 |
| P2-1 appId / release 签名 / 版本号 | ⏸ 待发布前处理 | — |
| P2-2 flexMonths 上限统一 | ✅ 已完成(选了"统一 36"路线) | `src/retirement.js` `FLEX_LIMIT_MONTHS` 常量 |
| P2-3 CI workflow 优化 | ✅ 已完成 | `.github/workflows/android-apk.yml` paths-ignore + npm cache + gradle cache + 加跑 `npm test` |
| P2-4 隐私政策页 | ⏸ 仅在公开上架时做 | — |

P0/P1 全部完成,部分 P2 顺手做掉。下面 P3 小节是这一轮评审中**新发现的小问题**,不阻塞合并,可在下一次小修中处理。

## 设计约束(改动前请先读)

- 项目刻意保持 **Vanilla JS**,不引入 React / Vue / 状态管理库。
- 文案与定位是 **中文为主**(`<html lang="zh-CN">`),不要顺手英文化既有 UI 字符串。
- **无后端、无账号、无埋点**,任何"上传/同步"类改动需先提议讨论,不要顺势加进来。
- 政策计算是核心 IP,涉及它的改动**必须先有测试或样例校验**,否则不要合并。

---

## P0 — 影响正确性或核心体验,优先合并

### P0-1 退休日之后停止 / 调整每日提醒 ✅ 已完成

**现状**

- `src/main.js:380-385` `nativeReminderBody()` 当 `retireDate` 已过,返回 `"距离退休还有 0 天。"`,**永远显示 0 并继续每天推送**。
- `src/main.js:336-352` 原生通知 `repeats: true, every: "day"`,无任何到期取消逻辑。
- Web 端 `scheduleReminder` 同理,定时器无限自我重排。

**期望**

- 当 `today >= retireDate` 后:
  - 原生:取消每日重复通知,改为发送一次"退休日已到"通知后停止;或改为**每周/每月**频率的"已退休 N 天"轻提醒(二选一,与产品对齐后再做)。
  - Web:同样停止重排 `setTimeout`。
- UI `#nextReminder` 在已退休状态下显示"已退休,提醒已停止"或类似文案,而不是下一次提醒时间。

**相关文件**

- `src/main.js:306-352` 调度逻辑
- `src/main.js:374-385` 提醒文案
- `index.html:117-120` 下一次提醒展示

**验收**

- 把退休日设为昨天,保存设置后:`#nextReminder` 文案变化,不再显示新的未来时间;原生 build 上验证通知不再每天到达(可手动改系统时间或缩短间隔验证)。

---

### P0-2 PWA 资源缓存修复(目前离线打不开) ✅ 已完成

**现状**

`public/service-worker.js:3-10` 仅预缓存:

```js
"/", "/index.html", "/manifest.webmanifest", "/icon.svg"
```

但 Vite 产物入口是 `dist/assets/index-<hash>.js` / `.css`,这些**不在预缓存里**。`fetch` handler 在离线时直接走 `fetch(event.request)` → 失败 → **白屏**。

文档 §1 与 §6 都把"PWA 形式运行"作为支持形态,实际不可用。

**期望(二选一)**

A. **推荐**:引入 [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/),由插件自动注入资源清单 + manifest。删除手写的 `public/service-worker.js` 与 `public/manifest.webmanifest`,改用插件配置。

B. 若不愿加依赖:改成 runtime caching —— 安装阶段只缓存 shell,`fetch` handler 改成 `cache-first, then network, then cache.put`,并在 `activate` 阶段清理旧 cache 版本。

**注意**

- 升级时旧 SW 会"卡用户":必须实现 `activate` 中清理旧 cache (`retirement-countdown-v2`、未来的 v3 …),并测试一次"已安装 PWA 的用户在升级后能拿到新 JS"的场景。
- iOS Safari PWA 的限制要保留在文档里,不要承诺它能后台推送。

**相关文件**

- `public/service-worker.js`
- `public/manifest.webmanifest`
- `src/main.js:127-129` SW 注册位置

**验收**

- DevTools → Application → Service Workers → Offline 勾上 → 刷新,页面正常渲染、JS 执行、倒计时显示。
- 改一行源码 → `npm run build` → 重新加载 → 旧 SW 被新版替换,无残留 cache。

---

### P0-3 提交 `package-lock.json`,CI 改用 `npm ci` ✅ 已完成

**现状**

- 仓库**没有** `package-lock.json`(已确认),`.gitignore` 也没排除它,纯粹是没生成/没提交。
- `.github/workflows/android-apk.yml:33` 用 `npm install`,每次 CI 解析依赖都可能漂移。Capacitor 8.x 与 Vite 7 都在快速迭代版本,这个不可重现是真实风险。

**期望**

1. 本地 `npm install` 生成 lockfile,提交。
2. workflow 改 `npm ci`。
3. `setup-node@v4` 加 `cache: 'npm'` 提升 CI 速度。

**相关文件**

- `package.json`(无需改动,只是触发生成 lock)
- `.github/workflows/android-apk.yml:18-21, 32-33`

**验收**

- Push 后 CI 仍能成功产出 `retirement-countdown-debug-apk`。
- 重跑同一 commit,依赖版本一致(`npm ci` 失败即说明 lock 与 package.json 不一致)。

---

## P1 — 可信度与可维护性

### P1-1 政策计算的单元测试 + 公式可读性 ✅ 已完成

**现状**

- `src/main.js:221-229` `calculateDelayMonths` 中的 `Math.floor(monthsAfterStart / rule.monthsPerDelayMonth) + 1` 没有任何注释解释 `+1` 的来源。
- 0 测试覆盖,文档 §10 / §11 已经点出风险。

**期望**

1. 加测试框架(轻量即可:`vitest` 与 Vite 同源,几乎零配置)。
2. 把核心计算函数从 `src/main.js` 抽成独立模块 `src/retirement.js`(只导出纯函数,不依赖 DOM / Capacitor),便于测试。
3. 至少覆盖以下样例(可对照官方对照表逐一确认):
   - 男职工 1964-12 出生(改革起点前):无延迟,60 岁退休。
   - 男职工 1965-01 出生:60 岁 1 个月。
   - 男职工 1972-09 出生:验证延迟接近上限。
   - 男职工 ≥1976-01 出生:封顶 63 岁。
   - 女职工(原 50)各延迟节奏边界。
   - 弹性提前不会低于原法定年龄(`originalMinimumAgeMonths`)。
   - 弹性延迟在 `flexMonths > maxDelayMonths` 时如何处理(目前 `normalizeFlexMonths` 硬编码 36,见 P2-2)。
4. **同时**:在 `RETIREMENT_RULES` 表上补一行 `// 改革起点出生月份对应 +1 个月延迟; 之后每 N 个月再 +1` 之类的注释,把 `+1` 的来源写清楚。

**相关文件**

- `src/main.js:7-32` 规则表
- `src/main.js:187-229` 计算逻辑
- `package.json` 加 `vitest` devDependency 与 `test` script

**验收**

- `npm test` 运行,所有样例通过。
- 计算函数移出后,`src/main.js` 仍能正常运行(import 重定向)。

---

### P1-2 UI 同时展示"法定退休日"与"弹性调整后退休日" ✅ 已完成

**现状**

- `src/main.js:215-218` 把法定与弹性结果合并成一段中文 `note`,只在 `#policyNote` 文字里出现。
- 顶部 `#heroCount` / `#targetLabel` 只有最终一个日期,用户无法直观对比。

**期望**

- 在 `#policyFields` 下方加一个轻量结果卡片,分两行展示:
  - **改革后法定退休日**:YYYY-MM-DD(对应年龄 X 岁 Y 个月)
  - **弹性调整后退休日**:YYYY-MM-DD(对应年龄 X 岁 Y 个月,提前/延迟 N 个月)
- 手动模式下隐藏该卡片。
- 计算逻辑里 `calculateRetirementDate` 同时返回 `statutoryDate` 和 `finalDate`,而不是只返回 final。

**相关文件**

- `src/main.js:187-219`
- `index.html:62-97`
- `styles.css`(对应卡片样式)

**验收**

- 切换 `flexMode` 时两个日期对比明显。
- 选择"按改革后法定退休年龄"时两个日期一致(或只显示一行,与产品确认)。

---

### P1-3 清理根目录的旧版重复资源 ✅ 已完成

**现状**

根目录与 `public/` **各有一份且内容不同**:

| 文件 | 根目录(已废弃) | public/(实际服务) |
|---|---|---|
| `app.js` | 旧版无政策计算、无 Capacitor | (无,被 `src/main.js` 取代) |
| `manifest.webmanifest` | 相对路径 | 绝对路径 ✓ |
| `service-worker.js` | cache `v1` | cache `v2` ✓ |
| `icon.svg` | 同 public | 重复 |

Vite 把 `public/` 当作 web root,根目录这四个文件**不会被任何代码加载**。

**期望**

```bash
git rm app.js manifest.webmanifest service-worker.js icon.svg
```

并更新 `docs/architecture-review.md` §3 目录结构,把这四行删掉。

**注意**

- 删除前 grep 一遍确认无引用:`grep -rn "app\.js\|/manifest\.webmanifest\|/service-worker\.js" --exclude-dir=node_modules --exclude-dir=dist .` —— 应只命中 `index.html` 和 `public/` 内部引用。

**验收**

- `npm run build && npm run preview` 仍能正常运行。
- 安装 PWA 后 manifest / icon 仍正确。

---

## P2 — 对外发布前要做,但不阻塞内测

### P2-1 `appId`、release 签名、版本号策略 ⏸ 待发布前处理

**现状**

- ~~`capacitor.config.json:2` `appId: "com.codex.retirementcountdown"` —— "codex" 看起来是模板残留,**不要用这个上架**。~~ **已改为 `dev.weicao.retirementcountdown`。**
- `.github/workflows/android-apk.yml` 只产 debug APK,无签名、无版本号管理。

**期望**

1. 与产品/发布方对齐新的 `appId`(例如 `dev.weicao.retirementcountdown` 之类)。
2. 加 release workflow:
   - `secrets.ANDROID_KEYSTORE_BASE64` + `secrets.KEYSTORE_PASSWORD` + `secrets.KEY_ALIAS` + `secrets.KEY_PASSWORD`。
   - `gradlew assembleRelease` 并签名。
   - 仅在 tag push(如 `v1.0.0`)时触发。
3. `versionCode` / `versionName` 从 `package.json` 的 `version` 注入,避免手工同步。

**注意**

- `appId` 一旦发布就不能改(等同于 Android 应用包名),先确认。
- keystore 丢失即无法升级 app,要做安全备份。

---

### P2-2 `flexMonths` 上限按 `RETIREMENT_RULES[workerType].maxDelayMonths` 动态化 ✅ 已完成(选了"统一 36"路线)

**现状**

- `index.html:88` `<input id="flexMonths" max="36">` 硬编码 36。
- `src/main.js:474-478` `normalizeFlexMonths` 也硬编码 `Math.min(..., 36)`。
- `RETIREMENT_RULES.female50.maxDelayMonths = 60`,与 36 是不同含义被巧合写成同值。

**期望**

- 选择不同 `workerType` 时,`#flexMonths` 的 `max` 与文案("提前 X 年内")根据规则动态调整。
- `normalizeFlexMonths` 改成接收 `maxMonths` 参数,而不是硬编码。
- `policy-note` 中提及"提前 3 年内 / 延迟 3 年内"的描述也要按规则联动。

**注意**

- 若产品决定弹性上限统一就是 36 个月,无视规则差异,那就给 `36` 一个常量名(如 `FLEX_LIMIT_MONTHS`)并加注释,**不要让两个无关的 36 看起来同源**。

---

### P2-3 CI workflow 优化 ✅ 已完成(并加跑了测试)

**现状**

- `.github/workflows/android-apk.yml` 在每次 push 到 `main`/`master` 都跑全套 Android 构建,包括 README/CLAUDE.md/docs 的小改动。
- 无 npm 缓存,`setup-android` 与 gradle 也无缓存。

**期望**

```yaml
on:
  workflow_dispatch:
  push:
    branches: [main, master]
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - '.github/ISSUE_TEMPLATE/**'
```

加缓存:

- `setup-node@v4` 配 `cache: 'npm'`(依赖 P0-3 的 lockfile)。
- 可选:`gradle/actions/setup-gradle@v3` 自带缓存。

**验收**

- 改一行 docs 不再触发 Android 构建。
- 同分支重复构建第二次明显比第一次快。

---

### P2-4(条件性)隐私政策页 ⏸ 仅在公开上架时做

**触发条件**:**仅在准备公开上架商店时**做,内部使用不需要。

- 在 `index.html` 加一个 "关于 / 隐私" 入口,内容写明:不收集、不上传、不同步、本地存储项清单(见 `docs/architecture-review.md` §7)。
- 商店要求的网页版隐私政策可指向同一页或 GitHub Pages。

---

## P3 — 评审中新发现的小问题(不阻塞合并,可在下一次小修中处理)

### P3-1 `cache.put` 缺 `event.waitUntil` 包裹

`public/service-worker.js:30-42` 当前直接调用 `cache.put(event.request, response.clone())`,SW 提前结束时这次写缓存可能被打断,导致离线再次访问时部分资源缺失。

**修复**:

```js
event.waitUntil(cache.put(event.request, response.clone()));
```

或更稳妥地把整个 try 分支包进 `waitUntil`。

### P3-2 `notifyRetirementReachedOnce` 标志位写在通知发送之前

`src/main.js:356-362` 顺序是先 `settings.retirementReachedNotified = true; saveSettings()`,再 `LocalNotifications.schedule(...)`。如果 schedule 失败(权限撤销、系统问题),用户**永远收不到**"退休日已到"那条一次性通知。

**修复**:把通知发送放在前面,成功后再写标志位并 save。

### P3-3 `els.flexMonths.max` 的赋值挪到 `init`

`src/main.js:159` `els.flexMonths.max = String(FLEX_LIMIT_MONTHS)` 在每次 `refreshPolicyCalculation`(input/change)都重写一次。这个值是常量,放到 `init()` 一次设定即可。

### P3-4 `#policyResult` 缺无障碍属性

`index.html:92-101` 新增的政策结果卡片是两段 `<span>label</span><strong>value</strong>`,屏幕阅读器读到的是无关联的零散文本。建议:

```html
<div class="policy-result" id="policyResult" role="group" aria-label="政策计算结果" hidden>
```

并把内部两块也加上 `aria-labelledby` 关联各自的 label。

### P3-5 SW 缓存策略选择留个文档说明

当前 `public/service-worker.js` 是 network-first(在线优先,失败回缓存)。这适合"在线就拿最新"场景,但 PWA 离线打开的瞬时体验弱于 cache-first。当前选择不算错,只是不同团队偏好不同 —— 建议在 `docs/architecture-review.md` §6 加一行说明,免得未来有人把它"改对"。

---

## 不要做的事

- **不要**把出生日期 / 退休日同步到云端或第三方服务(违反当前隐私承诺,文档 §9)。
- **不要**把 `src/main.js` 拆得过碎或换框架,核心逻辑独立成纯函数即可(P1-1),DOM 编排留在主文件。
- **不要**为了"完整性"补全文档 §5 列出的"不覆盖情况"(特殊工种、缴费年限等),这些是**故意不算**的,UI 已经引导用户咨询社保经办。

---

## 建议执行顺序

```
P0-3 (lockfile)  ──┐
                   ├──> P0-2 (PWA)  ──┐
P0-1 (停止提醒) ──┘                   ├──> P1-1 (测试) ──> P1-2 (双日期 UI)
                                       │
                                       └──> P1-3 (清理)
                                       
P2-* 按发布节奏穿插
```

P0-3 优先做是因为它一旦合并,后续所有 PR 的 CI 都能复用 lockfile 与缓存。P1-1 必须在 P1-2 之前,因为修改计算返回值需要测试兜底。
