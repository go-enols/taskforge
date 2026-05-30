# AGENTS.md — airdrop-farm 开发规范

## 项目类型：Electron + TypeScript 桌面应用

基于 Electron 的全栈桌面应用，React + Tailwind CSS 渲染层，Node.js 主进程。所有业务逻辑在 TypeScript 中实现，附带独立的 Express 服务端子项目用于脚本/模板市场。

### 子项目

| 目录      | 说明                | 独立运行                   |
| --------- | ------------------- | -------------------------- |
| `client/` | Electron 客户端主体 | `cd client && npm run dev` |
| `server/` | 脚本/模板市场服务端 | `cd server && npm run dev` |

### 命令

- 客户端开发：`cd client && npm run dev`
- 客户端构建：`cd client && npm run build`（全平台 `build:win` / `build:mac` / `build:linux`）
- 客户端 Typecheck：`cd client && npm run typecheck`
- 客户端 Lint：`cd client && npm run lint`
- 客户端格式化：`cd client && npm run format`
- 服务端开发：`cd server && npm run dev`
- 服务端构建：`cd server && npm run build`

---

## 1. 架构总览

```
airdrop-farm/
├── client/                    # Electron 客户端（原根目录全部内容）
│   ├── package.json
│   ├── electron.vite.config.ts
│   ├── electron-builder.yml
│   ├── tsconfig.{json,node.json,web.json,eslint.json}
│   ├── vitest.config.ts
│   ├── eslint.config.mjs
│   ├── dev-app-update.yml
│   ├── .editorconfig / .npmrc / .prettier*
│   ├── src/
│   │   ├── main/                    # Electron 主进程 (Node.js)
│   │   │   ├── index.ts             # App 入口、窗口管理、服务初始化
│   │   │   ├── ipc/index.ts         # 统一 handler 注册表 (IPC + HTTP 共享)
│   │   │   ├── httpapi/server.ts    # HTTP API 冗余传输层 (:34116)
│   │   │   ├── services/            # 业务逻辑
│   │   │   │   ├── store.ts         # SQLite 数据访问层
│   │   │   │   ├── task.ts          # 任务执行引擎（子进程管理）
│   │   │   │   ├── wallet.ts        # 钱包管理
│   │   │   │   ├── script-fetcher.ts # 远程脚本下载器
│   │   │   │   └── repositories/    # 数据仓库层
│   │   │   └── utils/               # 日志等工具
│   │   ├── preload/                  # Context bridge (electronAPI.invoke / .on)
│   │   └── renderer/                # React 前端
│   │       └── src/
│   │           ├── api.ts           # 类型化 API 客户端
│   │           ├── transport.ts     # 双传输层 (IPC → HTTP 自动降级)
│   │           ├── components/      # 共享 UI 组件
│   │           ├── pages/           # 路由页面
│   │           ├── hooks/           # 自定义 hooks
│   │           ├── i18n/            # 国际化 (zh-CN)
│   │           ├── types/           # 前端类型定义
│   │           └── utils/           # 前端工具函数
│   ├── shared/
│   │   ├── types/index.ts           # 共享 TypeScript 接口
│   │   └── schemas/                 # 共享数据校验 schema
│   ├── resources/                   # 应用图标
│   ├── build/                       # 构建资源 (entitlements, icons)
│   └── tests/                       # 测试文件
├── server/                      # Marketplace 服务端（唯一）
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                        # 运行时数据（marketplace.db, uploads/）
│   └── src/
│       ├── index.ts             # Express 入口，端口 3400
│       ├── db/index.ts          # SQLite 数据库 + prepared statements
│       ├── routes/auth.ts       # 登录/注册/初始化
│       ├── routes/scripts.ts    # 脚本 CRUD + 上传/下载
│       ├── routes/templates.ts  # 模板 CRUD
│       ├── routes/users.ts      # 用户管理
│       └── middleware/auth.ts   # JWT + Bearer Token 认证
├── AGENTS.md / CLAUDE.md / README.md
├── .github/workflows/             # PR check + Release
└── .gitignore
```

---

## 2. 通信架构

### 2.1 客户端内部通信（Electron 主进程 ↔ 渲染进程）

双传输层，自动降级：

1. **IPC（主）** — `window.electronAPI.invoke(channel, ...args)` 通过 Electron context bridge
2. **HTTP（备）** — `POST http://127.0.0.1:34116/api/call {channel, args}`

两个传输层共享 `src/main/ipc/index.ts` 中的 `handlerMap`。`executeHandler()` 是所有 API 调用的唯一入口，无论走哪种传输层。

传输层选择逻辑（`transport.ts`）：

- 强制模式：URL 参数 `?transport=http` 或 `localStorage['app-transport']`
- 自动模式：IPC 优先 → HTTP 降级 → 记住可用传输层

