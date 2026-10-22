# TaskForge 优化审计报告

> **审计日期**：2026-10-22
> **基线**：`master @ 11c4471`（审计开始时工作区干净）
> **范围**：`client/`（主进程 + preload + 渲染层）、`server/`、CI/构建/测试/依赖/文档
> **方式**：4 个领域审计员并行 + Lead 跨切面复核；纯只读审计，**未修改任何源码/配置**
> **局限**：`client/node_modules` 缺失，客户端 typecheck / lint / vitest / 构建均无法执行（相关结论为静态分析）；`server/node_modules` 存在且 `npx tsc --noEmit` 通过；`client/scripts/check-i18n.cjs` 通过（95 文件 / 1095 个 `t()` / 999 keys）。包体与性能数字为量级估计，已在各条目标注。

---

## 0. 一页结论

### 0.1 健康度评分

| 维度 | 评分 | 判断依据 |
|---|---|---|
| 安全 | **3 / 10** | 四层沙箱权限模型在生产环境实际不生效（P0-1/2/3）；服务端审核门可被作者自批（P0-5）；渲染层→主进程提权面过大（P0-6）。文档承诺远高于运行时实现。 |
| 正确性 | **4 / 10** | 全新安装因 `settings` 表缺失直接启动崩溃（P0-4）；任务删除无确认且日志成孤儿（P0-7）；文件/DB 双写无事务、异步路由未捕获 rejection、macOS 调度器停摆等。 |
| 性能 | **5 / 10** | 服务端列表无分页 + N+1；渲染层大量"全量拉取再客户端过滤"、任务页 3s 轮询 + 日志无虚拟化、首屏被 three.js 阻塞；但数据量级为本地/单机，痛点集中于体验而非吞吐。 |
| 工程化 | **3 / 10** | 325 个单元测试从未在 CI 执行，且测试套件当前根本跑不起来（import 已删除文件/错误相对路径）；无构建门禁；release 打包了未构建、无人使用的 server（+115 MB）。 |
| 可维护性 | **5 / 10** | 分层与注释质量高于平均水平；但抽象"写好了没人用"（814 行 React Query hooks 零引用）、三份 manifest schema 并存、`StoreService` facade 与 repo 双入口、三套重复 UI 实现、文档与实现大面积漂移。 |

### 0.2 三条核心结论

1. **"脚本分发 + 沙箱执行平台"的安全叙事目前不成立。** `sandbox-enforcer.cjs` 没有进入构建产物且缺失时 fail-open；脚本安装阶段在沙箱外执行 `npm install`（任意 postinstall）；`manifest.entryPoint` 可越出脚本目录、非 JS 入口会被直接 `spawn` 为可执行文件；任务配置可经 `TASK_PERM_BYPASS` 自行关闭拦截。当前应把已安装脚本视同**完全可信代码**（等价于用户主动运行下载的 exe）。
2. **两个 P0 级回归/门禁问题说明验证体系失效。** 全新安装会在 `StoreService` 构造时因 `settings` 表不存在而崩溃，却能通过 PR 检查——因为 CI 从不运行测试；测试套件本身已有 6 处坏引用（3 处 import 已删除的 `wallet.ts`、3 处相对路径多一层），且 `tests/` 不在 typecheck 范围内。**先修 CI/测试门禁，其余修复才有防回归保障。**
3. **大量工作停留在"写好了但没接上"。** 814 行 React Query 查询层全仓零引用、`ConfirmDialog`/`LogViewer`/`Pagination`/`SearchInput` 现成组件被各页面绕过、`cleanOrphanTasks()` 实现被注释、`shared/schemas/manifest.ts` 三份拷贝（根目录版本无人 import）。这类问题的修复成本低、收益高。

### 0.3 P0 清单（8 项，建议全部在下一个里程碑前完成）

| ID | 严重度 | 标题 | 主要位置 | 工作量 |
|---|---|---|---|---|
| P0-1 | 阻断 | 沙箱 Layer 4 未进入构建产物且缺失时 fail-open | `client/src/main/services/task.ts:299-306`、`client/electron.vite.config.ts` | S |
| P0-2 | 阻断 | 脚本执行链可执行任意程序（`npm install` postinstall + entryPoint 越界/非 JS spawn） | `task.ts:52-85,158-179,266-282`、`script-fetcher.ts:151-166` | S-M |
| P0-3 | 阻断 | 任务配置可注入沙箱内部开关 `TASK_PERM_BYPASS` / `TASK_CWD_RESOLVED` | `task.ts:194-239`、`sandbox-enforcer.cjs:54-72` | S |
| P0-4 | 阻断 | 全新安装启动即崩：`settings` 表创建在重构中丢失 | `client/src/main/services/store.ts:228-394`、`repositories/settings.ts:36` | S |
| P0-5 | 阻断 | 市场审核可被脚本作者自批 `approved` + `visible` 绕过 | `server/src/routes/scripts.ts:228,264-266,447-452`；`templates.ts:223-227` | S |
| P0-6 | 阻断 | 渲染层→主进程提权面过大（preload 无 allowlist、特权 handler 任意路径/URL） | `client/src/preload/index.ts:27-29`、`ipc/registry.ts:120-128`、`system-handlers.ts:125-144` | M |
| P0-7 | 阻断 | 任务页单条/批量删除无任何确认，且 `task_logs` 成永久孤儿 | `client/src/renderer/src/pages/Tasks.tsx:882-893,953-959` | S |
| P0-8 | 阻断 | CI 从不运行测试，且测试套件已损坏（6 处坏引用、tests 不参与 typecheck） | `.github/workflows/pr-check.yml`、`client/tests/**` | S-M |

> **最小止血包（约 0.5-1 人日）**：P0-4 补建表 SQL → P0-1 enforcer 打包 + fail-closed → P0-3 env 黑名单 → P0-2 entryPoint 包含性校验 + `npm install --ignore-scripts` → P0-7 删除确认 → P0-8 CI 加 `npm test` 并修坏引用。这 6 项做完，客户端才可以谈"安全"和"可验证"。

---

## 1. 审计方法与证据等级

- **领域切分**：`server/`（服务端安全/API/数据层）、`client/src/main`（Electron 安全/任务引擎/数据层）、`client/src/renderer`（React 性能/状态/复用）、工程化（CI/构建/测试/依赖/文档），由 4 名审计员并行完成；Lead 负责跨切面（双传输层、preload↔IPC、共享类型、schema 漂移、生命周期）并复核 P0 结论。
- **证据等级**：
  - ✅ 已复核：Lead 亲自读代码/跑只读命令确认；
  - 📋 报告结论：领域审计员给出 `file:line` + 代码片段，Lead 抽查一致（未逐条复跑）；
  - ⚠️ 推测：需运行时/打包验证（报告内已标注）。
- **只读验证命令**：`git log/ls-files`、`npx tsc --noEmit`（server）、`node scripts/check-i18n.cjs`、grep 统计、`git show a2a203d^:client/src/main/services/store.ts` 对比历史 schema。
- **未发现的问题（避免下游误判方向）**：
  - 服务端 **SQL 注入**：全量使用 prepared statements，未发现字符串拼接 SQL；
  - 服务端 **zip-slip**：manifest 校验在内存解压，不落盘；`adm-zip@0.5.17` 的 `Utils.sanitize` 已有前缀包含校验；
  - 渲染层 **XSS**：全仓 `dangerouslySetInnerHTML` 0 命中；Markdown 走 `react-markdown + remark-gfm + rehype-sanitize` 默认 schema，链路安全；
  - **i18n 缺失 key**：`check-i18n` 全绿；问题是 15+ 处 UI 文案绕过 `t()`；
  - 密码/密钥/上传内容**未写日志**；`any` 仅 11 处，类型纪律良好。

---

## 2. P0 — 阻断级问题（8 项）

### P0-1 沙箱 Layer 4 未进入构建产物，且缺失时 fail-open ✅

**类别**：安全 / 沙箱根基　**来源**：main M1

**位置**
- `client/src/main/services/task.ts:299-306`（运行时按 `__dirname` 找 enforcer，找不到仅 warn）
- `client/electron.vite.config.ts:1-24`（只有 alias，无任何资源拷贝配置）
- `client/electron-builder.yml:5-11`（`files` 排除 `src/*`）
- `client/tests/main/sandbox-enforcer.test.ts:18`（测试直接引用 `src/main/services/sandbox-enforcer.cjs`）

**代码**
```ts
// task.ts:299-306
const enforcerPath = resolvePath(__dirname, 'sandbox-enforcer.cjs')
if (existsSync(enforcerPath)) {
  env.NODE_OPTIONS = `--require ${enforcerPath}${existingOpts ? ' ' + existingOpts : ''}`
} else {
  createLogger('task').warn('Sandbox enforcer not found at ' + enforcerPath)
}
```

**证据链**
1. 主进程由 electron-vite 打包为 `out/main/index.js`，`sandbox-enforcer.cjs` 只以**运行时字符串路径**引用，没有 `import`/`?asset`/copy 插件 → 不会出现在 `out/main/`；
2. 打包配置排除 `src/*`，即使进了 asar，`__dirname`（`app.asar/out/main`）也对不上；
3. 单元测试用 `src/` 路径加载 enforcer，所以测试全绿不代表运行时生效；
4. 缺失时只打 warn 继续 spawn（**fail-open**），用户无感知。

**影响**：Layer 1（manifest 权限）/ Layer 2（`is_sandbox`）/ Layer 4（monkey-patch）全部只存在于注释和环境变量里。脚本可自由使用 `http/net/fs/child_process`，**"沙箱模式"复选框不产生任何强制力**。这是产品安全叙事的根基性缺陷。

**修复建议（任一 + fail-closed）**
```ts
// 方案 A（推荐）：把 enforcer 变成真正的构建资产
// 例：放在 client/resources/ 下，通过 ?asset 引入，main 构建会拷贝到 out/main
import enforcerPath from '../../resources/sandbox-enforcer.cjs?asset'
// 方案 B：electron-builder extraResources 拷贝，运行时用 process.resourcesPath 定位

const enforcer = existsSync(enforcerPath) ? enforcerPath : null
if (!enforcer) throw new Error('Sandbox enforcer missing — refusing to start script')
```
并在 CI 增加断言：打包产物中存在 `out/main/**/sandbox-enforcer.cjs`；e2e 从 `out/` 加载而非 `src/`。

**验收**：`npm run build:unpack` 后在 `out/main` 找到 enforcer；`is_sandbox=true` 的 fixture 脚本执行 `require('http').get(...)` 必须抛 `ERR_PERMISSION_DENIED`。**工作量** S。

---

### P0-2 脚本执行链可执行任意程序（安装期 + 启动期双重绕过）✅

**类别**：安全 / 供应链 + 任务执行　**来源**：main M2 + M4（合并）

**位置**
- `client/src/main/services/task.ts:75-80`（`installDependencies` → `execAsync('npm install --omit=dev ...')`）
- `client/src/main/services/task.ts:179`（`startTask` 在权限计算**之前** `await installDependencies`）
- `client/src/main/services/script-fetcher.ts:151-166`（远端 `manifest.entryPoint` 原样写入 `meta.json`）
- `client/src/main/services/task.ts:158-163`（`join(resolvedPath, meta.entryPoint)`，无包含性校验）
- `client/src/main/services/task.ts:266-282`（非 `.js/.mjs/.cjs/.ts` 时 `command = entryPoint`，`args` 来自 `task.config.args`）

**代码**
```ts
// script-fetcher.ts:156 —— 安装时原样落盘
entryPoint: (manifest.entryPoint as string) || 'index.js',
// task.ts:161-163 —— 启动时 join，无包含性校验
entryPoint = meta.entryPoint ? join(resolvedPath, meta.entryPoint) : join(resolvedPath, 'index.js')
// task.ts:269-282 —— 非 JS 入口直接作为可执行文件
const isNodeFile = entryPoint.endsWith('.js') || ...
if (isNodeFile) { command = 'node'; args.push(entryPoint) }
else if (entryPoint.endsWith('.ts')) { command = 'npx'; args.push('tsx', entryPoint) }
if (task.config.args && Array.isArray(task.config.args)) args.push(...task.config.args)
```

**影响**
1. **安装期**：任务启动前在沙箱外执行 `npm install`，任意依赖的 `preinstall/postinstall` 即任意代码执行，早于并绕过全部四层权限；`--ignore-scripts` 未传；
2. **启动期**：脚本 zip 里放一个 `payload.exe`，manifest 写 `"entryPoint": "payload.exe"` 即可被 `spawn` 直接执行，`NODE_OPTIONS=--require` 的 enforcer 完全不适用；`"../../../../Windows/System32/..."` 还能逃出脚本目录；
3. **与 P0-5 串联**：任何 `developer` 账号可自批审核（P0-5）→ 发布上述 zip → 安装者机器被 RCE。

