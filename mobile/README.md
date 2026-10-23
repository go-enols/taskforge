# TaskForge Mobile

两种形态，共用同一套 React + TypeScript 代码：

1. **Android App（Capacitor）** — 可安装的 APK，内嵌 Node.js 运行时，能在手机上直接下载/运行市场脚本
2. **移动端 PWA** — 浏览器访问 `https://task.likecloud.top/app/`，可添加到主屏幕（只能浏览/下载，不能执行脚本）

## Android App（能执行脚本）

### 能力

- 登录 / 注册 / 首次初始化管理员（复用 Marketplace Server 账户体系）
- **服务器地址可配置**：登录页与「我的」页均可修改 Marketplace 服务器，保存前自动 `/api/health` 校验；切换后需重新登录（Web 端默认同源，App 默认官方服务器）
- **自动更新**：App 启动时检查 `/download/latest.json`，发现新版本后在 App 内下载 APK（SHA-256 校验）并调起系统安装器覆盖安装
- 脚本市场：列表、搜索、详情、版本历史、下载 ZIP
- **安装到本机**：App 内解压脚本包，写入应用私有目录
- **本机执行脚本**：内嵌 Node.js 18（[Node.js for Mobile Apps](https://github.com/nodejs-mobile/nodejs-mobile)，
  由 [@capawesome/capacitor-nodejs](https://capawesome.io/docs/sdks/capacitor/nodejs/) 提供）
  - 按脚本 `manifest.schema` 自动生成参数表单
  - 实时日志、进度、结构化结果（SDK NDJSON 协议与桌面端一致）
  - Worker 线程隔离执行 + `sandbox-enforcer.cjs` 权限 patch（网络/文件系统按 manifest 声明放行，可强制沙箱）
  - 停止任务（Worker 终止）、删除任务及脚本文件
- 模板市场（账户模板 Schema / 项目模板字段）
- 个人中心：昵称/密码/API Key/服务状态/版本检查/退出登录

### 服务器地址

- App 默认：`https://task.likecloud.top`（可在登录页「更换服务器」或「我的 → 服务器」修改）
- PWA 默认：与页面同源（`/api`），也可在「我的 → 服务器」改成自建服务
- 支持带路径的地址（如 `https://example.com/task`）与 HTTP（不建议，正式环境请用 HTTPS）
- 切换服务器会清除当前登录态，避免 token 跨服务器混用

### 自动更新

更新清单（服务器静态文件，nginx 托管）：

```json
{
  "versionCode": 2,
  "versionName": "1.1.0",
  "url": "https://task.likecloud.top/download/TaskForge.apk",
  "size": 92826068,
  "sha256": "<apk sha256>",
  "changelog": "更新说明",
  "mandatory": false
}
```

App 启动时请求 `https://task.likecloud.top/download/latest.json`（带时间戳绕过缓存）：
`versionCode` 大于当前安装版本才提示；用户确认后原生插件后台下载 → 校验 SHA-256 →
FileProvider + `ACTION_VIEW` 调起系统安装器。Android 不允许静默安装，需在系统设置中允许本应用
「安装未知应用」一次（首次更新时会自动打开该设置页）。

发布新版本流程：

1. 修改版本号（三处保持一致）：
   - `mobile/package.json` → `version`
   - `mobile/src/version.ts` → `APP_VERSION` / `APP_VERSION_CODE`
   - `mobile/android/app/build.gradle` → `versionCode` / `versionName`
2. `cd mobile && npm run sync:android && cd android && gradlew.bat assembleDebug`
3. 计算 APK 的 SHA-256 与大小，更新 `latest.json`
4. 上传到服务器：`/home/ubuntu/taskforge/mobile/TaskForge.apk` 和 `/home/ubuntu/taskforge/mobile/latest.json`
5. 已安装用户下次启动 App 即可收到更新提示

### 构建 APK

环境要求（本机已安装可跳过）：

- JDK 21
- Android SDK：`platforms;android-36`、`build-tools;36.0.0`、`platform-tools`
- NDK `27.0.12077973`、CMake `3.22.1`
- Node.js 20+

```bash
cd mobile
npm install
npm run sync:android     # 构建 web 资源 + 注入 nodejs 运行时 + cap sync
cd android
./gradlew assembleDebug  # Windows: gradlew.bat assembleDebug
```

产物：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`（可直接侧载安装，允许「未知来源」即可）。

首次构建会下载 Gradle 8.14.3、AGP 依赖，以及 Node.js for Mobile Apps 的 Android 二进制
（约 100MB，缓存在 `~/.gradle/caches/capawesome-capacitor-nodejs/`，校验 SHA-256）。

### Node 运行时工程

`nodejs/` 目录是运行在 App 内的 Node 工程（构建时复制到 `app/nodejs/`，由 Capacitor 插件在 App 启动时安装到私有目录）：

| 文件 | 作用 |
| --- | --- |
| `main.js` | 接收 App RPC：install / run / stop / remove / list / ping |
| `task-worker.js` | Worker 线程入口，加载用户脚本并上报状态 |
| `sandbox-enforcer.cjs` | 与桌面端共用的脚本权限 patch（构建时从 `client/src/main/services/` 复制） |

执行协议（App ⇄ Node，JSON）：

- App → Node：`{id, cmd:'install', taskId, files:[{path, data(base64)}], manifest}` / `{cmd:'run', taskId, config, sandbox}` / `{cmd:'stop'|'remove'|'list'|'ping'}`
- Node → App：`rpc-result`、`task-log`、`task-status`、`task-progress`、`task-result`、`task-data`

### 手机端限制（来自 nodejs-mobile）

- Node 版本 18.20.4；`child_process` 不可用；单进程只能启动一次 Node 运行时
- 脚本依赖的 npm 包需开发者自行打进 zip（手机端不执行 `npm install`）
- Worker 模式下脚本的 `process.cwd()` 为运行时目录；请使用 `TASK_CWD_RESOLVED` / `TASK_DATA_ROOT` 环境变量定位文件
- 若设备不支持 Worker（极少见），会降级到主运行时执行，此时无法强制停止
- 脚本首次运行时系统可能提示电池优化；长时间后台运行建议在系统设置中允许后台活动

## PWA（Web）

```bash
npm run build          # 产物 app/，部署到 https://task.likecloud.top/app/
```

## 开发（Web UI 调试）

```bash
npm install
npm run dev            # http://127.0.0.1:5174/app/，/api 代理到 http://127.0.0.1:8268
```

Android 原生相关功能在浏览器中自动隐藏（`Capacitor.isNativePlatform()` 为 false）。

## 技术栈

Vite 7 + React 19 + TypeScript + Capacitor 8（Android）+ @capawesome/capacitor-nodejs + JSZip。

## APK 下载（已部署）

**https://task.likecloud.top/download/TaskForge.apk**（当前 v1.1.0，arm64-v8a，Android 7.0+）

- 包名 `top.likecloud.taskforge`，debug 签名（侧载安装需允许「未知来源」）
- 打开 App → 「任务」页顶部显示 Node.js 运行时状态（版本 / Worker / 沙箱）
- 「我的」页可查看版本、检查更新、修改服务器地址