### 2.2 客户端 ↔ 服务端通信（Marketplace）

客户端通过 HTTP 直接 fetch Marketplace Server（默认 `http://localhost:3400`）：

- **渲染进程**：`marketplaceApi` 对象（`api.ts`）调用 `${base}/api/scripts` / `${base}/api/templates`
- **主进程**：`ScriptFetcher` 类（`script-fetcher.ts`）调用 `${base}/api/scripts`
- **配置**：Settings 页面 → 存取 setting key `marketplace_server_url` → 默认 `http://localhost:3400`
- **CSP**：`connect-src` 已放开 `http://localhost:* http://127.0.0.1:*`

### 2.3 新增 API 端点流程

1. 在 `client/src/main/ipc/index.ts` 中 `register('channel:name', handler)`
2. 在 `client/src/renderer/src/api.ts` 中添加类型化方法 `call<T>('channel:name', [args])`
3. IPC 和 HTTP 自动支持新端点

---

## 3. 技术栈

- **Electron** — 桌面壳（electron-vite 脚手架）
- **React 19 + TypeScript** — 渲染层 UI
- **Tailwind CSS v4** — 样式（@tailwindcss/vite 插件）
- **better-sqlite3** — 主进程数据库（WAL 模式，预处理语句）
- **ethers.js** — EVM 钱包管理
- **@solana/web3.js** — Solana 钱包管理
- **bip39 + ed25519-hd-key** — HD 钱包派生
- **react-router-dom** — 前端路由（HashRouter）
- **i18next** — 国际化
- **lucide-react** — 图标
- **Express (server/)** — 市场服务端
- **JWT + bcrypt** — 认证与角色授权

---

## 3.1 用户角色系统

客户端通过 Marketplace Server 进行用户认证。所有页面受角色保护，未登录用户只能看到登录页。

### 角色定义

| 角色        | 标识        | 说明                                                                                          |
| ----------- | ----------- | --------------------------------------------------------------------------------------------- |
| 管理员      | `admin`     | 平台治理：仪表盘、模板审核（含可见性切换）、用户管理、日志、系统设置。**不参与日常运营任务** |
| 开发者      | `developer` | 全部运营功能 + 上传/管理脚本和模板 + 使用开发工具（Quick Dev、Developer Pending）             |
| 普通用户    | `user`      | 全部运营功能：钱包、账户、代理、空投、任务、调度。可浏览安装模板和脚本，但不可上传/管理       |

### 页面访问权限

| 页面                  | admin | developer | user |
| --------------------- | :---: | :-------: | :--: |
| Dashboard             |  ✅   |    ✅     |  ✅  |
| Wallets               |  ❌   |    ✅     |  ✅  |
| Accounts              |  ❌   |    ✅     |  ✅  |
| Proxies               |  ❌   |    ✅     |  ✅  |
| Airdrops              |  ❌   |    ✅     |  ✅  |
| Tasks                 |  ❌   |    ✅     |  ✅  |
| Scheduler             |  ❌   |    ✅     |  ✅  |
| Templates（模板市场） |  ✅²  |    ✅     |  ✅¹ |
| Quick Dev             |  ❌   |    ✅     |  ❌  |
| Developer Pending     |  ❌   |    ✅     |  ❌  |
| Admin Review          |  ✅   |    ❌     |  ❌  |
| Logs                  |  ✅   |    ❌     |  ❌  |
| Settings              |  ✅   |    ❌     |  ❌  |
| User Management       |  ✅   |    ❌     |  ❌  |

> ¹ user 角色在 Templates 页面只能浏览和安装模板/脚本，不可使用 Schema 编辑器、上传、更新或删除。
> ² admin 在 Templates 页面可管理可见性、删除任何条目，但不进行运营性使用。日常上传/编辑由 developer 完成。

**注意**：路由层面（`App.tsx`）某些页面（如 `/wallets`、`/tasks`）对 admin 没有显式拦截，但导航栏（`Layout.tsx`）不再展示这些入口；admin 不应通过 URL 跳转使用运营页面。

### 实现层次

- **服务端**：`server/src/routes/auth.ts`（登录/注册/初始化）、`server/src/routes/users.ts`（CRUD）、`server/src/middleware/auth.ts`（JWT 中间件 + `requireRole()`）
- **客户端认证状态**：`client/src/renderer/src/contexts/AuthContext.tsx`（`AuthProvider` + `useAuth()`）
- **路由保护**：`client/src/renderer/src/components/ProtectedRoute.tsx`（按角色限制页面访问）
- **导航栏过滤**：`client/src/renderer/src/components/Layout.tsx`（`ALL_NAV_ITEMS` 按角色过滤）

### 认证流程