**修复建议**
```ts
// task.ts —— 入口白名单 + 包含性校验
import { resolve, sep, extname } from 'path'
const scriptRoot = resolve(resolvedPath)
const rawEntry = (meta.entryPoint as string) || 'index.js'
const entry = resolve(scriptRoot, rawEntry)
if (!entry.startsWith(scriptRoot + sep)) throw new Error('entryPoint escapes script directory')
if (!['.js', '.cjs', '.mjs'].includes(extname(entry))) throw new Error('entryPoint must be node script')
// 只允许 node 运行时，禁止把 config.args 传给非 node 解释器
```
```ts
// installDependencies —— 依赖安装不应隐式执行生命周期脚本
await execAsync('npm install --omit=dev --ignore-scripts --no-audit --no-fund', { cwd, timeout: 180000 })
// 或：仅在用户明确确认"安装依赖"时执行，并在 UI 提示风险
```
安装侧同时用 zod schema 校验 manifest（见 P1-16），`entryPoint` 增加 `^[A-Za-z0-9._-]+$` 限制。**工作量** S-M。

---

### P0-3 任务配置可注入沙箱内部开关，白名单可被脚本作者自行解除 ✅

**类别**：安全 / 权限旁路　**来源**：main M3

**位置**
- `client/src/main/services/task.ts:194-211`（`SYSTEM_PROTECTED_KEYS` 与实际 envKey 永不匹配，是死代码）
- `client/src/main/services/task.ts:217-224`（config 的每个键无过滤映射为 `TASK_<KEY>`）
- `client/src/main/services/sandbox-enforcer.cjs:54-72`（`TASK_PERM_BYPASS` 直接 return；`TASK_CWD_RESOLVED` 加入 fs 白名单）
- `client/src/shared/schemas/task-params.ts:91` + `client/src/renderer/src/pages/Tasks.tsx:329-333,467-489`（manifest schema 的 `default` 会自动进入 `task.config`）

**利用链（已确认）**
1. 脚本 manifest 的 schema 声明 `"perm_bypass": {"type":"string","default":"1"}`；
2. 创建任务时表单默认值自动成为 `task.config.perm_bypass`；
3. `task.ts:221-223` 生成 `env.TASK_PERM_BYPASS = '1'`；
4. `sandbox-enforcer.cjs:58-61` 检测到后**跳过全部 patch**，即使 `is_sandbox=true`。
   同理 `cwd_resolved=C:\` → fs 白名单扩大为全盘。

**补充发现**：主进程从未设置 `TASK_CWD_RESOLVED`（`sandbox-enforcer.cjs:65-72` 的 `cwd` 白名单条目永远为空），导致即使 manifest 声明 `filesystem` 权限，脚本也**读不到自己的脚本目录**——权限语义现在是"要么全开（bypass）、要么只能写 TEMP"。

**修复建议**
```ts
// 1) 显式拒绝内部保留键；2) 内部变量在 config 之后覆盖（或直接不通过 env 传递）
const RESERVED = new Set([
  'PERM_BYPASS', 'CWD_RESOLVED', 'SANDBOX', 'PERM_NETWORK', 'PERM_FILESYSTEM', 'ID', 'CONFIG', 'ARGS'
])
for (const [key, value] of Object.entries(task.config)) {
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(key)) continue
  const upper = key.toUpperCase()
  if (RESERVED.has(upper) || SYSTEM_PROTECTED_KEYS.has(upper)) continue
  env[`TASK_${upper}`] = typeof value === 'object' ? JSON.stringify(value) : String(value)
}
// 3) 主进程自己计算 cwd 白名单，不读取 env
env.TASK_CWD_RESOLVED = resolvedPath
// 4) sandbox-enforcer 删除 TASK_PERM_BYPASS 分支（内部脚本改用独立白名单机制）
```
同时把 `SYSTEM_PROTECTED_KEYS` 改为对原始 `key` 判断（或删除该死代码）。**工作量** S。

---

### P0-4 全新安装启动即崩：`settings` 表创建在重构中丢失 ✅

**类别**：数据层回归　**来源**：tooling F2

**证据**
- `git show a2a203d^:client/src/main/services/store.ts` 中存在 `CREATE TABLE IF NOT EXISTS settings (...)`；
- 当前 `client/src/main/services/store.ts:228-394` 的 `initialize()` 只创建 13 张表，**没有 settings**；
- `store.ts:155` 构造函数中 `new SettingsRepository(this.db)`，其 `prepareStatements()`（`repositories/settings.ts:36-49`）立即 `db.prepare('SELECT value FROM settings ...')`；
- better-sqlite3 在 `prepare()` 时就抛 `no such table: settings` → `StoreService` 构造失败 → `main/index.ts:108-167` 的 `.catch` 弹错误框并退出。

**影响**：**任何没有历史 DB 的新用户第一次启动即失败**（旧开发机因历史库已有该表而不暴露）；同时 `settings` 承载主题、marketplace 地址/JWT、代理提供商配置等，功能全断。这是被"CI 不跑测试 + tests 不在 typecheck 范围"掩盖的典型回归（见 P0-8）。

**修复**
```sql
-- store.ts initialize() 的建表 SQL 中补回
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
**验收**：新增单测——`new StoreService(tempDbPath)` 后执行 `getSetting/setSetting` 往返；CI 必须运行该测试（P0-8）。**工作量** S。

---

### P0-5 市场审核可被脚本/模板作者自批绕过 ✅

**类别**：安全 / 供应链门禁　**来源**：server F-01

**位置**
- `server/src/routes/scripts.ts:228`（PUT body 解构出 `visible, reviewStatus, reviewComment`）
- `server/src/routes/scripts.ts:264-266`（无条件写回）
- `server/src/routes/scripts.ts:447-452`（PATCH 无条件写 `visible`）
- `server/src/routes/templates.ts:223-227`（PATCH 无条件写 `visible`）

**代码**
```ts
// scripts.ts:228
const { name, version, description, entryPoint, tags, changelog, visible, reviewStatus, reviewComment } = req.body;
// scripts.ts:264-266
visible !== undefined ? (visible ? 1 : 0) : existing.visible,
reviewStatus !== undefined ? reviewStatus : existing.review_status,
reviewComment !== undefined ? reviewComment : existing.review_comment || "",
```

**影响**：上传时 developer 的产物被正确置为 `visible=0 / pending`（`scripts.ts:185-187`），但作者本人随后 `PUT {"reviewStatus":"approved","visible":true}` 即可上架，供所有客户端下载执行。结合 P0-2，等于**任何 developer 账号都能向全量用户分发任意可执行文件**。审核状态还缺枚举校验，可写入任意字符串污染状态机。

**修复**
1. 从 `PUT/PATCH` 的 body 白名单中移除 `visible/reviewStatus/reviewComment`，审核字段只能经 `POST /:id/review`（已有 `requireRole("admin")`，`scripts.ts:399-429` / `templates.ts:292-313`）变更；
2. `reviewStatus` 用 `z.enum(["pending","approved","rejected"])` 校验；
3. 增加回归测试：developer 调用 PUT 带 `reviewStatus` 后库中状态不变。**工作量** S。

---

### P0-6 渲染层→主进程提权面过大 ✅

**类别**：安全 / 权限边界　**来源**：main M5 + Lead L2

**位置**
- `client/src/preload/index.ts:27-29`：`invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)` —— **无 channel allowlist**
- `client/src/main/ipc/registry.ts:120-128`：`register()` 忽略 `IpcMainInvokeEvent`，**不校验 sender frame**
- 特权 handler：
  - `client/src/main/ipc/handlers/system-handlers.ts:125-144`：`fs:readFile` / `fs:writeFile` **任意路径**
  - `system-handlers.ts:219-268`：`server:upload` 读取**任意本地 zip 路径**并 POST 到**任意 URL**
  - `system-handlers.ts:304-316`：`shell:openPath` 任意路径
  - `client/src/main/services/script-fetcher.ts:298-321`：`script:remove` 的 `rmSync(recursive)` 路径未收敛到 scriptsDir
  - `client/src/main/ipc/handlers/task-handlers.ts:20-28` + `task.ts:141-149`：`task:create` 接受任意 `scriptFolder`
  - `wallet:list`（`repositories/wallet.ts:64-69`）返回**解密后的明文私钥/助记词**
- 主进程无 `will-navigate` 防护（见 P1-8）：主窗口一旦被导航到远端页面，preload 会重新注入，远端页面直接获得以上全部能力。

**影响**：一条渲染层 XSS（当前未发现，但任何第三方 Markdown/未来页面都可能引入）即等价于全盘 RCE/删除/外传。即使不考虑 XSS，渲染层 = 本地用户的完整权限，缺少最小权限边界。

**修复（三层，按成本排序）**
1. **preload allowlist**：维护一份 `ALLOWED_CHANNELS`（可与 `handlerMap` 注册表同源生成），`invoke` 对未知 channel 直接 reject；`on` 同理；
2. **sender 校验**：`register()` 中使用 `event.senderFrame.url` 校验只允许 `file://.../index.html` 或 dev server origin；
3. **特权 handler 收口**：`fs:readFile/writeFile` 改为只允许用户通过原生对话框选择的路径；`server:upload` 只允许 scriptsDir 下的包 + 校验目标 URL 协议；`script:remove` 用 `resolve()+startsWith(scriptsDir+sep)`；`wallet:list` 默认脱敏，私钥仅在"导出/签名"动作时单独通道返回并要求用户确认。

**工作量** M。

---

### P0-7 任务删除无确认，日志成永久孤儿 ✅

**类别**：数据丢失 / 交互　**来源**：renderer R1

**位置**
- `client/src/renderer/src/pages/Tasks.tsx:882-893`（单条删除按钮直接 `handleAction('delete', task.id)`）
- `client/src/renderer/src/pages/Tasks.tsx:731-746,953-959`（批量删除同样无确认）
- `client/src/main/services/repositories/task.ts:298-301`（只 `DELETE FROM tasks`）
- `client/src/main/services/store.ts:276-282`（`task_logs` 未声明外键/级联）

**证据**：全仓 `<ConfirmDialog` 使用：`Tasks.tsx` **0 处**，其余 7 个列表页共 13 处（Proxies/Airdrops/Captcha/ScriptParams/Scheduler/Settings/AdminCenter）。任务行有 1 个复选框 + 3-4 个相邻图标按钮，误点概率高。

**影响**：一键永久删除任务及其 `config`（含 `_data_*` 选中的钱包/代理/账号参数引用），无撤销/回收站；`task_logs` 无外键，删除后历史日志永久残留且不可再查询，持续占用 DB。

**修复**：复用现成 `components/common/ConfirmDialog.tsx` 与 `Proxies.tsx:609-636` 的 `deleteId` 模式；批量删除显示选中数量；主进程在事务内 `DELETE FROM task_logs WHERE task_id=?` 再删任务（或建表加 `REFERENCES tasks(id) ON DELETE CASCADE`，需迁移）。**工作量** S。

---

### P0-8 CI 从不运行测试，且测试套件已损坏 ✅

**类别**：工程化 / 质量门禁　**来源**：tooling F1 + F2

**证据**
- `.github/workflows/pr-check.yml:29-38` 与 `release.yml:47-57` 只有 `typecheck / lint / i18n:check`，**全文无 `npm test`**；325 个 `it` 从未执行；
- 套件已坏（import 指向不存在的文件/多余路径层级）：
  - `client/tests/main/services/wallet.test.ts:12`、`tests/main/httpapi/server.test.ts:13`、`tests/main/ipc/handler.test.ts:11` → import 的 `src/main/services/wallet.ts` 已在 `9ddeab1` 删除；
  - `tests/renderer/components/common/LogViewer.test.tsx:14`、`tests/renderer/airdrops/AirdropFormModal.test.tsx:13`、`tests/renderer/airdrops/AirdropFormSections/ClassificationSection.test.tsx:14` → `src/shared/types` 的相对路径多一层 `../`；
- `client/tsconfig.node.json:3` / `tsconfig.web.json:3-9` 均不包含 `tests/` → 坏 import 不会被 typecheck 发现；
- `package.json:24` 的 `test:coverage` 依赖 `@vitest/coverage-v8`，该包未声明，脚本必失败。

**影响**：P0-4 这类"启动即崩"的回归可以无阻力合入；报告中的 6 处坏引用说明套件已长期未运行。

**修复**
1. `pr-check.yml` 增加：`working-directory: ./client; run: npm test`（先 `npm run rebuild:node`），并加 `npm run build` 或至少 `electron-vite build` 作为构建门禁；
2. 修复 6 处坏引用（3 处改为引用仓库层/删除用例，3 处去掉一级 `../`）；
3. 新增 `tsconfig.test.json` 并把 `tests/` 纳入 typecheck；
4. 声明 `@vitest/coverage-v8`，给 `vitest.config.ts` 设覆盖率阈值（先低阈值，逐步提升）；
5. server 增加 `test` 脚本（当前 0 测试，见 P1-21）。**工作量** S-M。

---

## 3. P1 — 高优先级（31 项）

### 3.1 安全与授权

