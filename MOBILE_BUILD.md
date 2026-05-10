# 退休倒计时手机 App 构建说明

这个项目已按 Capacitor 封装为移动端 App。Web 源码在 `index.html`、`styles.css`、`src/main.js`，原生通知使用 `@capacitor/local-notifications`。

## Android

在有 Android Studio / Android SDK / JDK 的电脑上：

```powershell
npm install
npm run build
npx cap sync android
npx cap open android
```

打开 Android Studio 后可以运行到真机，也可以构建 APK。

## GitHub Actions 云端打包

仓库里已经加入 `.github/workflows/android-apk.yml`。把整个项目推到 GitHub 后：

1. 打开 GitHub 仓库的 `Actions` 页面。
2. 选择 `Build Android APK`。
3. 点击 `Run workflow`。
4. 构建完成后，在本次运行页面底部下载 `retirement-countdown-debug-apk`。

这个 workflow 会在 GitHub 云端安装 Node.js、JDK 和 Android SDK，生成 Android 工程并打包 `app-debug.apk`。

## iPhone

iOS 需要 macOS + Xcode：

```bash
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

## 提醒能力

在手机 App 环境里，点击“开启通知”后会申请系统通知权限，并设置每天固定时间的本地通知。Android 可以直接继续构建；iOS 需要在 Mac 上生成 iOS 工程。