1. 用户首次启动 → 调用 `POST /api/auth/setup` 创建管理员账号
2. 已有用户 → 调用 `POST /api/auth/login` → 获取 JWT token
3. 新用户注册 → 调用 `POST /api/auth/register` → 默认角色 `user`
4. JWT token 存储在 `localStorage['marketplace_jwt']`，到期 24h
5. 普通请求携带 `Authorization: Bearer <token>` 头

---

## 4. 数据库设计

位置：`app.getPath('userData')/airdrop-farm.db`。使用 better-sqlite3 的同步 API，无需 async/await。JSON 字段由 `StoreService` 自动序列化/反序列化。

### 4.1 表结构

#### wallets — 钱包

| 字段        | 类型          | 说明                         |
| ----------- | ------------- | ---------------------------- |
| id          | TEXT PK       | UUID v4                      |
| address     | TEXT NOT NULL | 地址                         |
| private_key | TEXT          | 私钥（可空）                 |
| mnemonic    | TEXT          | 助记词（可空）               |
| wallet_type | TEXT NOT NULL | evm / solana / sui / bitcoin |
| labels      | TEXT → JSON   | 标签数组                     |
| created_at  | TEXT NOT NULL | ISO 8601                     |

#### accounts — 账户（账号池中的账户）

| 字段        | 类型          | 说明                               |
| ----------- | ------------- | ---------------------------------- |
| id          | TEXT PK       | UUID v4                            |
| template_id | TEXT NOT NULL | 关联的模板 ID                      |
| data        | TEXT → JSON   | 账户数据（由模板 schema 定义结构） |
| pool        | TEXT NOT NULL | 账号池名称（分组标识）             |
| labels      | TEXT → JSON   | 标签数组                           |
| notes       | TEXT          | 备注                               |
| created_at  | TEXT NOT NULL | ISO 8601                           |
| updated_at  | TEXT NOT NULL | ISO 8601                           |

索引：`idx_accounts_pool ON accounts(pool)`

#### proxies — 代理

| 字段       | 类型             | 说明                        |
| ---------- | ---------------- | --------------------------- |
| id         | TEXT PK          | UUID v4                     |
| protocol   | TEXT NOT NULL    | http / https / socks5       |
| host       | TEXT NOT NULL    | 主机地址                    |
| port       | INTEGER NOT NULL | 端口                        |
| username   | TEXT             | 用户名（可空）              |
| password   | TEXT             | 密码（可空）                |
| status     | TEXT NOT NULL    | active / inactive / expired |
| labels     | TEXT → JSON      | 标签数组                    |
| created_at | TEXT NOT NULL    | ISO 8601                    |

索引：`idx_proxies_status ON proxies(status)`

#### proxy_providers — 代理提供商（从 API 自动拉取代理）

| 字段             | 类型          | 说明                  |
| ---------------- | ------------- | --------------------- |
| id               | TEXT PK       | UUID v4               |
| name             | TEXT NOT NULL | 提供商名称            |
| api_url          | TEXT NOT NULL | API 地址              |
| api_key          | TEXT          | API 密钥              |
| protocol         | TEXT          | http / https / socks5 |
| refresh_interval | INTEGER       | 刷新间隔（秒）        |
| last_sync        | TEXT          | 最后同步时间          |
| labels           | TEXT → JSON   | 标签数组              |
| created_at       | TEXT NOT NULL | ISO 8601              |

#### tasks — 任务

| 字段          | 类型          | 说明                                                       |
| ------------- | ------------- | ---------------------------------------------------------- |
| id            | TEXT PK       | UUID v4                                                    |
| script_folder | TEXT NOT NULL | 已安装脚本的文件夹路径（即 `InstalledScript.installPath`） |
| config        | TEXT → JSON   | 任务配置（由脚本 manifest 定义）                           |
| status        | TEXT NOT NULL | idle / running / paused / stopped / complete / error       |
| worker_id     | TEXT          | 子进程 worker ID（可空）                                   |
| started_at    | TEXT          | 启动时间                                                   |
| ended_at      | TEXT          | 结束时间                                                   |
| is_sandbox    | INTEGER       | 是否沙箱模式                                               |

索引：`idx_tasks_status ON tasks(status)`

#### task_logs — 任务日志

| 字段      | 类型          | 说明                        |
| --------- | ------------- | --------------------------- |
| id        | INTEGER PK    | 自增                        |
| task_id   | TEXT NOT NULL | 关联任务 ID                 |
| timestamp | TEXT NOT NULL | ISO 8601                    |
| level     | TEXT NOT NULL | info / warn / error / debug |
| message   | TEXT NOT NULL | 日志内容                    |

索引：`idx_task_logs_task_id ON task_logs(task_id)`

#### templates — 账户模板