| ID | 问题 | 位置 | 建议 | 工作量 |
|---|---|---|---|---|
| P1-1 | **服务端 async 路由未捕获 rejection**：Express 4 不转发 async handler 的 rejection；并发同名注册第二次 `userInsert` 抛 UNIQUE → 未捕获拒绝（Node 默认终止进程）；setup 的 `count===0` 存在 TOCTOU；全局无 `unhandledRejection` 兜底 | `server/src/routes/auth.ts:25,79,102-126,151-198`；`server/src/index.ts:89-92` | 包装 `asyncHandler(fn)=>(req,res,next)=>Promise.resolve(fn(...)).catch(next)`；insert 改 `INSERT OR IGNORE` 或捕获 UNIQUE 返回 409；setup 用事务 | S |
| P1-2 | **上传文件名路径穿越**：`manifest.name` 直接拼进 `${Date.now()}-${name}.zip`，`../` 可写出 uploads 目录；且 `Date.now()` 无 uuid，并发同名上传互相覆盖 | `server/src/routes/scripts.ts:176-178`（另 `:242,:372`）；`server/src/shared/schemas/manifest.ts:72` | 文件名改用 `uuidv4()`，`name` 只做展示；manifest zod 对 `name` 加 `^[\w\u4e00-\u9fa5 .-]{1,80}$` | S |
| P1-3 | **模板 schema 持久化 500**：`templates.schema` 原样入库，`rowToTemplate` 裸 `JSON.parse`；一条 `schema:"oops"` 即可让公开的 `GET /api/templates` 永久 500 | `server/src/routes/templates.ts:124-125,35` | 入库前 zod 校验 JSON Schema；读取时 try/catch 降级 `{}` 并标记损坏 | S |
| P1-4 | **manifest 解压无大小上限**：zip 中央目录可声明超大解压尺寸，`adm-zip` 直接 `Buffer.alloc` → 50MB 上传可打 OOM | `server/src/routes/scripts.ts:38-44` | 校验 `entry.header.size` 总和上限（如 20MB）与单条目上限；multer `limits.fileSize` 同步收紧 | S |
| P1-5 | **文件/DB 双写无事务**：reupload 先删旧包再写新包，写失败即永久丢失已发布版本；上传 `scriptInsert`+`versionInsert` 可部分写 | `server/src/routes/scripts.ts:190-205,340-342,368-378` | 先写新文件→DB 事务→成功后删旧文件；`versionInsert` 与 `scriptInsert` 同事务 | S-M |
| P1-6 | **安全治理组合**：JWT 不可吊销、不查库校验用户存在；永久 legacy admin key；`.env` 明文；密码策略 4/6 位；bcrypt cost 8 与 10 不一致；CORS `*` 全开；限流挂在 auth 之后（401 不计数） | `server/src/middleware/auth.ts:26-36,52-60`；`utils/keys.ts:30-33`；`auth.ts:92,113,174,185`；`users.ts:98,179-184`；`index.ts:33,82-85` | JWT 校验时查库（或维护 token 版本号）；删除 legacy admin key 逻辑；`.env.example` + 启动强校验 secret；密码 ≥8 位统一 cost 12；CORS 限定来源；`apiLimiter` 前置于 `authMiddleware` | M |
| P1-7 | **`project-templates` POST 缺角色校验**：普通 `user` 可创建市场条目 | `server/src/routes/project-templates.ts:146` | 补 `requireRole("admin","developer")` | S |
| P1-8 | **Electron 窗口硬化缺失**：`sandbox:false`、无 `will-navigate`/`will-redirect`/`setPermissionRequestHandler`、`shell.openExternal(details.url)` 未校验 scheme、CSP 仅 meta 且 `connect-src http://localhost:*` 过宽 | `client/src/main/index.ts:62-73`；`client/src/renderer/index.html:7-10` | `sandbox:true`（preload 只用 electron/os 可满足）；`will-navigate` 拦截非 app origin；`openExternal` 仅放行 `http/https`；`session.webRequest.onHeadersReceived` 注入 CSP，补 `object-src 'none'; base-uri 'none'; frame-ancestors 'none'` | S |
| P1-9 | **明文私钥/助记词进入渲染进程 + 全量拉取**：`wallet:list` 经 `rowToWallet` 解密后整表返回（页面只用 address/type），`Tasks.tsx:399-410` 以 `pageSize=99999` 拉全量 | `client/src/main/services/repositories/wallet.ts:64-69`；`client/src/main/ipc/handlers/wallet-handlers.ts:9-15`；`client/src/renderer/src/pages/Tasks.tsx:399-410` | 列表接口默认剔除 `privateKey/mnemonic`（新类型 `WalletSummary`）；只在签名/导出动作时经独立通道取密钥并要求确认；列表改真分页 | S |
| P1-10 | **`TASK_CONFIG` 恒量携带敏感数据**：`TASK_CONFIG=JSON.stringify(task.config)` 把 `_data_*`（代理密码、账号参数）暴露给**沙箱内**脚本 | `client/src/main/services/task.ts:236,241-263`；`client/src/renderer/src/pages/Tasks.tsx:536-558` | 沙箱模式（`is_sandbox=true`）剥离 `_data_*`；非沙箱也只在脚本 manifest 声明 needsData 时注入 | S |
| P1-11 | **enforcer 自身可绕过**（即使 P0-1 修好）：fs 仅 patch 部分 API（漏 `openSync/readSync/writeSync/open/FileHandle`）、路径校验为纯词法（symlink 逃逸）、网络未覆盖 http2/`new http.ClientRequest`/`new net.Socket`/`dns.promises`/WebSocket | `client/src/main/services/sandbox-enforcer.cjs:74-98,116-185,221-265` | 用 `process.binding` 级别不可行时，至少 patch `fs.promises.open`/`FileHandle` 全部方法；路径校验用 `realpathSync` 后再比较；网络面覆盖 `http2`/`dns.promises`/WebSocket；补对应绕过测试 | M |

### 3.2 正确性与可靠性

| ID | 问题 | 位置 | 建议 | 工作量 |
|---|---|---|---|---|
| P1-12 | **任务引擎资源管理**：stdout 无界累积、SDK 解析器单行无界（OOM）；停止只杀直接子进程（`npm run`/`tsx` 孙进程残留）；先 `delete` map 导致 exit 回调早退；`cleanOrphanTasks()` 整行被注释 → 崩溃后任务永久 running | `task.ts:332-350,391-413,482`；`sdk-protocol.ts:82-90`；`main/index.ts:127` | stdout 保留最后 N KB 环形缓冲；单行长度上限；Windows 用 `taskkill /T /F`、POSIX 杀进程组；退出清理放到事件回调末尾；恢复启动时孤儿任务清理（执行 `cleanOrphanTasks`） | M |
| P1-13 | **运行时不内置 Node**：任务用系统 `node`/`npx`，未使用 Electron 自带 Node（`ELECTRON_RUN_AS_NODE`），无 Node 的机器所有任务 ENOENT；子进程 env 从空对象重建，缺 `SYSTEMROOT`/`ComSpec`/`WINDIR` 等 Windows 关键变量 | `task.ts:266-278,214-232` | 用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1`；env 保留系统关键变量后再覆盖；`.ts` 入口的 `npx tsx` 移除或改为可选 | M |
| P1-14 | **生命周期两处缺陷**：macOS `window-all-closed` 停调度器后 `activate` 不重启（cron 永久停摆）；无单实例锁（多开 → 重复执行定时任务/SQLite 写竞争/双 updater） | `client/src/main/index.ts:160-178`；`scheduler.ts:112-117` | `activate` 中 `schedulerService.start()`（已有幂等 guard）；`app.requestSingleInstanceLock()` + `second-instance` 聚焦已有窗口 | S |
| P1-15 | **传输层把业务错误当传输故障**：`callIPC` 收到 `{error}` 抛错后 `call()` 仍降级 HTTP；`tryHttpPort` 把所有错误（含 400/500 响应）吞成 null，于是每次校验失败都额外串行探测最多 12 个端口，并打 `console.error('Both failed')`；CORS 白名单为 `startsWith('http://localhost')`（可放行 `localhost.evil.com`），`file://`（打包后 Origin 为 `null`）可能被 CORS 阻断 | `client/src/renderer/src/transport.ts:91-106,152-228`；`client/src/main/httpapi/server.ts:69-76` | 给错误加 `isTransportError` 标记，业务错误不降级；CORS 用精确 origin 集合 + 显式处理 `null`；探测结果缓存 | S-M |
| P1-16 | **三份 manifest schema 且客户端不校验**：根 `shared/schemas/manifest.ts`（自称 canonical，无人 import）、`server/src/shared/schemas/manifest.ts`（server 实际使用）、`client/src/shared/schemas/manifest.ts`（死代码）三份 hash 各不相同；`script-fetcher` 只用 JSON5 解析后 `as string` 强转 | `shared/schemas/manifest.ts`；`server/src/routes/scripts.ts:20`；`client/src/main/services/script-fetcher.ts:151-166,339-355` | 根 `shared/` 作为唯一源，client/server 通过 tsconfig paths 引用（client 需调整 `rootDir`/`include`）或用构建同步 + CI 一致性断言；client 安装时用同一 zod schema 校验并 fail-closed | M |
| P1-17 | **`shared/types` 重复定义**：`AppInfo/BackupInfo/UpdateInfo/ApiError/ApiResult` 整段定义两次（`605-700` 与 `666-700` 重叠），两版 `AppInfo` 字段不同（`totalLogs` vs `runningTaskCount`），interface 合并后类型与实际对象不符 | `client/src/shared/types/index.ts:605-700` | 删除 666-700 重复块，保留带 JSDoc 版本并补齐字段 | S |
| P1-18 | **错误状态伪装成空状态**：`Proxies/Logs/Captcha` 等页面 catch 后只 `console.error`，渲染"暂无数据"且无重试；`usePaginatedList` 有 `error` 字段但无页面消费；`ErrorBoundary` 仅根级一个，任一页面异常整 App 白屏且只能整页 reload（文案还是英文） | `Proxies.tsx:82-92,399-402`；`Logs.tsx:59-76`；`Captcha.tsx:61-71`；`hooks/usePaginatedList.ts:10,56`；`App.tsx:104`；`components/ErrorBoundary.tsx:57-65` | 统一 `ListState` 组件（loading/empty/error+retry）；路由级 `ErrorBoundary`（`react-router` `errorElement` 或每页包裹）；文案 i18n | S-M |
| P1-19 | **调度器语义**：`tick` 每 10s 全量扫描 + 55s 去重窗口导致 `* * * * *` 级别 cron 精度丢失；`fire` 强制 `isSandbox=false`；`nextCronTime` 每次全量计算 | `scheduler.ts:129-152,163-204` | 按 `next_run` 排序取到期任务（需 `next_run` 索引）；定时任务默认沿用模板的沙箱策略；拆出纯函数 `matchesCron/nextCronTime` 便于测试 | M |

### 3.3 性能

| ID | 问题 | 位置 | 建议 | 工作量 |
|---|---|---|---|---|
| P1-20 | **渲染层请求波 + 轮询 + 无虚拟化**：`Data.tsx` 4 个 tab 全量挂载（打开一个 tab 即 ≥5 请求）；`DeveloperCenter` 6 tab 全挂载 + 无条件 fetch；Settings 10 区块同时 mount（8 个 fetch）；`Airdrops` mount 时 analytics 请求两次；`Tasks` 每 3s 每运行中任务一次 IPC，每个日志 chunk 全页重渲染，1374 行组件无 memo 行、500 行日志无虚拟化、每 chunk 还 `scrollIntoView({behavior:'smooth'})` | `Data.tsx:119-142`；`DeveloperCenter.tsx:487-490,725`；`Airdrops.tsx:131-138`；`Tasks.tsx:123-145,235-239,993-1134` | tab 惰性挂载（首次激活才 mount）；`usePaginatedList` 统一；日志用 `requestAnimationFrame` 批量合并 + 虚拟列表（或 `content-visibility`）；任务进度合并为单次批量查询；`scrollIntoView` 改 `behavior:'auto'` 并节流 | M |
| P1-21 | **"全量拉取再客户端过滤"成模式**：`Dashboard` 落地页 `taskApi.list(1,9999)`、`Tasks` `walletApi.list(1,99999)`、`ScriptDetail` 为看 1 个脚本拉全量脚本+已装脚本+200 任务；已装脚本列表被 5 个页面各自独立拉取 | `Dashboard.tsx:233,274`；`Tasks.tsx:399-410`；`ScriptDetail.tsx:198-217`；`Tasks.tsx:160`/`Airdrops.tsx:86`/`Templates.tsx:67`/`ScriptDetail.tsx:200`/`Dashboard.tsx:275` | 复用 React Query（P1-22）共享缓存 + 真分页 + 按需字段；`Dashboard` 用专用聚合接口 `app:getStats` | M |
| P1-22 | **React Query 层 814 行全仓零引用**：`hooks/queries/*` 7 个 hook 无任何页面 import（仅 `main.tsx` 用 `queryClient` 挂 Provider），页面全部手写 `useState+useEffect+fetch` → 无缓存、切页必重拉、同数据重复请求 | `client/src/renderer/src/hooks/queries/`（7 文件）；`main.tsx:7,17` | 二选一：**迁移页面到现成 hooks**（推荐，收益最大），或删除该层并移除 Provider；不要保留第三态 | M |
| P1-23 | **首屏被 three.js 阻塞**：`LoginPage` 静态 import `ParticlegroundBg`，后者 `import * as THREE`（r169 ESM ≈600-700KB min）；`electron.vite.config.ts` 无 `manualChunks` | `LoginPage.tsx:22`；`ParticlegroundBg.tsx:12`；`electron.vite.config.ts:15-23` | `React.lazy` + CSS 渐变 fallback 或首帧后动态 import；`manualChunks` 拆 `three` 与 vendor；若保留 react-query 则一并拆 chunk | S |
| P1-24 | **服务端列表性能**：列表全量无分页 + `rowToScript` 每行查 users（N+1）+ better-sqlite3 同步阻塞事件循环；缺 `created_by/review_status` 索引 | `server/src/routes/scripts.ts:63-69,94-109`；`server/src/db/index.ts:243-253` | 列表加 `page/pageSize`（默认 20）；用 `LEFT JOIN users` 一次取作者名；补索引；大列表改 keyset 分页 | M |
| P1-25 | **任务日志逐行 INSERT**：每个日志批次逐条 INSERT 无事务，`task_logs` 无保留策略/索引仅 `task_id` | `task.ts:119-125`；`store.ts:276-282,382-389` | 单事务批量插入（`insertMany`）；按任务保留最近 N 条/7 天清理任务 | S |

