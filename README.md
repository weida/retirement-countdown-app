# 退休倒计时

按中国 2025 渐进式延迟退休政策，离线计算"我还有多少天"，并把这一天放在桌面上每天看一眼。

- **平台**：Android（Capacitor 打包）/ PWA（任意现代浏览器）
- **数据**：全部存本地 `localStorage`，无账号、无后端、无埋点
- **状态**：自用工具，**不上架任何应用商店**；想用就从 GitHub Releases 下 APK 装机

---

## 下载安装（Android）

1. 打开 [Releases](https://github.com/weida/retirement-countdown-app/releases) 页
2. 在最新版本下找 `retirement-countdown-vX.Y.Z.apk`，下载到手机
3. 允许"未知来源"后安装即可

> 当前是 debug-signed APK，系统可能提示"开发者构建"。升级时直接覆盖装，本地设置（出生年月 / 提醒时间等）不会丢。

如果想直接试 web 版，clone 仓库后 `npm install && npm run dev` 即可。

## 功能

- 出生日期 + 工种（男 / 原 55 女 / 原 50 女）→ 自动算出新政下的法定退休日
- 支持手动指定退休日，覆盖政策计算
- 主界面大数字滚动展示剩余天数；hero 下方每天换一句 365 字的小签
- 可选每日提醒（Web 端是浏览器通知 + service worker；Android 端走原生 channel `daily-retirement-reminder`，开机持久）
- 一键导出"分享海报"图片：日期 / 大数字 / 当日小签 / 状态文案
- 跨日 / 跨月 picker 自适应（2 月 31 → 28/29 自动夹）

## 开发

```bash
npm install
npm run dev          # http://127.0.0.1:4173
npm run build        # 输出到 dist/
npm test             # Vitest 单元测试（政策计算 + 状态文案 + 取消判定）
```

打包到 Android：

```bash
npm run cap:sync     # build + cap sync
npm run android      # 打开 Android Studio
```

CI 已经接管 Android 构建，本地一般不需要。

## 发布新版本

打 tag 自动出 Release（含可下载 APK）：

```bash
git tag v1.2.3
git push origin v1.2.3
```

会触发 `.github/workflows/release.yml`：跑测试 → 出 debug APK → 创建 GitHub Release 并附 `retirement-countdown-v1.2.3.apk`。Release notes 由 GitHub 根据 commit 自动生成。

也可以从 Actions 页用 "Run workflow" 手动触发，需要填 tag 名。

> 同时存在 `.github/workflows/android-apk.yml`：每次 push 都跑，产出 workflow artifact（仅登录后下载，用于日常烟测）。release.yml 是给"我想要一个公开可下载的版本"用的。

## 架构与边界

- 单页 vanilla JS + Capacitor 壳，**不引入** React/Vue（见 `docs/architecture-review.md`）
- 退休日期计算策略表见 `src/retirement.js` 的 `RETIREMENT_RULES`
- 不建模"特殊工种提前退休"与"养老缴费年限"——UI 已说明请咨询当地社保

## 协议

代码仅供个人参考使用。退休政策计算逻辑参考中国 2024 年公布的渐进式延迟退休方案，**仅供倒计时娱乐，请以当地社保部门口径为准**。