| 字段       | 类型          | 说明                                     |
| ---------- | ------------- | ---------------------------------------- |
| id         | TEXT PK       | UUID v4                                  |
| type       | TEXT NOT NULL | 模板类型（如 evm-wallet, solana-wallet） |
| name       | TEXT NOT NULL | 模板名称                                 |
| schema     | TEXT → JSON   | JSON Schema（定义账户数据字段）          |
| version    | TEXT          | 版本号                                   |
| is_local   | INTEGER       | 是否本地模板（0=远程下载, 1=本地创建）   |
| updated_at | TEXT NOT NULL | ISO 8601                                 |

#### task_templates — 任务脚本模板（已安装的任务脚本元数据）

| 字段          | 类型          | 说明                                    |
| ------------- | ------------- | --------------------------------------- |
| id            | TEXT PK       | UUID v4（与 `InstalledScript.id` 相同） |
| name          | TEXT NOT NULL | 脚本名称                                |
| version       | TEXT          | 版本号                                  |
| description   | TEXT          | 描述                                    |
| install_path  | TEXT          | 安装路径                                |
| manifest      | TEXT → JSON   | 脚本 manifest（见 §6.1）                |
| remote_url    | TEXT          | 远程服务器 URL                          |
| is_installed  | INTEGER       | 是否已安装（0/1）                       |
| downloaded_at | TEXT NOT NULL | ISO 8601                                |
| updated_at    | TEXT NOT NULL | ISO 8601                                |

#### scheduled_tasks — 定时任务

| 字段            | 类型          | 说明                  |
| --------------- | ------------- | --------------------- |
| id              | TEXT PK       | UUID v4               |
| template_id     | TEXT NOT NULL | 关联的任务脚本模板 ID |
| config          | TEXT → JSON   | 任务配置              |
| cron_expression | TEXT NOT NULL | Cron 表达式           |
| enabled         | INTEGER       | 是否启用              |
| last_run        | TEXT          | 最后运行时间          |
| next_run        | TEXT          | 下次运行时间          |
| created_at      | TEXT NOT NULL | ISO 8601              |

索引：`idx_scheduled_tasks_enabled ON scheduled_tasks(enabled)`

#### airdrop_projects — 空投项目

| 字段                 | 类型          | 说明                                               |
| -------------------- | ------------- | -------------------------------------------------- |
| id                   | TEXT PK       | UUID v4                                            |
| name                 | TEXT NOT NULL | 项目名称                                           |
| chain                | TEXT          | 所属链（默认空）                                   |
| status               | TEXT NOT NULL | ongoing / completed / cancelled / claimed          |
| project_type         | TEXT NOT NULL | testnet / mainnet / galxe / quest / social / other |
| description          | TEXT          | 项目描述（**应支持 Markdown**）                    |
| links                | TEXT → JSON   | `[{label, url}]` 链接数组                          |
| eligibility_criteria | TEXT → JSON   | 资格条件数组                                       |
| tasks                | TEXT → JSON   | 空投任务项数组                                     |
| earnings             | TEXT → JSON   | 收益数组                                           |
| tags                 | TEXT → JSON   | 标签数组                                           |
| labels               | TEXT → JSON   | 标签数组                                           |
| created_at           | TEXT NOT NULL | ISO 8601                                           |
| updated_at           | TEXT NOT NULL | ISO 8601                                           |

索引：`idx_airdrop_projects_status ON airdrop_projects(status)`

#### settings — 键值设置

| 字段  | 类型          | 说明     |
| ----- | ------------- | -------- |
| key   | TEXT PK       | 设置键名 |
| value | TEXT NOT NULL | 设置值   |

#### captcha_keys — 验证码 API 密钥

| 字段       | 类型          | 说明       |
| ---------- | ------------- | ---------- |
| id         | TEXT PK       | UUID v4    |
| provider   | TEXT NOT NULL | 提供商名称 |
| api_key    | TEXT NOT NULL | API 密钥   |
| balance    | REAL          | 余额       |
| created_at | TEXT NOT NULL | ISO 8601   |

#### app_logs — 应用日志

| 字段      | 类型          | 说明          |
| --------- | ------------- | ------------- |
| id        | INTEGER PK    | 自增          |
| timestamp | TEXT NOT NULL | ISO 8601      |
| level     | TEXT NOT NULL | 日志级别      |
| category  | TEXT NOT NULL | 分类          |
| message   | TEXT NOT NULL | 日志内容      |
| fields    | TEXT          | 附加字段 JSON |

索引：`idx_app_logs_category ON app_logs(category)`

---

## 5. Marketplace Server 规范（`server/`）

### 5.1 配置