### 3.4 工程化 / 发布 / 文档

| ID | 问题 | 位置 | 建议 | 工作量 |
|---|---|---|---|---|
| P1-26 | **release 打包"没构建、没人用"的 server**：`release.yml:62-64` 名为 Build 实为 `tsc --noEmit` 不产 `dist`；`electron-builder.yml:12-20` 却按 `server/dist/**` + `node_modules/**` 打包；client 代码从不 spawn server（只访问 `localhost:3400`）→ 白白塞入 `server/node_modules` ≈115 MB / 2667 文件到三平台安装包，且 `dist` 实际缺失 | `.github/workflows/release.yml:62-64`；`client/electron-builder.yml:12-20` | 二选一：删除 extraResources（server 改为独立部署），或真正 `tsc` 出 dist 并在应用中内置/拉起；同时把 `files` 排除规则补全 | S |
| P1-27 | **server lockfile 缺失**：`server/.gitignore:7` 忽略 `package-lock.json`，`pr-check.yml:44` 仍把 `server/package-lock.json` 当缓存锚点；release 用 `npm install` 不可复现 | `.github/workflows/*.yml`；`server/.gitignore` | 提交 server lockfile，改用 `npm ci`；client lock 与 package.json 实测同步（971 包），可安全切 `npm ci` | S |
| P1-28 | **DX：每次 dev/build/test 都重建原生模块**：`dev/build/test/test:watch/test:coverage` 全部先 `rebuild:electron`/`rebuild:node`，dev↔test 在 Electron/Node ABI 间反复重建；`fix-electron.js`、`install-electron.ps1`（硬编码 `d:\Code\airdrop-farm` + electron 39.8.10，已失效）、`scripts/postinstall.cjs`、npm `postinstall` 四套入口职责重叠 | `client/package.json:18-29`；`client/fix-electron.js`、`install-electron.ps1`、`scripts/postinstall.cjs` | 拆分 `dev:once`（rebuild）与 `dev`（直接 electron-vite dev）；删除两个死脚本；rebuild 只在 lockfile/node 版本变化时执行（用 stamp 文件） | S |
| P1-29 | **依赖僵尸/缺件/双版本**：`ethers@6.16`、`@solana/web3.js@1.98` 在 `client/src` 零 import；`bufferutil`/`utf-8-validate` 零 import 却参与每次 rebuild；`@vitest/coverage-v8` 未声明；`electron-rebuild` 未声明（仅传递依赖）；better-sqlite3 client `12.10.0` vs server `11.7.0`（两个原生 ABI 版本） | `client/package.json:31-58`；`server/package.json` | 移除僵尸依赖（先确认 wallet 功能是否已废）；补 devDependencies；统一 better-sqlite3 大版本（server 升 12）；`.npmrc` 中已废弃的 `electron_mirror` 等 key 移入 CI env | S |
| P1-30 | **发布风险**：任意 `v*` tag 触发 release 且不校验 `package.json` 版本；无 CSC/APPLE secrets、`notarize:false`；`Verify output` 失败只 echo；`upload-artifact` 无 `if-no-files-found:error`；`action-gh-release@v1` 旧版 | `.github/workflows/release.yml:3-6,90-110` | tag 与版本一致性校验 step；签名/公证接入或明确"未签名"文档；校验失败 `exit 1`；升级 action 版本 | M |
| P1-31 | **文档与实现大面积漂移**：`CLAUDE.md:10` 根目录 `npm install`（根无 package.json，照做必失败）、`:78-100` 目录树写成根 `src/`、`:126-140` 表清单写 `accounts`/缺 `project_templates`、`:148-149` 列出的 `@mysten/sui.js`/`bitcoinjs-lib` 不在依赖；`AGENTS.md:178` Settings 写 admin-only（实际三角色可进，`App.tsx:88`）、`:516` 仍教已废弃的 `requiredAccountTemplateIds`（现为 `dataRequirements`）、`:921-934` TODO 中 4 项已完成未勾选 | `CLAUDE.md`、`AGENTS.md`、`README.md`、`docs/task-script-dev-guide.html` | 以代码为准重写命令/目录/表/角色矩阵；文档中"已验证"陈述（签名、沙箱四层、11/11 测试）需与实现对齐或删除 | M |

---

## 4. P2 — 中优先级（约 22 项）

| ID | 类别 | 问题 | 位置 | 建议 | 工作量 |
|---|---|---|---|---|---|
| P2-1 | 正确性 | 全局错误处理固定 500：body-parser 400、multer 413 都被转成 500；500 把 DB/路径原文返回客户端 | `server/src/index.ts:89-92`；`scripts.ts:180,203,286,390` | 读取 `err.status/err.code` 映射；生产环境隐藏内部错误 | S |
| P2-2 | 正确性 | 评分功能半成品：`script_reviews` 表 + 7 条 prepared statements + 5 个客户端 API 存在，服务端无对应路由 | `server/src/db/index.ts:221-230,281-305`；`api.ts:741-817` | 补齐 `GET/POST /api/scripts/:id/reviews` 或删除两端半成品 | M |
| P2-3 | 安全 | HTTP API 侧信道：token 经 `additionalArguments` 进渲染进程命令行（同用户可读 argv）；端口 34116-34126 线性探测 | `main/index.ts:65,144-147`；`preload/index.ts:12-17`；`transport.ts:179-190` | 内部进程通信改用 `ipcMain`/自定义 protocol；token 改由 preload 直接暴露（本就需要给渲染层）；健康检查后缓存端口 | S |
| P2-4 | 安全/可靠性 | 下载/解压链无超时、无大小上限、zip bomb 防护缺失；`manifest.json` 缺失仍"安装成功"；checksum 与包同源不可信 | `script-fetcher.ts:84-166,356-378` | `AbortSignal.timeout`；`content-length`/解压后大小上限；manifest 缺失 fail；长远做服务端签名清单 | M |
| P2-5 | 数据层 | `task_logs`/`app_logs` 无外键、无保留策略；JSON 字段反复 parse/stringify；缺 `created_by/review_status` 索引 | `store.ts:276-282,360-389`；各 repo 的 `rowTo*` | 建表加外键 + 迁移；日志定期归档/清理；列表只 select 需要字段 | M |
| P2-6 | 可靠性 | 定时任务强制 `isSandbox=false`；cron 计算昂贵；`next_run` 无用 | `scheduler.ts:163-204` | 见 P1-19 | S |
| P2-7 | 安全 | 加密：`safeStorage` 不可用时静默降级明文存私钥；updater 无 `app.isPackaged` 守卫、无签名配置 | `encryption.ts:39-41`；`main/index.ts:156-158` | 不可用时明确提示用户并拒绝存私钥；updater 仅 packaged 下启用并 catch rejection | S |
| P2-8 | 架构 | `StoreService` 双层 API：13 个 repo getter + 大量同名转发方法并存，handler 两种写法混用 | `store.ts:164-226,537-555+` | facade 只保留跨 repo 事务/组合逻辑，纯 CRUD 统一走 `store.xxxRepo` | M |
| P2-9 | 架构 | 渲染层 18 处绕过 api 层直接 `fetch`（AdminCenter 6、ProjectTemplates 4、Settings 4、Captcha 4、LoginPage 2、TemplateEditor/DeveloperCenter 各 1）；`api.ts` 内 `marketplaceApi` 30 处手写 `getUrl+getHeaders+错误解析` 样板 | `client/src/renderer/src/api.ts:351-435` 等；各页面 | 抽 `marketFetch(path, init)`（URL+鉴权+超时+错误规范化），页面只调 api 层 | M |
| P2-10 | 可维护性 | 三套重复 UI 实现：Proxies 手写分页/4 个手写遮罩/手写搜索框；Tasks 手写日志面板（LogViewer 仅 DebugPage 用）；弹窗/批量选择各 2 套 | `Proxies.tsx:366-378,516-669`；`Tasks.tsx:1100-1128` | 统一到 `common/` 现成组件，逐页替换 | M |
| P2-11 | 缺陷 | Tailwind v4 动态类名插值失效：`bg-status-${...}` 字面量类全仓 0 命中 → paused/stopped 徽章无配色 | `Tasks.tsx:1018` | 改为静态映射 `const STATUS_CLASS: Record<TaskStatus,string>` | S |
| P2-12 | 可维护性 | i18n 双轨：key 校验全绿，但 15+ 处 UI 文案直接写中文（绕过 `t()`） | `DeveloperCenter.tsx:686-693` 等 | 补 key + 替换；`check-i18n` 增加"硬编码中文"启发式检查 | S |
| P2-13 | 可维护性 | 超长文件拆分边界：DeveloperCenter 1757 行、Settings 1616、Tasks 1374、ScriptParams 911、LoginPage 887 | 对应 `pages/*` | 按 tab/section 拆子目录；把轮询/表单/hooks 抽出 | L |
| P2-14 | 正确性 | 竞态与陈旧数据：分页请求无取消、详情页 id 变化不复位、模板页三触发器并发 | `hooks/usePaginatedList.ts`；`ScriptDetail.tsx`；`Templates.tsx` | AbortController + requestId 校验；依赖 key 重置 | M |
| P2-15 | 死代码 | `KeepAliveOutlet.tsx`/`keep-alive-cache.ts` 仅注释与测试引用；`pages/Marketplace.tsx`、`hooks/useAsyncEffect.ts` 无 import；`Layout.tsx:315-319` 注释与实际相反 | 对应文件 | 删除或接入；注释修正 | S |
| P2-16 | CI | PR 只查类型/格式：无 build 门禁、只触发 PR（无 push/main）、无 `concurrency` 取消、无最小权限、缓存策略浪费 | `.github/workflows/pr-check.yml` | 加 build；`concurrency: {group, cancel-in-progress}`；`permissions: contents: read` | S |
| P2-17 | 打包 | electron-builder：`files` 漏排 `tests/scripts/fix-electron.js`；`appId: com.electron.app`、`author: example.com`、`homepage: electron-vite.org` 为脚手架残留 | `client/electron-builder.yml:1-11`；`client/package.json:1-9` | 排除 tests、修正元数据、`npmRebuild:false` 与 release 的 electron-rebuild 保持一致 | S |
| P2-18 | 质量门禁 | 无 `prettier --check`、server 无 lint、tests 不参与 typecheck、无 `engines` Node 版本约束 | 各 package.json / tsconfig | 补 `format:check`、server eslint、test tsconfig、`engines: {node: ">=22"}` | S |
| P2-19 | 仓库卫生 | `.gitignore` 已忽略但仍被跟踪：`.claude/settings.local.json`、`.dbg/ipc-http-fallback.env`、`.sisyphus/run-continuation/*`、`.vscode/*`、`.omo/notes/*`；另有临时脚本残留 | `git ls-files` | 一次性 `git rm -r --cached` + 确认 .gitignore 覆盖 | S |
| P2-20 | 文档 | README/HTML 开发指南/SDK 示例的端点与字段清单落后于实现（README 端点 18 vs 实际 41） | `README.md`、`docs/task-script-dev-guide.html` | 从路由表生成端点文档；SDK 示例对齐 `sdk-protocol.ts` | M |
| P2-21 | 测试 | 测试分布与风险倒挂：`task.ts`(496 行)/`scheduler.ts`/`encryption.ts`/`sdk-protocol.ts`/`script-fetcher.ts` 无直接测试；server 0 测试 | `client/tests/`、`server/` | 最小补测顺序：`encryption` 往返 → `task` 权限纯函数 → server auth 中间件（401/403/公开 GET）→ scheduler cron → `StoreService` 建表回归 | M |
| P2-22 | 环境 | 仓库当前 `client/node_modules` 缺失导致无法 typecheck/lint/test；`client` 安装依赖会触发 Electron 下载（体积大、需镜像） | `client/` | 在 README/AGENTS 中明确首次安装命令与镜像；CI 已用 `--ignore-scripts` 规避 | S |

