# TaskForge Mobile

两种形态，共用同一套 React + TypeScript 代码：

1. **Android App（Capacitor）** — 可安装的 APK，内嵌 Node.js 运行时，能在手机上直接下载/运行市场脚本
2. **移动端 PWA** — 浏览器访问 `https://task.likecloud.top/app/`，可添加到主屏幕（只能浏览/下载，不能执行脚本）

## Android App（能执行脚本）

### 能力

- 登录 / 注册 / 首次初始化管理员（复用 Marketplace Server 账户体系）
- 脚本市场：列表、搜索、详情、版本历史、下载 ZIP
- **安装到本机**：App 内解压脚本包，写入应用私有目录
- **本机执行脚本**：内嵌 Node.js 18（[Node.js for Mobile Apps](https://github.com/nodejs-mobile/nodejs-mobile)，
  由 [@capawesome/capacitor-nodejs](https://capawesome.io/docs/sdks/capacitor/nodejs/) 提供）
  - 按脚本 `manifest.schema` 自动生成参数表单
  - 实时日志、进度、结构化结果（SDK NDJSON 协议与桌面端一致）
  - Worker 线程隔离执行 + `sandbox-enforcer.cjs` 权限 patch（网络/文件系统按 manifest 声明放行，可强制沙箱）
  - 停止任务（Worker 终止）、删除任务及脚本文件
- 模板市场（账户模板 Schema / 项目模板字段）
- 个人中心：昵称/密码/API Key/服务状态/退出登录

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

构建产物已部署到服务器：

**https://task.likecloud.top/download/TaskForge.apk**

- 包名 `top.likecloud.taskforge`，版本 `1.0`，支持 Android 7.0+（arm64-v8a）
- 安装时允许「未知来源」；首次打开后按提示初始化管理员或登录
- 打开 App → 下方「任务」页顶部会显示 Node.js 运行时状态（版本 / Worker / 沙箱）
- 市场选中脚本 → 「安装到本机（任务页运行）」→ 任务页配置参数并运行，日志实时显示