| 项目     | 值                                                               |
| -------- | ---------------------------------------------------------------- |
| 默认端口 | 3400                                                             |
| 监听地址 | 127.0.0.1（可用 `HOST` 环境变量覆盖）                            |
| 数据库   | `server/data/marketplace.db` (SQLite, WAL)                       |
| 上传目录 | `server/data/uploads/scripts/`、`server/data/uploads/templates/` |
| 认证     | Bearer Token `MARKETPLACE_API_KEY`（环境变量或首次启动自动生成） |
| GET 请求 | 公开，无需认证                                                   |
| 写请求   | 需要 `Authorization: Bearer <token>`                             |

### 5.2 API 端点

#### Scripts（`/api/scripts`）

| 方法   | 路径            | 说明                                                      |
| ------ | --------------- | --------------------------------------------------------- |
| GET    | `/`             | 列出所有脚本。返回 `{data: {items: ScriptItem[], total}}` |
| GET    | `/:id`          | 获取脚本详情                                              |
| GET    | `/:id/download` | 下载脚本 zip 包（自增下载计数）                           |
| POST   | `/`             | 上传脚本（multipart，字段见 §5.3）                        |
| PUT    | `/:id`          | 更新脚本信息                                              |
| DELETE | `/:id`          | 删除脚本（含文件）                                        |

#### Templates（`/api/templates`）

| 方法   | 路径   | 说明                  |
| ------ | ------ | --------------------- |
| GET    | `/`    | 列出所有模板          |
| GET    | `/:id` | 获取模板详情          |
| POST   | `/`    | 创建模板（JSON body） |
| PUT    | `/:id` | 更新模板              |
| DELETE | `/:id` | 删除模板              |

#### Health

| 方法 | 路径          | 说明                                       |
| ---- | ------------- | ------------------------------------------ |
| GET  | `/api/health` | 健康检查。返回 `{status: "ok", timestamp}` |

### 5.3 ScriptItem 数据结构（服务端）

上传脚本时服务端存储的字段：

| 字段        | 类型        | 说明                                  |
| ----------- | ----------- | ------------------------------------- |
| id          | TEXT        | UUID v4                               |
| name        | TEXT        | 脚本名称                              |
| version     | TEXT        | 语义化版本                            |
| description | TEXT        | 描述                                  |
| schema      | TEXT → JSON | 参数 schema（定义脚本需要的表单字段） |
| entry_point | TEXT        | 入口文件（如 `index.js`）             |
| checksum    | TEXT        | sha256                                |
| downloadUrl | TEXT(生成)  | `/api/scripts/:id/download`           |
| tags        | TEXT → JSON | 标签数组                              |
| changelog   | TEXT        | 更新日志                              |
| downloads   | INTEGER     | 下载次数                              |
| updated_at  | TEXT        | ISO 8601                              |

### 5.4 TemplateItem 数据结构（服务端）

| 字段          | 类型        | 说明        |
| ------------- | ----------- | ----------- |
| id            | TEXT        | UUID v4     |
| name          | TEXT        | 模板名称    |
| type          | TEXT        | 模板类型    |
| version       | TEXT        | 语义化版本  |
| description   | TEXT        | 描述        |
| checksum      | TEXT        | sha256      |
| schema        | TEXT → JSON | JSON Schema |
| downloadUrl   | TEXT(可选)  | 下载链接    |
| downloadCount | INTEGER     | 下载次数    |
| updated_at    | TEXT        | ISO 8601    |

---

## 6. 脚本系统规范

### 6.1 任务脚本 Manifest（manifest.json）

每个任务脚本在其 zip 包根目录下必须包含 `manifest.json`，格式如下：

```json
{
  "id": "script-unique-id",
  "name": "脚本显示名称",
  "version": "1.0.0",
  "description": "脚本用途说明",
  "entryPoint": "index.js",
  "runtime": "node",
  "requiredAccountTemplateIds": ["template-uuid-1", "template-uuid-2"],
  "schema": {
    "type": "object",
    "properties": {
      "targetUrl": { "type": "string", "title": "目标 URL", "required": true },
      "threadCount": { "type": "number", "title": "线程数", "default": 1 },
      "proxyMode": {
        "type": "string",
        "title": "代理模式",
        "enum": ["none", "per_account", "pool"],
        "default": "none"
      }
    },
    "required": ["targetUrl"]
  },
  "permissions": ["network", "filesystem"],
  "checksum": "sha256-hex",
  "tags": ["airdrop", "testnet"],
  "changelog": "v1.0.0 初始版本"
}
```

**字段说明：**