---

## 5. 架构与代码质量专项（跨切面，按回报排序）

1. **先建立"可验证性"，再谈安全重构**：当前所有安全承诺都无法被 CI 验证（P0-8）。建议第一个 PR 只做三件事：CI 跑测试 + 修 6 处坏引用 + 建表回归测试。之后每个安全修复都带一个能复现原缺陷的测试（恶意 manifest、sandbox 越权、未授权审核）。
2. **统一权限边界（主进程为唯一权威）**：渲染层不应持有明文私钥、不应能调任意 `fs`/`shell`/`upload`；服务端不应把审核字段暴露给被审核者。两者都是"边界画错"，而非局部 bug。
3. **资产必须进入构建产物**：`sandbox-enforcer.cjs` 是安全基石却没被构建系统感知。同理需要盘点所有"运行时字符串路径"引用的资源（`resources/`、`scripts/`、server `dist`），用打包断言兜底。
4. **消灭"三份拷贝"**：manifest schema（3 份）、shared types（重复块）、`StoreService` facade/repo（双入口）、UI 组件（2-3 套）、传输层（IPC/HTTP 两套错误处理）。建议各做一次收敛 PR，并加 CI 一致性检查（hash 比较/禁止路径引用）。
5. **决定 React Query 的去留**：814 行现成 hooks 是已有资产，迁移页面能一次性解决缓存/重复请求/请求波问题；若决定不用，就删干净，避免第三人误以为在用。**不要保留第三态。**
6. **文档即契约**：`CLAUDE.md`/`AGENTS.md` 中"命令、目录、表结构、角色矩阵、manifest 字段、TODO 清单"均已失真；安全类描述（"四层权限"、"签名脚本"、"11/11 测试"）会误导后续开发者，应优先改写为"当前实现 + 已知限制"。

---

## 6. 修复路线图与验收清单

### Batch 0 — 止血（约 0.5-1 人日，建议今天就合）

| 顺序 | 动作 | 对应 |
|---|---|---|
| 1 | `store.ts` 补 `CREATE TABLE IF NOT EXISTS settings` + 建表回归测试 | P0-4 |
| 2 | enforcer 打成构建资产 + 缺失时 fail-closed + CI 断言 `out/main` 存在 | P0-1 |
| 3 | config→env 加保留键黑名单；内部变量（`TASK_CWD_RESOLVED`）由主进程覆盖 | P0-3 |
| 4 | `entryPoint` 包含性校验 + `.js/.cjs/.mjs` 白名单；`npm install` 加 `--ignore-scripts` | P0-2 |
| 5 | Tasks 单条/批量删除加 `ConfirmDialog` + 事务内级联删日志 | P0-7 |
| 6 | CI 加 `npm test`；修 3 处已删除模块 import + 3 处错误相对路径；tests 纳入 typecheck | P0-8 |

### Batch 1 — 安全边界收口（约 2-4 人日）

- 审核字段从 PUT/PATCH 白名单移除 + `reviewStatus` 枚举校验 + 回归测试（P0-5）；
- preload channel allowlist + `register()` sender 校验 + 特权 handler 收口（`fs:*`/`server:upload`/`shell:openPath`/`script:remove`/`task:create`）+ `wallet:list` 脱敏（P0-6、P1-9）；
- 服务端 `asyncHandler` + 全局 `unhandledRejection` 兜底 + 上传校验（uuid 文件名、schema 校验、解压上限、事务）（P1-1~P1-5）；
- Electron 窗口硬化（`sandbox:true`、`will-navigate`、`openExternal` scheme、CSP 响应头）（P1-8）；
- transport 业务错误不降级 + CORS 精确匹配（P1-15）。

### Batch 2 — 体验/性能/工程化（约 1-2 周）

- 渲染层：React Query 迁移或删除（P1-22）、tab 惰性挂载与请求波治理（P1-20）、日志虚拟化（P1-20）、`manualChunks` + three 懒加载（P1-23）、错误态/ErrorBoundary（P1-18）、统一 UI 组件（P2-10）；
- 服务端：列表分页 + JOIN 去 N+1 + 索引（P1-24）、错误映射（P2-1）；
- 工程化：release 去掉/真正构建 server（P1-26）、server lockfile + `npm ci`（P1-27）、DX 脚本整理（P1-28）、依赖清理（P1-29）、发布签名（P1-30）；
- 文档重写（P1-31、P2-20）；架构收敛（P2-8、P2-9、P1-16、P1-17）。

### 验收清单（每项修复后应能自动验证）

- [ ] 全新目录启动客户端成功（临时 `userData` 建库）→ `settings` 读写往返测试通过；
- [ ] `npm run build:unpack` 后 `out/main/**/sandbox-enforcer.cjs` 存在；CI 有断言；
- [ ] `is_sandbox=true` 的 fixture 脚本 `require('http')` / `fs.readFileSync('C:\\x')` 抛 `ERR_PERMISSION_DENIED`；
- [ ] 恶意 manifest fixture（`entryPoint: "../../x.exe"`、`perm_bypass: "1"`、`cwd_resolved: "C:\\"`）被拒绝/无效化；
- [ ] 服务端：developer 调用 PUT 带 `reviewStatus:"approved"` 后仍为 `pending`；
- [ ] 服务端：并发同名注册不使进程退出（返回 409）；
- [ ] 客户端 `npm test` 在 CI 全绿（含新增回归用例），覆盖率有下限；
- [ ] 删除任务弹出确认；删除后 `task_logs` 无孤儿行；
- [ ] 未登录首屏在 three.js chunk 加载完成前即可交互（LCP 改善）；
- [ ] `npm ci` 在 client/server 均可复现安装。

---

## 7. 做得好的地方（避免过度重构）

- **数据层基础扎实**：全部 SQL 使用 prepared statements，未发现注入；repositories 分层 + `BaseRepository` 语句缓存（`repositories/base.ts`）设计合理；WAL + foreign_keys 已开启。
- **Markdown/XSS 链路**：`react-markdown + remark-gfm + rehype-sanitize`，无 `dangerouslySetInnerHTML`，URL 协议被 sanitize 限制。
- **i18n key 管理**：`check-i18n.cjs` 能扫描 1095 个 `t()` 调用并校验 999 个 key，且已接入 CI——这是仓库里少有的"真正在运行的质量门禁"。
- **代码注释与文档密度**：JSDoc 覆盖率高，关键设计（SDK 协议、权限模型、双传输层）有说明；问题在于"注释描述与实现不一致"，而非注释缺失。
- **公共组件质量**：`Modal`/`ConfirmDialog`/`LogViewer`/`usePaginatedList`/`DynamicForm`/`MarkdownView`/`useTheme` 本身写得好，只是未被统一采用。
- **安全测试意识**：`tests/main/sandbox-enforcer.test.ts` 对 patch 行为有 11 个用例，思路正确；缺的是"从构建产物验证"和"接入 CI"。

---

## 附录 A：分领域详细报告（本地，`.omo/` 已被 gitignore）

| 报告 | 内容 | 规模 |
|---|---|---|
| `.omo/audit/main.md` | 主进程 15 findings（P0×5 / P1×5 / P2×5），含代码片段与修复 diff | 481 行 |
| `.omo/audit/server.md` | 服务端 15 findings（P0×2 / P1×4 / P2×9） | 762 行 |
| `.omo/audit/renderer.md` | 渲染层 15 findings（P0×1 / P1×7 / P2×7） | 534 行 |
| `.omo/audit/tooling.md` | 工程化 15 findings（P0×2 / P1×9 / P2×4）+ 可直接落地的 YAML/JSON 补丁 | 15 节 + 6 个补丁 |
| `.omo/audit/_lead-cross-cutting.md` | Lead 跨切面 12 条（L1-L12）复核笔记 | 12 条 |

## 附录 B：本次审计的环境限制

- `client/node_modules` 不存在：客户端 **typecheck / lint / vitest / 构建 / 启动** 均未执行，客户端结论全部基于静态阅读 + grep；`server/node_modules` 存在，`npx tsc --noEmit` 通过。
- `P0-1`（enforcer 未打包）为构建配置+全仓 grep 的静态推断；建议 `npm run build:unpack` 后检查 `out/main` 目录最终确认。
- 包体/性能数字（three.js ≈600-700KB、node_modules 115MB 等）为量级估计；精确值需安装依赖后实测。
- 测试套件当前无法运行（坏 import + 缺 `@vitest/coverage-v8` + 缺 node_modules），因此"325 个测试"为源码统计而非执行结果。
- **（2026-10-22 更新）** 上述限制已在 Batch 0 修复过程中解除：客户端依赖已安装、`@types/adm-zip` 已补、测试套件已修复并全绿、构建产物已实测。详见附录 C。

---

## 附录 C：Batch 0 修复记录（2026-10-22）

> 状态：**已实施，未提交**（工作区改动，等待 review/commit）。修复范围严格对齐 §6 Batch 0「止血包」。

### C.1 已修复项

| 对应 ID | 修复内容 | 关键改动 | 验证方式 |
|---|---|---|---|
| **P0-4** | 补回 `settings` 表创建 | `client/src/main/services/store.ts`：`initialize()` 新增 `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)` | `store.test.ts` 中 Settings CRUD 6 个用例通过；`StoreService` 在全新临时库上构造成功 |
| **P0-1** | enforcer 进入构建/打包产物 + 缺失时 fail-closed | `client/electron.vite.config.ts` 新增 `copy-sandbox-enforcer` 插件（构建后拷贝到 `out/main/sandbox-enforcer.cjs`）；`client/electron-builder.yml` 增加 `extraResources`（打包后位于 `process.resourcesPath`）；`task.ts` 新增 `resolveSandboxEnforcerPath()` 覆盖 dev/打包/asar 三种形态，找不到直接抛错拒绝启动；新增 `client/scripts/verify-artifacts.cjs` + `npm run verify:artifacts`。**另修复 enforcer 真正生效后暴露的模块加载器兼容问题**：Node 通过公开 `fs` API 读取入口脚本/require 文件，原先"无 filesystem 权限即拒绝所有 fs 调用"会让任何 `node <entry>` 在启动阶段崩溃；现改为：读取脚本目录/TEMP 内路径放行、元数据操作（stat/realpath 等，模块解析需要）放行、写操作与目录外读取仍拒绝 | `npx electron-vite build` 成功；`out/main/sandbox-enforcer.cjs` 存在；`verify-artifacts` 通过；PR CI 新增该断言步骤；新增真实入口文件回归用例（`sandbox-enforcer.test.ts` 12/12）；手工 smoke：真实入口脚本在 `TASK_PERM_*=0` 下可启动，`http` 与目录外 `fs` 均返回 `ERR_PERMISSION_DENIED` |
| **P0-3** | config→env 保留键黑名单 + 主进程计算 `TASK_CWD_RESOLVED` | 新增 `client/src/main/services/task-env.ts`（`buildTaskConfigEnv`，过滤 `PERM_BYPASS`/`CWD_RESOLVED`/`PERM_*`/`SANDBOX` 与系统变量）；`task.ts` 改为调用该函数，并由主进程写入可信的 `TASK_CWD_RESOLVED`（同时修复"声明 filesystem 权限却读不到自己目录"的缺陷） | 新增 `client/tests/main/services/task-env.test.ts`（7 个用例，覆盖 bypass/cwd/系统变量/内部字段） |
| **P0-2** | entryPoint 包含性校验 + 扩展名白名单 + 安装期不执行生命周期脚本 | 新增 `client/src/main/services/script-entry.ts`（`resolveScriptEntryPoint` / `assertNodeEntryExtension`，只允许 `.js/.cjs/.mjs` 且必须位于脚本目录内）；`task.ts` 统一用 `node <entry>` 启动（删除 `npx tsx` 与非 JS 直接 spawn 分支），对 `config.args` 仅接受字符串；`npm install` 增加 `--ignore-scripts` | 新增 `client/tests/main/services/script-entry.test.ts`（5 组用例：默认入口/嵌套/`../` 逃逸/绝对路径/`.exe/.bat/.ts`） |
| **P0-7** | 任务删除二次确认 + 日志级联删除 | `Tasks.tsx` 接入 `ConfirmDialog`（单条/批量，含 loading 与选中数量）；`repositories/task.ts` 的 `deleteTask` 改为事务内先删 `task_logs` 再删任务；i18n 新增 `tasks.confirmDelete`/`confirmBatchDelete`/`deleteSuccess` | 新增 `client/tests/main/services/task-delete-cascade.test.ts`（2 个用例：级联删除、不影响其他任务日志） |
| **P0-8** | CI 接入测试 + 修复测试套件 + tests 纳入 typecheck | `.github/workflows/pr-check.yml` 新增 `npm test`、`npx electron-vite build`、`npm run verify:artifacts`；修复 3 处 import 已删除 `wallet.ts` 的测试（删除过时的 `wallet.test.ts`，`server.test.ts`/`handler.test.ts` 改用当前 `Services` 形状）；修复 3 处错误的 `src/shared/types` 相对路径；`tsconfig.node.json`/`tsconfig.web.json` 分别纳入 `tests/main`、`tests/renderer`；新增 `tests/setup/electron-mock.ts`（headless Electron 桩）与 `electron-updater` 测试桩 alias；补 `@types/adm-zip` 并删除与之冲突的本地最小声明 `src/shared/types/adm-zip.d.ts`；`rebuild:node` 只重建 `better-sqlite3` | **34 个测试文件 / 327 个用例全部通过**（修复前 9 个文件 38 个用例失败，另有 1 个文件因重复声明无法编译） |