| 字段                       | 必填 | 说明                                                         |
| -------------------------- | ---- | ------------------------------------------------------------ |
| id                         | ✅   | 脚本唯一标识                                                 |
| name                       | ✅   | 显示名称                                                     |
| version                    | ✅   | 语义化版本                                                   |
| description                | ✅   | 用途描述                                                     |
| entryPoint                 | ✅   | 入口文件名（相对脚本目录）                                   |
| runtime                    | ✅   | 运行时：`"node"`                                             |
| requiredAccountTemplateIds | ❌   | 需要的账户模板 ID 列表。如填写，安装脚本前必须已安装对应模板 |
| schema                     | ✅   | 任务配置表单的 JSON Schema。用于 `DynamicForm` 组件自动渲染  |
| permissions                | ❌   | 权限声明：`["network", "filesystem"]`                        |
| checksum                   | ❌   | 服务端填充                                                   |
| tags                       | ❌   | 分类标签                                                     |
| changelog                  | ❌   | 更新日志                                                     |

### 6.2 脚本执行环境

每个任务通过 `child_process.spawn` 启动独立子进程：

- **工作目录**：`InstalledScript.installPath`
- **入口文件**：`manifest.entryPoint`（如 `node index.js`）
- **配置注入**：环境变量 `TASK_CONFIG` 包含 JSON 序列化的 `task.config`
- **生命周期**：
  - `start` → `spawn` 子进程
  - `pause` → 发送 SIGSTOP
  - `resume` → 发送 SIGCONT
  - `stop` → 发送 SIGTERM → 5s 后 SIGKILL
- **日志**：子进程 stdout/stderr 自动捕获并写入 `task_logs` 表

#### 6.2.1 权限控制（三层模型）

子进程环境变量的构建遵循三层权限模型（实现于 `src/main/services/task.ts`）：

**Layer 1 — 脚本声明权限（manifest.permissions）**
从脚本的 `meta.json`（安装时由 `manifest.json` 的 `permissions` 字段写入）读取：
- `network` — 允许发起网络请求
- `filesystem` — 允许读写脚本目录外的文件系统
默认全部拒绝（缺失/非法值按 `false` 处理）。

**Layer 2 — 沙箱模式覆盖（task.is_sandbox）**
当 `is_sandbox=true` 时，覆盖 Layer 1 的声明，所有权限被拒绝。
用户在创建任务时可通过 UI 复选框启用沙箱模式。

**Layer 3 — 系统关键环境变量白名单**
以下键名**只能从父进程继承**，绝不可被 `task.config` 覆盖：
```
PATH, HOME, USERPROFILE, APPDATA, TEMP, TMP,
SHELL, USER, LOGNAME, LANG, TERM,
LD_LIBRARY_PATH, LD_PRELOAD, DYLD_LIBRARY_PATH,
PYTHONPATH, CLASSPATH
```

**注入的环境变量**（供脚本运行时自检）：
| 变量名              | 说明                                           |
| ------------------- | ---------------------------------------------- |
| `TASK_ID`           | 任务 UUID                                      |
| `TASK_CONFIG`       | JSON 序列化的 task.config                      |
| `TASK_PERM_NETWORK` | `"1"` 或 `"0"`，生效的网络权限                 |
| `TASK_PERM_FILESYSTEM` | `"1"` 或 `"0"`，生效的文件系统权限           |
| `TASK_SANDBOX`      | `"1"` 或 `"0"`，是否沙箱模式                   |

### 6.3 脚本与客户端的通信协议（SDK 设计目标）

当前通过环境变量向脚本注入配置，通过 stdout/stderr 接收日志。TODO：建立正式 SDK，提供以下能力：

```
脚本端 API（计划实现）：
- sdk.log(level, message)          — 发送日志到渲染进程
- sdk.getAccounts(templateId)      — 获取指定模板的账户数据
- sdk.getProxies()                  — 获取可用代理
- sdk.setProgress(percent, msg)     — 上报进度
- sdk.exit(code)                    — 退出并报告状态
- sdk.on('pause'/'resume'/'stop')  — 响应生命周期事件

通信通道（计划实现）：
- stdin / stdout JSON-RPC 风格行协议
- 每行一个 `{type, payload}` JSON 对象
```

### 6.4 脚本下载流程

1. 用户在 Templates 页面浏览远程脚本列表（`marketplaceApi.listScripts()`）
2. 点击安装 → `scriptApi.download(scriptId)`
3. `ScriptFetcher` 从 Marketplace Server 下载 zip → 校验 sha256 → 解压到 `{userData}/scripts/{scriptId}/`
4. 解压后检查 `manifest.json`，验证 `requiredAccountTemplateIds`
5. 写入 `task_templates` 表，标记 `is_installed=1`
6. 写入本地 `meta.json`（包含 `InstalledScript` 元数据）

---

## 7. 各模块详细规范

### 7.1 账户管理（Accounts）

**页面**：`src/renderer/src/pages/Accounts.tsx`

**当前状态**：

- 创建账户：选择模板 (`templates` 下拉) → 手动填写 `pool`（账号池）、`labels`、`notes`、`data`（手写 JSON textarea）
- 支持编辑、删除
- 列表展示：模板、账号池、标签、备注、data 字段

**需求实现计划**：

1. **动态表单渲染**：选择模板后，根据 `Template.schema`（JSON Schema）通过 `DynamicForm` 组件自动渲染表单字段，替代手写 JSON textarea
2. **JSON 批量导入**：新增「批量导入」按钮，支持粘贴 JSON 数组 `[{templateId, data, pool, ...}]` 一次性创建多个账户
3. **账号池检查**：创建账户时，如果填写的 `pool` 值尚不存在（数据库中无此 pool 名称的账户），弹出提示「该账号池不存在，是否创建？」，确认后继续创建
4. **字段移除**：创建表单中移除手动 `data` JSON textarea（由 DynamicForm 替代）

**账户模板流程**：

- 用户必须先从 Marketplace 下载账户模板（`templates` 表）
- 下载的模板包含 `schema`（JSON Schema），前端用此 schema 渲染 DynamicForm
- 如果用户还没有任何模板，点击「创建账户」时应提示「请先从模板市场下载账户模板」

---

### 7.2 代理管理（Proxies）

**页面**：`src/renderer/src/pages/Proxies.tsx`

**当前状态**：

- Proxies 页面：手动添加/编辑/删除代理（`proxies` 表）
- Settings 页面：可配置代理提供商（`proxy_providers` 表），从 API 自动拉取代理

**需求实现计划**：

1. **统一代理管理入口**：所有代理的增删改操作只允许在 Proxies 页面进行
   - Settings 页面中移除或只读展示 `proxy_providers` 配置
   - ProxyProvider 改为后端自动同步机制：配置后在 Proxies 页面自动显示从 API 拉取的代理
2. **支持更多格式**：
   - 当前 `proxies.protocol` 仅支持 `http / https / socks5`
   - 需新增 `format` 字段：`api`（API 拉取）、`ip`（IP:PORT 格式）、`ws`（WebSocket 代理）、`manual`（手动输入）
   - ws 格式存储为 `protocol=ws, host=..., port=...`
   - api 格式自动关联到 ProxyProvider

---

### 7.3 任务管理（Tasks）

**页面**：`src/renderer/src/pages/Tasks.tsx`

**当前状态**：

- 创建任务：选择已安装脚本（下拉列表）→ 通过 `DynamicForm` 渲染 `InstalledScript.schema.fields` → 填写表单 → 创建任务
- 任务操作：启动、暂停、恢复、停止、删除
- 脚本执行：`child_process.spawn` 子进程

**需求实现计划**：

1. **通过模板选择脚本**：创建任务时不再直接选择「脚本文件夹」，而是从已安装的任务模板列表（`task_templates` 表）中选择。选择后自动加载对应 `manifest.schema` 为 DynamicForm
2. **强制远程脚本**：所有任务脚本必须从 Marketplace Server 下载（不允许本地文件路径）
3. **账号模板关联**：如果 `manifest.requiredAccountTemplateIds` 不为空，检查用户是否已安装所需模板；未安装则阻止创建任务并提示
4. **脚本 SDK**：实施 §6.3 的 SDK 通信协议，替代纯环境变量注入
5. **manifest 规范**：严格按照 §6.1 规范定义 `manifest.json`，服务端上传时必须校验

---

### 7.4 空投管理（Airdrops）

**页面**：`src/renderer/src/pages/Airdrops.tsx`

**当前状态**：

- 创建空投：name、chain、status、projectType、description（普通 textarea）
- 编辑时可添加 links、eligibilityCriteria、tasks、earnings、tags、labels
- 无 Markdown 支持、无脚本模板关联、无账号组关联、无官网字段

**需求实现计划**：

1. **新增字段**：
   - `scriptTemplateId`（可选）— 关联的任务脚本模板
   - `website`（必填）— 官网 URL
   - `accountPool`（必填）— 从现有账号池中选择（通过 `SELECT DISTINCT pool FROM accounts`）
2. **Markdown 描述**：description 字段改为 Markdown 编辑器 + 渲染器（如 `react-md-editor` 或 `@uiw/react-markdown-editor`）
3. **创建表单字段列表**（按需求顺序）：
   - 脚本模板（可选，下拉选择已安装的任务模板）
   - 名称（必填）
   - 官网（必填）
   - 状态（下拉：ongoing / completed / cancelled / claimed）
   - 类型（下拉：testnet / mainnet / galxe / quest / social / other）
   - 描述（Markdown 编辑器）
   - 账号组（下拉，从 `SELECT DISTINCT pool FROM accounts` 获取）

**airdropprojects 表需新增字段**：