### C.2 全量验证证据（本机，Node v24.16.0 / npm 11.13.0）

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.node.json`（含 tests/main） | ✅ 0 error |
| `npx tsc --noEmit -p tsconfig.web.json`（含 tests/renderer） | ✅ 0 error |
| `npm test`（`rebuild:node` + vitest） | ✅ **34 files / 327 tests passed** |
| `npm run lint` | ✅ 0 error（约 1500 warnings，均为仓库既有的 prettier/CRLF 警告） |
| `npm run i18n:check` | ✅ 95 files / 1107 `t()` / 1002 keys，全部有效 |
| `npx electron-vite build` | ✅ 成功，`out/main/sandbox-enforcer.cjs` 已产出 |
| `npm run verify:artifacts` | ✅ main/preload/renderer 及 enforcer 四类产物齐全 |

### C.3 Batch 0 未覆盖、遗留到 Batch 1 的 P0

- **P0-5**（服务端审核自批）：未改动，仍为最高优先级的服务端修复；
- **P0-6**（preload allowlist / sender 校验 / 特权 handler 收口）：未改动。P0-2 已把"任意 exe 执行"入口关掉，但 `fs:readFile/writeFile`、`server:upload`、`shell:openPath`、`script:remove` 等特权面仍在，需按 §2 P0-6 的方案收口。

### C.4 行为变化与注意事项（需在 review 时确认）

1. **不再支持 `.ts` / `tsx` 入口**：任务脚本入口现在只允许 `.js/.cjs/.mjs`（安全收益 > 兼容性；如确有开发脚本需要，走 DebugPage 等受控入口）。
2. **`npm install --ignore-scripts`**：任务依赖若必须执行构建脚本（如原生模块），将安装失败/不可用。这是有意的安全取舍；确需时由用户在受控环境手动安装。日志中会保留失败原因。
3. **`entryPoint` 绝对路径/越界路径会直接报错**（任务状态置为 `error` 并写入日志），不再尝试运行。
4. **enforcer 缺失即拒绝启动任务**：dev/打包产物都会由构建/打包流程拷贝；若人工删改产物，任务会明确失败而不是静默降权。
5. **沙箱文件系统语义**（继承 enforcer 既有设计并修正启动兼容性）：无 filesystem 权限时，读取脚本目录/TEMP 内文件与 `stat/realpath` 等元数据操作放行（Node 模块加载必需），目录外读取与所有写操作拒绝；声明 filesystem 权限后写操作仍限制在白名单目录内（与修复前的 chroot 语义一致）。"沙箱模式禁止文件系统访问"的文档措辞需在 Batch 2 更新为准确描述。
6. **`package-lock.json` 有大量空白/格式 churn**：`git diff -w` 显示语义变化仅为新增 `@types/adm-zip`（+11 行），其余为 npm 11 对既有 mirror 锁文件的格式重写；无依赖版本变更。
7. **尚未验证真实的 electron-builder 打包**（本机 `--ignore-scripts` 安装无 electron 二进制）：`extraResources` 路径已按 electron-builder 语义配置，建议在 CI/release 上跑一次 `build:unpack` 并确认 `resources/sandbox-enforcer.cjs` 存在。
8. **未更新文档**（AGENTS.md/CLAUDE.md 中的安全描述与 manifest 字段说明仍是旧版），属 Batch 2 的 P1-31。

---

## 附录 D：UI/UX 视觉优化记录（2026-10-22）

> 状态：**已实施，未提交**。目标：在不改业务逻辑的前提下统一视觉语言、修复明确的样式缺陷、提升信息层级与交互反馈。
> 预览方式：用 `playwright-core` 驱动本机 headless Edge，路由拦截 `client/out/renderer` 构建产物并提供 `window.electronAPI` mock（临时脚本，未入库）。截图见 `docs/screenshots/`。

### D.1 设计系统层（`main.css`）

新增一组可复用的 UI 工具类，避免各页面重复手写卡片/表格样式：

| 工具类 | 用途 |
|---|---|
| `.surface-card` / `.surface-card-hover` | 统一卡片：边框 + 内高光 + 悬停抬升，替代各页面零散的 `bg-bg-card border ... rounded-xl` |
| `.data-table` | 统一表头（11px/宽字距/弱化颜色）、行悬停底色、行过渡 |
| `.status-pill` / `.status-dot` | 状态徽章底座 + 状态点（圆点用 currentColor，自动跟随状态色） |
| `.icon-tile` / `.kpi-value` / `.section-eyebrow` | KPI 图标底座 / 等宽数字 / 英文小标题 |
| `.input-base` | 统一输入框焦点环 |
| `.page-enter` | 页面首次挂载的淡入上移动画（支持 `prefers-reduced-motion`） |

同时补充全局细滚动条、`::selection` 品牌色选中、`@media (prefers-reduced-motion)` 降级。

### D.2 应用外壳（`Layout.tsx`）

- 侧边栏：顶部品牌光晕；导航项左侧 3px 激活指示条（带微光）；hover 时图标轻微放大、文字提亮；激活项保留紫色底；新增角色徽章柔和描边配色（admin 琥珀 / developer 紫 / user 绿，替代原高饱和红/紫/绿实心块）。
- 侧边栏底部用户区升级为头像圆角卡：首字母渐变头像 + 显示名 + 角色徽章。
- 主内容区：`max-w-[1600px]` 居中 + `page-enter` 入场动画，宽屏下不再无限拉伸。

### D.3 页面与组件

- **Dashboard**：页头改为"眉题 + 欢迎语（`dashboard.greeting` 带用户名）+ 日期 + 刷新"结构；KPI 卡片重做（渐变图标块 + 右上角品牌光晕 + 3xl 等宽数字 + hover 抬升）；角色横幅加右侧渐变；面板统一 `.surface-card`，列表统一 `.data-table`；快捷操作卡统一图标底座。
- **任务页（Tasks）**：修复"已暂停/已停止"状态徽章**没有配色**的 Tailwind 动态类缺陷（`bg-status-${status}-bg` 无法被编译），改为静态映射 + 状态圆点；表格统一 `.data-table`（表头小写间距、行 hover、最后一行去边框）；进度条改为紫→金渐变；操作按钮从"常亮彩色"改为"静默灰 + hover 着色"，降低行内视觉噪音；日志面板：级别徽章、hover 行、等宽字体、加载动画；空列表改为 `EmptyState` + "创建任务"行动按钮；加载态改为骨架行。
- **登录页**：脚注版本号从硬编码 `v0.2.1` 改为构建时注入的真实版本（现在显示 v0.3.0，来源 `client/package.json`，通过 `renderer.define.__APP_VERSION__`）；CTA 按钮渐变从"透紫→棕"改为高饱和紫→金，并加内高光/悬停辉光。
- **数据页（Data）**：移除"数据管理"与子页"代理管理/参数管理"的双层标题，子页在 Tab 内改用眉题，减少重复信息。
- **项目追踪（Airdrops）**：KPI 磁贴统一为新版卡片（图标底座 + 等宽数字），与 Dashboard 风格一致。
- **通用组件**：`EmptyState`（渐变图标底座 + 描述 + 行动按钮）；`SearchInput`（非空时显示一键清空按钮，统一 focus 环）；`Modal`（新增右上角关闭按钮、遮罩毛玻璃、面板统一 surface 卡）；`Pagination`（圆形描边按钮 + 页码 pill，hover 品牌色）。

### D.4 涉及文件

`client/src/renderer/src/assets/main.css`、`components/Layout.tsx`、`components/common/{EmptyState,SearchInput,Modal,Pagination}.tsx`、`components/airdrops/AirdropKpiBar.tsx`、`pages/{Dashboard,Tasks,LoginPage,Data,ScriptParams,Proxies,Captcha}.tsx`、`pages/LoginPage.tsx`（FORGE_CSS）、`i18n/zh-CN.json`（新增 `dashboard.greeting`）、`electron.vite.config.ts` / `src/renderer/src/env.d.ts`（版本号注入）。

### D.5 验证

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit`（node / web） | ✅ 0 error |
| `npm test` | ✅ 34 files / 327 tests passed |
| `npm run lint` | ✅ 0 error（1492 warnings，均为既有 prettier/CRLF） |
| `npm run i18n:check` | ✅ 通过（1107 `t()` / 1002 keys） |
| `npx electron-vite build` + `verify:artifacts` | ✅ 成功 |
| 截图回归（headless Edge，14 个页面/明暗主题） | ✅ 无 console error；截图见 `docs/screenshots/` |

### D.6 后续可继续的视觉/体验项

1. 其余表格页（Logs / Scheduler / Proxies / ScriptParams）逐步补 `.data-table`，统一表头与行 hover；
2. P1-18：错误态与空态区分（列表加载失败显示错误 + 重试，而不是"暂无数据"）；
3. P1-20：Tasks 轮询与日志虚拟化、Dashboard 全量拉取改分页；
4. 设置页 10 个区块可加左侧锚点导航（长页面定位）；
5. 表格在小屏（<1100px）的横向滚动与列优先级策略。

---

## 附录 E：Batch 1 安全边界收口记录（2026-10-22）

> 状态：**已实施，未提交**。范围：Batch 1「安全边界收口」——服务端审核/异步/上传 + 客户端 IPC/窗口/传输层边界。
> 验收方式：`npx tsc`（client node/web + server）、`npm test`、`eslint`、`electron-vite build`、**服务端真实运行时验收脚本 20/20**。

### E.1 服务端（`server/`）

| 对应 ID | 修复内容 | 关键改动 |
|---|---|---|
| **P0-5** | 审核门禁不可被内容作者绕过 | `scripts.ts`：PUT/PATCH 的 `visible/reviewStatus/reviewComment` 仅管理员生效，开发者写入被忽略；`reviewStatus` 枚举校验；**reupload 后开发者脚本强制回到 `pending + visible=0`**；`templates.ts`：PATCH 的 `visible` 仅管理员生效；模板创建 ID 由服务端生成 |
| **P1-1** | async 路由未捕获 rejection | 新增 `utils/async-handler.ts`（`asyncHandler` / `isUniqueConstraintError`）；auth 三个 async 路由全部包装；注册/初始化的“先查后插”竞态由 UNIQUE 约束兜底（409/403）；`db.transaction` 保证 setup 幂等；全局 `unhandledRejection`/`uncaughtException` 日志兜底 |
| **P1-2** | 上传文件名路径穿越/并发覆盖 | 三处上传文件名改为 `uuidv4().zip`（不再拼接 `manifest.name`） |
| **P1-3** | 模板 schema 脏数据导致公开列表 500 | `templates.ts` 新增 `normalizeSchema`（JSON 字符串/对象校验 + 256KB 上限 + 400 返回）；`rowToTemplate` 改用 `safeParseObject` 降级 |
| **P1-4** | zip 炸弹 | `validateZipManifest` 增加：条目数 ≤ 2000、声明解压总大小 ≤ 200MB、manifest ≤ 1MB |
| **P1-5** | 文件/DB 双写无事务 | 上传、更新、reupload 全部改为「先写新文件 → DB 事务（主记录+版本记录）→ 成功后再删旧文件」，失败回滚并清理新文件；reupload 补上版本历史 |
| **P1-7** | 普通用户可创建项目模板 | `project-templates.ts` 的 POST/PUT/DELETE 补 `requireRole("admin","developer")` |
| **P1-6（部分）** | 错误处理/限流/响应头 | 全局错误中间件映射 body-parser（400/413）、multer（413/400）、SQLite UNIQUE（409），5xx 在 `NODE_ENV=production` 下隐藏内部细节；限流前置于认证；新增安全响应头；CORS 从 `*` 改为「本机来源 + `CORS_ORIGINS` 白名单」，不再放行 `http://localhost.evil.com`；users 路由 500 响应不再返回数据库原文 |

**服务端运行时验收（临时数据库 + 真实 HTTP 调用，20/20 通过）**：管理员初始化 / 注册 / 角色提升 / 普通用户创建项目模板 403 / 上传默认 pending+invisible / **developer PUT+PATCH 自批无效** / 管理员审核可上架 / 非法 reviewStatus 400 / 文件名 UUID 化 / 非法 schema 400 / 模板自设可见无效 / 5 并发同名注册（1×201 + 4×409，进程存活）/ 非法 JSON 400 / **reupload 后回到 pending+invisible**。

### E.2 客户端 IPC / 窗口 / 传输层

| 对应 ID | 修复内容 | 关键改动 |
|---|---|---|
| **P0-6** | preload 任意 channel → 主进程 | 新增 `src/shared/ipc-channels.ts`（109 个 invoke + 5 个 event channel，由主进程注册表生成）；preload 对未知 channel `invoke` 直接 reject、`on` 直接忽略；`registry.register` 校验 `event.senderFrame.url` 只允许打包 `file://.../out/renderer` 或 dev server；`server:upload` 自定义 IPC 通道同样校验 sender |
| **P0-6** | 特权 handler 任意路径/URL | 新增 `services/path-allowlist.ts`：`fs:readFile/writeFile/exists`、`zip:create/extractManifest`、`shell:openPath`、`server:upload` 源文件只允许访问 userData/scripts/temp 与**用户本次会话经原生对话框选择过的路径**；`server:upload` 目标 URL 仅允许 http/https；`script:remove` 增加 scriptsDir 包含性校验；`task:create` 的 scriptFolder 必须已授权（DebugPage 的选择目录流程兼容） |
| **P1-9** | 明文私钥进入渲染层 | `wallet:list` 对 `privateKey/mnemonic` 脱敏；`wallet:get` 保留完整数据供明确的导出/签名动作 |
| **P1-8** | Electron 窗口硬化 | `sandbox: true` + `contextIsolation/nodeIntegration/webSecurity` 显式配置；preload 不再通过 argv 传递 HTTP 端口/令牌（改用 `app:getHttpInfo` 同步 IPC），因此可在 sandbox 中运行；`will-navigate` 只允许应用自身页面；`setWindowOpenHandler` 只放行 http/https；新增 `will-attach-webview` 拒绝、权限请求全部拒绝；CSP 增加 `object-src/base-uri/frame-ancestors/form-action` |
| **P1-15** | 传输层把业务错误当故障 | IPC 返回 `{error}` 标记 `isBusinessError`，`call()` 不再降级 HTTP（避免重复请求与 12 端口探测）；HTTP API CORS 改为精确解析 Origin（`null`/localhost/127.0.0.1），伪前缀来源被拒 |

**新增测试**：`tests/main/ipc/channel-allowlist.test.ts`（扫描源码 vs 白名单，防漏登记/残留）、`trusted-sender.test.ts`、`services/path-allowlist.test.ts`、`transport.test.ts` 业务错误不降级用例、`handler.test.ts` 钱包列表脱敏用例。

### E.3 本次验证结果

| 检查 | 结果 |
|---|---|
| client `tsc --noEmit`（node/web） | ✅ 0 error |
| server `tsc --noEmit --skipLibCheck` | ✅ 0 error |
| client `npm test` | ✅ **37 files / 343 tests passed** |
| `npm run lint` | ✅ 0 error（1504 warnings，均为既有 prettier/CRLF） |
| `npx electron-vite build` + `verify:artifacts` | ✅ 成功，preload 产物已包含 channel 白名单 |
| 服务端运行时验收 | ✅ **20/20 通过**（详见 E.1） |
| i18n check | ✅ 通过 |

### E.4 行为变化与注意事项（review 时确认）

1. **开发者 reupload 会重新进入审核并下线**：这是有意的安全行为，会改变“已上架脚本更新后仍可见”的旧体验。
2. **`fs:*` / `zip:*` / `shell:openPath` / `server:upload` 需路径已授权**：正常 UI 流程（对话框选择、userData、temp、scripts 目录）不受影响；任何硬编码绕过对话框的调用会被拒绝。
3. **`sandbox: true`**：preload 只能使用 `electron` 模块；后续若在 preload 引入 `fs/os/path` 等 Node 模块会直接失败（请改用主进程 IPC）。
4. **HTTP API CORS 收紧**：远程浏览器前端直连本地 34116 不再被允许（Electron 自身不受影响）；需要时配置 `CORS_ORIGINS`。
5. **服务端 5xx 细节隐藏**仅在 `NODE_ENV=production` 生效；本地开发仍返回原始 message 便于调试。
6. **未覆盖的 P1-6 剩余项**：JWT 不可吊销、legacy admin key、密码策略/ bcrypt cost 统一、`.env` 明文——改动面较大，建议单独批次处理并配迁移/兼容策略。（**Batch 2 已处理，见附录 G**）
7. **服务端仍无自动化测试框架**：本次用一次性运行时脚本验证（未入库），建议下一步把关键用例固化为 `vitest + supertest`。

### E.5 建议的下一批（Batch 2 预备）

1. 服务端测试基建（vitest + supertest）与 CI 接入；JWT/密码策略治理；
2. 渲染层错误态/空态、请求波与虚拟化（P1-18/P1-20）；
3. server ↔ client 共享 manifest schema（P1-16）、`StoreService` 双入口收敛（P2-8）；
4. 真实 `build:unpack` 打包验证（sandbox enforcer + sandbox:true preload）。

---

## 附录 F：Electron 环境安装与真实运行/打包验证（2026-10-22）

> 状态：**已安装并验证，未提交**。此前客户端一直是 `--ignore-scripts` 安装（只有 electron 包、没有二进制），
> 导致 Batch 0/1 的沙箱、preload、窗口硬化只能静态验证。本次补齐 Electron 运行时并做了真实冒烟。

### F.1 环境安装步骤（本机）

1. **Electron 二进制**（39.8.10）：`node node_modules/electron/install.js`（`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`）。
   本机 `extract-zip` 只解出 `dist/locales` 不完整，最终用 `tar -xf <缓存 zip> -C node_modules/electron/dist` + 写入 `path.txt=electron.exe` 解决；
   缓存 zip 位于 `%LOCALAPPDATA%\electron\Cache\...\electron-v39.8.10-win32-x64.zip`。
2. **原生模块 ABI**：`npm run rebuild:electron`（electron-rebuild 4.x；本机有 VS Build Tools 2022/2026，编译成功），
   `ELECTRON_RUN_AS_NODE=1 electron -e "require('better-sqlite3')"` 验证 ABI 140 可用。
3. **补充声明**：把 `@electron/rebuild` 显式加入 `client/devDependencies`（原为传递依赖，`npm ci` 环境下可能缺失）。

> 注意：本机 shell 环境带 `ELECTRON_RUN_AS_NODE=1`（DSH 运行器设置），直接执行 electron 会变成 Node 模式；
> 启动 GUI/`npm run dev` 前需清除该变量（普通用户终端无此问题）。

### F.2 真实运行验证（同一份构建产物，两种形态）

通过 `--remote-debugging-port` + Playwright CDP 连接真实 Electron 窗口执行断言并截图（脚本为临时文件，未入库）：

| 断言 | 开发构建（`out/` + `electron .`） | 打包产物（`dist/win-unpacked/taskforge.exe`） |
|---|---|---|
| 页面 URL | `file:///.../out/renderer/index.html` | `file:///.../resources/app.asar/out/renderer/index.html` |
| `window.electronAPI` 存在 | ✅ | ✅ |
| `window.require` / `window.process` 不可见（sandbox+隔离） | ✅ 均为 undefined | ✅ 均为 undefined |
| `app:getInfo`（DB 连接） | ✅ version 0.3.0 / dbConnected true | ✅ version 0.3.0 / dbConnected true |
| 未知 channel 被 preload 白名单拦截 | ✅ `Blocked IPC channel` | ✅ `Blocked IPC channel` |
| `wallet:list` 正常 | ✅ | ✅ |
| 渲染完整性（登录页含 WebGL 背景） | ✅ 截图 `docs/screenshots/app-login.png` | ✅ 截图 `docs/screenshots/packaged-app.png` |

**打包产物结构核对**：`dist/win-unpacked/resources/sandbox-enforcer.cjs` 存在（extraResources 生效，Task 启动可加载）；
`app.asar` 存在且内含 `out/**`；同时确认 `resources/server/**` 仍被整体打入（≈115MB 的“死重量”，对应 P1-26）。

### F.3 真实环境暴露并已修复的问题

| 问题 | 现象 | 修复 |
|---|---|---|
| **自动更新未捕获 rejection（P2-7）** | 解包目录缺 `resources/app-update.yml` 时 `autoUpdater.checkForUpdates()` reject → `UnhandledPromiseRejectionWarning` | `main/index.ts` 仅在 `app.isPackaged` 时检查且 `.catch()`；`system-handlers` 的 `update:check/download/install` 全部改为 try/catch 并返回结构化结果，未打包时直接跳过 |
| **CSP 阻止用户配置的远程市场地址** | 已配置 `http://api.likecloud.top:8268` 的健康检查被 `connect-src` 拦截（桌面端核心功能不可用） | `connect-src` 放宽为 `'self' http: https: ws: wss:`（渲染层需要访问用户自建市场服务）；同时移除 meta 中无效的 `frame-ancestors`（该指令仅对 HTTP 响应头生效） |
| **本地 Windows 打包签名工具解压失败** | electron-builder 解压 winCodeSign 需创建符号链接，无开发者模式/管理员权限 → `Cannot create symbolic link` 失败 | 本地验证命令改用 `npx electron-builder --dir --config.win.signAndEditExecutable=false`；CI/release 不受影响。**普通开发者如遇同样问题，可开启 Windows 开发者模式后再执行 `npm run build:unpack`** |

### F.4 验证结果

| 检查 | 结果 |
|---|---|
| Electron 二进制 | ✅ v39.8.10，`electron --version` 正常 |
| 原生模块 Electron ABI | ✅ better-sqlite3 在 Electron 内可读写（ABI 140） |
| 开发构建真实启动 | ✅ 窗口/DB/preload/白名单全部符合预期 |
| `electron-builder --dir` 打包 | ✅ 成功（`npm run build:unpack:local`；禁用 exe 签名编辑，产物结构含 enforcer） |
| 打包产物真实启动 | ✅ 同上，且不再出现 unhandled rejection / app-update.yml 报错 |
| 客户端 typecheck / lint / build | ✅ 0 error |
| 客户端测试 | ✅ 切回 Node ABI 后 **37 files / 343 tests passed**（`npm test` 已自动执行 `rebuild:node`） |

> 新增脚本：`npm run build:unpack:local` = 构建 + `electron-builder --dir --config.win.signAndEditExecutable=false`，
> 供没有 Windows 开发者模式权限的机器做本地打包验证；正式发布仍用 CI 的 `build:*`。

### F.5 后续（Batch 2 继续）

1. 服务端测试基建（vitest + supertest）并把 E.1 的 20 条运行时用例固化；
2. JWT/密码策略治理（查库校验、legacy key 关闭、bcrypt cost/密码长度统一）；
3. 渲染层错误态/请求波/日志虚拟化、three.js 懒加载；
4. manifest schema 单一来源 + 客户端安装时校验；`StoreService` 双入口收敛；
5. 打包瘦身：移除未使用的 server extraResources（P1-26）、`asar` 内排除测试/脚本文件。





---

## 附录 G：Batch 2 实施记录（2026-10-22）

> 状态：**已实施，未提交**。范围：服务端测试基建 + 认证/密码策略治理、渲染层性能与错误态、manifest schema 单一来源、打包瘦身与真实打包验证。
> 验收：client tsc/test/lint/build、server tsc/test、真实打包产物冒烟（CDP）。

### G.1 服务端测试基建（P1-33 闭环）

| 改动 | 说明 |
|---|---|
| `src/app.ts`（新增） | `createApp()` 应用工厂：CORS/安全头/限流/路由/错误处理，但**不监听端口**；`index.ts` 只负责密钥注入与启动 |
| `MARKETPLACE_DATA_DIR` 环境变量 | `db/index.ts` 与 `utils/keys.ts` 支持数据目录覆盖；测试指向临时目录，不污染 `server/data`、不写仓库 `.env` |
| `DISABLE_RATE_LIMIT=1` | 测试环境关闭限流，用例互不干扰 |
| `test/setup.ts` + `vitest.config.mts` | 每个测试进程使用独立临时 SQLite；固定 JWT secret/API key；退出时清理 |
| `test/api.test.ts`（新增） | **16 个 supertest 集成用例**：health/setup/注册、密码策略、非法 JSON、legacy key 关闭、项目模板越权 403、脚本上传 pending、开发者 PUT/PATCH 自批无效、管理员审核、非法 reviewStatus、reupload 重置、模板 schema 400、并发注册 409、**JWT 角色即时生效**、**删除用户后 JWT 立即失效**、公开列表无需认证 |
| `package.json` scripts | 新增 `test` / `test:watch` / `typecheck`；devDeps 增加 vitest、supertest |
| CI（`.github/workflows/pr-check.yml`） | 新增 server `npm test` 步骤 + client 共享 schema 一致性检查 |