- `website` TEXT — 官网 URL
- `script_template_id` TEXT — 关联的任务脚本模板 ID（可空）
- `account_pool` TEXT — 关联的账号池名称（可空）

---

### 7.5 模板系统

#### 账户模板（`templates` 表）

- 用途：定义账户的数据结构（如 EVM 钱包需要 address + privateKey）
- 来源：从 Marketplace Server 下载（`marketplaceApi.listTemplates()`）
- schema 格式：标准 JSON Schema
- 示例：
  ```json
  {
    "type": "object",
    "properties": {
      "address": { "type": "string", "title": "钱包地址" },
      "privateKey": { "type": "string", "title": "私钥" },
      "mnemonic": { "type": "string", "title": "助记词" }
    },
    "required": ["address", "privateKey"]
  }
  ```

#### 任务脚本模板（`task_templates` 表）

- 用途：记录已安装的任务脚本元数据
- 来源：从 Marketplace Server 下载脚本 zip 包后自动创建
- manifest 格式：见 §6.1
- `is_installed=1` 表示已安装可用

---

## 8. 类型定义速查

所有共享类型定义在 `client/src/shared/types/index.ts`。

| 类型                 | 说明                                                        |
| -------------------- | ----------------------------------------------------------- |
| `Wallet`             | EVM/Solana/SUI/Bitcoin 钱包                                 |
| `Account`            | 账号池中的账户（关联 Template）                             |
| `Proxy`              | 代理配置                                                    |
| `ProxyProvider`      | 代理提供商 API 配置                                         |
| `Task`               | 任务（关联脚本文件夹）                                      |
| `TaskLog`            | 任务日志                                                    |
| `TaskStatus`         | `idle \| running \| paused \| stopped \| complete \| error` |
| `Template`           | 账户模板                                                    |
| `TaskTemplate`       | 任务脚本模板（已安装的任务脚本）                            |
| `ScheduledTask`      | 定时任务                                                    |
| `AirdropProject`     | 空投项目                                                    |
| `AirdropStatus`      | `ongoing \| completed \| cancelled \| claimed`              |
| `AirdropProjectType` | `testnet \| mainnet \| galxe \| quest \| social \| other`   |
| `RemoteScript`       | 服务端脚本元数据                                            |
| `InstalledScript`    | 已安装到本地的脚本                                          |
| `RemoteTemplate`     | 服务端模板元数据                                            |
| `AirdropLink`        | `{label, url}`                                              |
| `AirdropTaskItem`    | 空投任务项                                                  |
| `Earning`            | 收益记录                                                    |
| `StatsAggregate`     | Dashboard 统计聚合                                          |
| `AppInfo`            | 应用信息                                                    |
| `ApiResult<T>`       | `{data?: T, error?: ApiError}`                              |
| `ListResponse<T>`    | `{items: T[], total, page, pageSize, totalPages}`           |

---

## 9. 开发指南

- 前后端通信必须通过 `transport.ts` 统一封装，IPC 优先、HTTP 降级
- 主进程 handler 通过 `handlerMap` 统一注册（`register()`）
- 所有当前无法完成的功能必须进行 TODO 标记或记录在 AGENTS.md 的需求实现计划中
- 实现功能前先检查是否有现成的实现
- HTTP API 服务器监听 `127.0.0.1:34116`，仅用于冗余通信和调试
- 数据库操作使用 better-sqlite3 的同步 API
- 本项目为自己使用，无需考虑安全性，只需考虑多平台兼容性
- 所有实体 ID 使用 UUID v4
- 日期使用 ISO 8601 格式
- JSON 字段由 `StoreService` 自动序列化/反序列化

---

## 10. 待实现功能清单（TODO）

### 账户管理

- [ ] DynamicForm 根据模板 schema 自动渲染表单（替代手写 JSON）
- [ ] JSON 批量导入账户
- [ ] 创建账户时检查账号池是否存在

### 代理管理

- [ ] 统一代理管理入口到 Proxies 页面
- [ ] 支持代理格式：api / ip / ws / manual
- [ ] ProxyProvider 自动同步到 Proxies 列表

### 任务系统

- [ ] 通过任务模板（而非脚本路径）选择脚本
- [x] 沙箱模式 + 三层权限控制（is_sandbox + manifest.permissions + 环境变量白名单）
- [ ] 脚本 SDK：stdin/stdout JSON-RPC 通信协议
- [ ] requiredAccountTemplateIds 校验

### 空投管理

- [ ] 新增字段：website、scriptTemplateId、accountPool
- [ ] Markdown 编辑器 + 渲染器
- [ ] 账号组下拉选择

### 服务端

- [x] 废弃 marketplace-server/，统一使用 server/
- [ ] manifest.json 上传时自动校验格式