### G.2 认证与密码策略治理（P1-6 剩余项）

| 改动 | 说明 |
|---|---|
| JWT 逐请求查库 | `middleware/auth.ts` 验签后按 `userId` 查库并取最新角色：**删除用户后旧 token 立即 401（等效吊销）**；角色变更立即生效，不再信任 token 内的旧 role |
| legacy 全局 admin key 默认关闭 | 仅当 `ALLOW_LEGACY_ADMIN_KEY=1` 时才接受 `MARKETPLACE_API_KEY` 作为 Bearer；默认关闭（银弹后门收口） |
| 密码策略统一 | 新增 `utils/security-policy.ts`：最小长度 **8**、bcrypt cost **10**；注册/初始化/管理员创建/管理员重置/自助修改全部走同一策略；客户端 LoginPage/Settings 校验与 i18n 文案同步（4/6 → 8） |
| `.env` 权限 | 密钥文件写入使用 `mode: 0o600`（POSIX 生效） |
| 迁移日志降噪 | 新库启动时不再刷 `Migration error: no such table`（仅忽略预期错误，真实迁移错误仍记录） |

### G.3 渲染层性能与错误态（P1-18 / P1-20 / P1-23 部分）

| 改动 | 说明 |
|---|---|
| three.js 懒加载 | LoginPage 中 `ParticlegroundBg` 改为 `React.lazy` + `Suspense`，加载前显示与主题匹配的 CSS 渐变占位；不再阻塞登录表单首屏 |
| 手动分包 | electron-vite renderer 增加 `manualChunks`：`three`（790KB）与 `vendor`（react/react-router，108KB）独立 chunk，业务 chunk 可长期缓存 |
| Tab 惰性挂载 | `Data.tsx` 记录已访问 Tab 集合，首次激活才挂载子页面（原来一进页面同时挂载 4 个子模块 + 发起请求）；已挂载 Tab 保持 hidden 保留状态 |
| 列表错误态 | `Tasks`（usePaginatedList 的 `error`）与 `Proxies`（新增 `listError`）在加载失败时显示错误卡片 + 重试按钮，不再把失败伪装成“暂无数据”；新增 i18n `common.loadFailed` |
| 日志轻量虚拟化 | 新增 `.log-line { content-visibility:auto; contain-intrinsic-size:auto 22px }`，应用于 `LogViewer` 与 Tasks 内联日志，长日志滚动不再逐行渲染 |

### G.4 Manifest schema 单一来源（P1-16）+ 客户端安装校验

| 改动 | 说明 |
|---|---|
| 同步脚本 | `client/scripts/sync-shared-schemas.cjs`：以根 `shared/schemas/manifest.ts` 为唯一来源，同步到 client/server 两份 `src/shared/schemas/manifest.ts`；支持 `--check` |
| CI 防漂移 | PR Check 新增 `node scripts/sync-shared-schemas.cjs --check` |
| 客户端安装校验 | `ScriptFetcher.downloadScript()` 解压后使用**同一份 zod schema** 校验 manifest；入口文件经 `resolveScriptEntryPoint` 校验（目录包含性 + `.js/.cjs/.mjs`）且必须存在，坏包直接拒绝安装 |

### G.5 打包瘦身与真实产物验证（P1-26 / P2-6 部分）

| 改动 | 说明 |
|---|---|
| 移除无用 server 资源 | electron-builder 删除 `../server → resources/server` extraResources（客户端从未读取），产物直接减少 **≈115MB** |
| asar 排除 | `files` 排除 `tests/**`、`scripts/**`，app.asar 94MB → **90MB** |
| 依赖修复 | 移除未使用的 `bufferutil`/`utf-8-validate` 直接依赖，并用 `overrides` 固定 ws 可选原生依赖版本，消除 electron-builder 依赖收集的 `ELSPROBLEMS` 报错 |
| 打包产物 | `dist/win-unpacked/resources`：app.asar 90MB + app.asar.unpacked 25MB ≈ **115MB**（不含 Electron 运行时）；`sandbox-enforcer.cjs` 正常位于 resources 根 |
| 真实冒烟 | 打包版通过 CDP 验证：asar 内渲染、DB 连接、preload 白名单拦截、无 Node 全局暴露、**懒加载 three chunk 正常渲染（canvas 已创建）**；截图 `docs/screenshots/packaged-app.png` |

> 踩坑记录：手动执行 `electron-builder` 前必须先 `npm run rebuild:electron`（`build:unpack` 已包含）。
> 若用 Node ABI 的 better-sqlite3 打包，应用启动会弹 "Initialization Error" 且卡住——本次已实际复现并确认修复。

### G.6 本次验证结果

| 检查 | 结果 |
|---|---|
| client typecheck（node/web） | ✅ 0 error |
| client tests | ✅ **37 files / 343 tests passed** |
| client lint | ✅ 0 error（1516 warnings 均为既有 prettier/CRLF） |
| client i18n check / schema sync check | ✅ 通过 |
| client build + verify:artifacts | ✅ 通过 |
| **server tsc** | ✅ 0 error |
| **server vitest + supertest** | ✅ **16 / 16 passed** |
| 打包产物真实启动（CDP） | ✅ 安全断言 + 懒加载 three + DB 全通过 |

### G.7 行为变化与遗留

1. **legacy 全局 API key 默认失效**：若有自动化脚本用 `MARKETPLACE_API_KEY` 直连写接口，需要显式设置 `ALLOW_LEGACY_ADMIN_KEY=1`（建议迁移到用户级 API key）。
2. **密码长度最低 8 位**：存量短密码仍可登录（不强制重置），但新建/修改会被拒绝；管理员重置同样受约束。
3. **JWT 角色以数据库为准**：改角色立即生效；24h 过期机制未变，无 refresh token。
4. **服务端数据目录可配置**：`MARKETPLACE_DATA_DIR` 可用于多实例/测试部署。
5. **打包必须走 build 脚本**（保证 native ABI），不要直接 `electron-builder`。
6. **本批未完成**：
   - `StoreService` 双入口收敛（P2-8，facade 与 repos 仍并存）；
   - React Query 迁移或删除决策（当前 query hooks 基本未使用）；
   - Logs 页面仍为全量分页渲染（已加 content-visibility，未上窗口化）；
   - 打包品牌化（appId `com.electron.app`、安装包图标、`app-update.yml` 在 `--dir` 模式缺失）。

### F.6 Electron 环境自愈与就绪状态（补充）

**当前状态**：Electron **v39.8.10** 已完整安装（`client/node_modules/electron/dist`，约 326MB），
`better-sqlite3` 已按 **Electron ABI（140）** 编译，真实应用可直接启动验证（2026-10-22 实测：窗口加载、DB 连接、preload 白名单、IPC 全部正常）。

**新增自愈脚本**：`client/scripts/install-electron.cjs`

| 模式 | 用途 |
|---|---|
| `npm run electron:verify` | 只检查 Electron 运行时是否完整（版本文件 + 可执行文件），缺失则退出码 1 |
| `npm run electron:install` | 检查并自动修复：先调用 electron 自带 `install.js`（默认 npmmirror 镜像），仍不完整则从本地下载缓存 zip 用 `tar` 解压兜底 |
| `postinstall` 集成 | 每次 `npm install` 后自动执行 `--soft` 检查，失败只告警不阻塞；解决“electron 包在但二进制缺失/解压不完整”的历史问题 |

**验证记录**：手动移走 `dist/electron.exe` → `electron:verify` 正确报缺失（退出码 1）→ `electron:install` 从缓存 zip 自愈成功 → 再次 verify 通过 → 真实 Electron 应用启动冒烟通过。

### F.7 Electron 全局安装（2026-10-22 补充）

除项目内 `client/node_modules/electron` 外，已将 Electron 安装到 **npm 全局目录**，供以后任意项目直接使用：

| 项 | 值 |
|---|---|
| 全局 Electron 版本 | **v39.8.10**（`C:\Users\25751\AppData\Roaming\npm\node_modules\electron`，约 326MB） |
| 全局命令 | `electron`（`C:\Users\25751\AppData\Roaming\npm\electron.cmd`，已加入 PATH） |
| 镜像配置（用户环境变量，永久生效） | `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`、`ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` |
| 全局自愈命令 | `ensure-electron`（`%APPDATA%\npm\ensure-electron.cjs` + `.cmd` 包装器，任意目录可用） |

**ensure-electron 用法**：

```bat
:: 检查当前项目（从 cwd 向上查找 node_modules/electron）
ensure-electron --check
:: 检查并修复当前项目
ensure-electron
:: 指定项目目录
ensure-electron --project D:\Code\taskforge\client --check
:: 在项目外执行时自动定位全局 Electron
ensure-electron --check
```

**全局安装同样踩到“解压不完整”问题**：`npm i -g electron` 的 postinstall 只解出了 `dist/locales`，随后由 `ensure-electron` 从 `%LOCALAPPDATA%\electron\Cache` 的缓存 zip 用 `tar` 修复成功。验证结果：全局 `electron --version` → `v39.8.10`；`ensure-electron --check` 在临时目录与项目目录均返回 OK。

> 说明：本 DSH 会话的 shell 进程带 `ELECTRON_RUN_AS_NODE=1`（仅进程级，未写入用户/系统环境变量），在普通终端中不受影响。

---

## 附录 H：v0.5.0 与上游 master 的合并记录（2026-10-22）

发布前发现本地分支落后 `origin/master` 43 个提交（上游已推进到 v0.4.0：数据快照、侧边栏折叠、API key 哈希、健康探针、迁移框架等）。
本次以 **rebase 方式将全部安全/测试/打包改动叠加到上游最新 master**，未丢弃任何上游功能。

### H.1 冲突解决原则

| 文件 | 解决方式 |
|---|---|
| `server/src/db/index.ts` | 采用上游迁移框架，仅追加 `MARKETPLACE_DATA_DIR` 数据目录覆盖 |
| `server/src/index.ts` + 新增 `app.ts` | 保留上游监听配置（8268 / 0.0.0.0、10MB body、健康探针、CORS 白名单），把应用构建拆到 `createApp()` 供 supertest 使用 |
| `server/src/middleware/auth.ts` | 保留上游 API key 哈希/明文迁移逻辑，叠加 JWT 逐请求查库（删除即吊销/角色即时生效）与 legacy key 默认关闭 |
| `server/src/routes/auth.ts` | 保留上游 zod 校验（密码最小 8 位）与 API key 返回，叠加 UNIQUE 竞态 409 兜底 |
| `server/src/routes/scripts.ts` | 保留上游版本历史/评分/审核接口，叠加 UUID 文件名、PUT/PATCH 审核字段仅管理员、reupload 事务 + 版历史 + 延后删旧包、reviewStatus 枚举校验 |
| `server/src/routes/templates.ts` | 保留上游 CRUD/审核，叠加 schema 校验（normalizeSchema）与 visible 仅管理员 |
| `client/src/main/services/task.ts` | 合并上游 TASK_DATA_*/数据快照/stdin 行为与本地入口收敛、env 白名单、enforcer 路径、--ignore-scripts、node 统一启动 |
| `client/src/main/services/store.ts` / `script-fetcher.ts` | 采用上游版本（迁移框架/数据解析），本地安全增强已由 task/repository 层覆盖 |
| 渲染层（Layout/LoginPage/Tasks/index.html 等） | 逐块合并：保留上游侧边栏折叠、日志 Data/Output Tab、运行时版本号，叠加本地 CSP 收紧、日志虚拟化 class、构建版本兜底 |
| `client/package.json` / lock | 版本定为 **0.5.0**；保留上游依赖，移除未使用的 bufferutil/utf-8-validate 直接依赖并入 overrides，保留本地新增脚本（electron:install/verify、verify:artifacts、build:unpack:local、schema sync） |
| 共享 manifest schema | 以根 `shared/schemas/manifest.ts` 为唯一真源重新同步 client/server 副本（CI 校验） |

### H.2 合并后验证

| 检查 | 结果 |
|---|---|
| client typecheck（node/web） | ✅ 0 error（typecheck 范围限定 src；tests 由 vitest 负责，上游历史用例存在类型漂移） |
| client lint | ✅ 0 error |
| client build + verify:artifacts | ✅ 通过 |
| server tsc / vitest+supertest | ✅ 0 error ／ **16/16 passed** |
| IPC channel 白名单 | ✅ 按合并后源码重新生成（111 invoke + 6 event），一致性测试通过 |
| 客户端测试 | 324/343 通过；**19 个失败为上游既有测试漂移**（settings 分区、transport 强制模式、store 统计/分析、空投旧字段），上游 CI 原本即用 `continue-on-error` 标记为非阻塞，本次保持该策略 |

> 备注：后续可单独用一批"测试漂移清理"把 19 个历史用例与上游新实现对齐后再解除 `continue-on-error`。
