# AGENTS.md — TaskForge 开发规范

## 项目类型：Electron + TypeScript 桌面应用

基于 Electron 的全栈桌面应用，**核心定位是"脚本分发 + 沙箱执行平台"**。React + Tailwind CSS 渲染层，Node.js 主进程。所有业务逻辑在 TypeScript 中实现，附带独立的 Express 服务端子项目作为脚本与账户模板的分发后端。

> **重要**：本仓库的原始名称是 airdrop-farm，正在重命名为 TaskForge（见 `.omo/plans/taskforge-redesign.md`）。所有"空投"业务（airdrop tracking、airdrop projects）只是脚本可执行的众多垂直场景之一，不是产品主线。当前重构目标：把脚本市场 + 沙箱执行作为导航/产品文案的一等公民，空投业务降级为次要模块。

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
- 服务端开发：`cd server && npm run dev`
- 服务端构建：`cd server && npm run build`

---

## 1. 架构总览

```
taskforge/
├── client/                    # Electron 客户端
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
│   │   │   │   ├── task.ts          # 任务执行引擎（子进程管理、权限控制）
│   │   │   │   ├── wallet.ts        # 钱包管理
│   │   │   │   ├── script-fetcher.ts # 远程脚本下载器
│   │   │   │   ├── scheduler.ts     # 定时任务调度
│   │   │   │   ├── encryption.ts    # 加密服务
│   │   │   │   └── repositories/    # 数据仓库层
│   │   │   └── utils/               # 日志等工具
│   │   ├── preload/                  # Context bridge (electronAPI.invoke / .on)
│   │   └── renderer/                # React 前端
│   │       └── src/
│   │           ├── api.ts           # 类型化 API 客户端
│   │           ├── transport.ts     # 双传输层 (IPC → HTTP 自动降级)
│   │           ├── components/      # 共享 UI 组件 (TitleBar, BrandMark, ThemeToggle, ParticlegroundBg 等)
│   │           ├── pages/           # 路由页面
│   │           ├── hooks/           # 自定义 hooks
│   │           ├── contexts/        # React contexts (AuthContext 等)
│   │           ├── i18n/            # 国际化 (zh-CN)
│   │           ├── types/           # 前端类型定义
│   │           └── utils/           # 前端工具函数
│   ├── shared/
│   │   ├── types/index.ts           # 共享 TypeScript 接口
│   │   └── schemas/                 # 共享数据校验 schema
│   ├── resources/                   # 应用图标
│   ├── build/                       # 构建资源 (entitlements, icons)
│   └── tests/                       # 测试文件
├── server/                      # Marketplace 服务端
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
│       ├── middleware/auth.ts   # JWT + Bearer Token 认证
│       └── utils/keys.ts        # 密钥生成
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
- **three.js** — WebGL 3D 渲染（登录页粒子背景）
- **Inter** — Google Fonts 品牌字体（优先于系统字体栈）
- **better-sqlite3** — 主进程数据库（WAL 模式，预处理语句）
- **ethers.js** — EVM 钱包管理
- **@solana/web3.js** — Solana 钱包管理
- **bip39 + ed25519-hd-key** — HD 钱包派生
- **react-router-dom** — 前端路由（HashRouter）
- **i18next** — 国际化
- **lucide-react** — 图标
- **Express (server/)** — 市场服务端
- **JWT + bcrypt** — 认证与角色授权
- **sonner** — Toast 提示
- **@tanstack/react-query** — 服务端状态管理
- **react-hook-form** — 表单处理
- **zod** — 数据验证

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
| Templates（模板市场）|  ✅²  |    ✅     |  ✅¹ |
| Quick Dev             |  ❌   |    ✅     |  ❌  |
| Developer Pending     |  ❌   |    ✅     |  ❌  |
| Admin Review          |  ✅   |    ❌     |  ❌  |
| Logs                  |  ✅   |    ❌     |  ❌  |
| Settings              |  ✅   |    ❌     |  ❌  |
| User Management       |  ✅   |    ❌     |  ❌  |
| Debug Page            |  ✅   |    ✅     |  ❌  |

> ¹ user 角色在 Templates 页面只能浏览和安装模板/脚本，不可使用 Schema 编辑器、上传、更新或删除。
> ² admin 在 Templates 页面可管理可见性、删除任何条目，但不进行运营性使用。日常上传/编辑由 developer 完成。

**注意**：路由层面（`App.tsx`）某些页面对 admin 没有显式拦截，但导航栏（`Layout.tsx`）不再展示这些入口；admin 不应通过 URL 跳转使用运营页面。

### 实现层次

- **服务端**：`server/src/routes/auth.ts`（登录/注册/初始化）、`server/src/routes/users.ts`（CRUD）、`server/src/middleware/auth.ts`（JWT 中间件）
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

位置：`app.getPath('userData')/taskforge.db`（客户端）、`server/data/marketplace.db`（服务端）。使用 better-sqlite3 的同步 API，无需 async/await。JSON 字段由 `StoreService` 自动序列化/反序列化。

### 4.1 表结构（客户端）

#### wallets — 钱包

| 字段        | 类型          | 说明                         |
| ----------- | ------------- | ---------------------------- |
| id          | TEXT PK       | UUID v4                      |
| address     | TEXT NOT NULL | 地址                         |
| private_key | TEXT          | 私钥（可空，加密存储）       |
| mnemonic    | TEXT          | 助记词（可空，加密存储）     |
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

| 字段       | 类型             | 说明                                                         |
| ---------- | ---------------- | ------------------------------------------------------------ |
| id         | TEXT PK          | UUID v4                                                      |
| protocol   | TEXT NOT NULL    | http / https / socks5 / ws                                   |
| host       | TEXT NOT NULL    | 主机地址                                                     |
| port       | INTEGER NOT NULL | 端口                                                         |
| username   | TEXT             | 用户名（可空）                                               |
| password   | TEXT             | 密码（可空）                                                 |
| status     | TEXT NOT NULL    | active / inactive / expired                                  |
| format     | TEXT NOT NULL    | manual / api / ip / ws（代理格式类型）                       |
| labels     | TEXT → JSON      | 标签数组                                                     |
| created_at | TEXT NOT NULL    | ISO 8601                                                     |

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
| is_sandbox    | INTEGER       | 是否沙箱模式（1 表示沙箱，权限受限）                       |

索引：`idx_tasks_status ON tasks(status)`

#### task_logs — 任务日志

| 字段      | 类型          | 说明                         |
| --------- | ------------- | ---------------------------- |
| id        | INTEGER PK    | 自增                         |
| task_id   | TEXT NOT NULL | 关联任务 ID                  |
| timestamp | TEXT NOT NULL | ISO 8601                     |
| level     | TEXT NOT NULL | info / warn / error / debug  |
| message   | TEXT NOT NULL | 日志内容                     |

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
| manifest      | TEXT → JSON   | 脚本 manifest                           |
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
| description          | TEXT          | 项目描述（支持 Markdown）                          |
| website              | TEXT          | 官网 URL                                           |
| script_template_id   | TEXT          | 关联的任务脚本模板 ID（可空）                      |
| account_pool         | TEXT          | 关联的账号池名称（可空）                           |
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

### 4.2 数据库迁移

`StoreService` 包含自动迁移逻辑，用于向后兼容现有数据库：
- `migrateAirdropProjects()` — 为 airdrop_projects 表添加新字段
- `migrateProxies()` — 为 proxies 表添加 format 字段

---

## 5. Marketplace Server 规范（`server/`）

### 5.1 配置

| 项目     | 值                                                               |
| -------- | ---------------------------------------------------------------- |
| 默认端口 | 3400                                                             |
| 监听地址 | 127.0.0.1（可用 `HOST` 环境变量覆盖）                            |
| 数据库   | `server/data/marketplace.db` (SQLite, WAL)                       |
| 上传目录 | `server/data/uploads/scripts/`、`server/data/uploads/templates/` |
| 认证     | JWT Token + Bearer Token 认证                                    |
| GET 请求 | 公开，无需认证                                                   |
| 写请求   | 需要 `Authorization: Bearer <token>`                             |

### 5.2 API 端点

#### 认证相关 (`/api/auth`)

| 方法   | 路径         | 说明                  |
| ------ | ------------ | --------------------- |
| POST   | `/setup`    | 初始化（创建第一个管理员用户） |
| POST   | `/login`    | 登录                  |
| POST   | `/register` | 注册新用户            |

#### Scripts（`/api/scripts`）

| 方法   | 路径            | 说明                                                      |
| ------ | --------------- | --------------------------------------------------------- |
| GET    | `/`            | 列出所有脚本。返回 `{data: {items: ScriptItem[], total}}` |
| GET    | `/:id`         | 获取脚本详情                                              |
| GET    | `/:id/download`| 下载脚本 zip 包（自增下载计数）                           |
| POST   | `/`            | 上传脚本（multipart）                                     |
| PUT    | `/:id`         | 更新脚本信息                                              |
| DELETE | `/:id`         | 删除脚本（含文件）                                        |

#### Templates（`/api/templates`）

| 方法   | 路径   | 说明                  |
| ------ | ------ | --------------------- |
| GET    | `/`    | 列出所有模板          |
| GET    | `/:id` | 获取模板详情          |
| POST   | `/`    | 创建模板（JSON body） |
| PUT    | `/:id` | 更新模板              |
| DELETE | `/:id` | 删除模板              |

#### Users（`/api/users`）

| 方法   | 路径         | 说明                  |
| ------ | ------------ | --------------------- |
| GET    | `/`         | 列出所有用户（admin 权限） |
| GET    | `/me`       | 获取当前用户信息      |
| PUT    | `/:id/role` | 更新用户角色（admin 权限） |

#### Health

| 方法 | 路径          | 说明                                       |
| ---- | ------------- | ------------------------------------------ |
| GET  | `/api/health` | 健康检查。返回 `{status: "ok", timestamp, needsSetup}` |

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
| visible     | INTEGER     | 是否可见（1/0）                       |
| created_by  | TEXT        | 创建者用户 ID                         |
| review_status | TEXT      | 审核状态（pending/approved/rejected） |
| review_comment | TEXT    | 审核评论                              |
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
| visible       | INTEGER     | 是否可见    |
| created_by    | TEXT        | 创建者 ID   |
| review_status | TEXT        | 审核状态    |
| review_comment | TEXT       | 审核评论    |
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
  "tags": ["airdrop", "testnet"],
  "changelog": "v1.0.0 初始版本"
}
```

**字段说明**：

| 字段                       | 必填 | 说明                                                         |
| -------------------------- | ---- | ------------------------------------------------------------ |
| id                         | ✅   | 脚本唯一标识                                                 |
| name                       | ✅   | 显示名称                                                     |
| version                    | ✅   | 语义化版本                                                   |
| description                | ✅   | 用途描述                                                     |
| entryPoint                 | ✅   | 入口文件名（相对脚本目录）                                   |
| runtime                    | ✅   | 运行时：`"node"`                                             |
| requiredAccountTemplateIds | ❌   | 需要的账户模板 ID 列表                                       |
| schema                     | ✅   | 任务配置表单的 JSON Schema                                   |
| permissions                | ❌   | 权限声明：`["network", "filesystem"]`                        |
| tags                       | ❌   | 分类标签                                                     |
| changelog                  | ❌   | 更新日志                                                     |

### 6.2 脚本执行环境与权限控制

每个任务通过 `child_process.spawn` 启动独立子进程，实现了**四层权限模型**：

#### Layer 1 — 脚本声明权限（manifest.permissions）
从脚本的 `meta.json`（安装时由 `manifest.json` 的 `permissions` 字段写入）读取：
- `network` — 允许发起网络请求
- `filesystem` — 允许读写脚本目录外的文件系统
默认全部拒绝（缺失/非法值按 `false` 处理）。

#### Layer 2 — 沙箱模式覆盖（task.is_sandbox）
当 `is_sandbox=true` 时，覆盖 Layer 1 的声明，所有权限被拒绝。用户在创建任务时可通过 UI 复选框启用沙箱模式。

#### Layer 3 — 系统关键环境变量白名单
以下键名**只能从父进程继承**，绝不可被 `task.config` 覆盖：
```
PATH, HOME, USERPROFILE, APPDATA, TEMP, TMP,
SHELL, USER, LOGNAME, LANG, TERM,
LD_LIBRARY_PATH, LD_PRELOAD, DYLD_LIBRARY_PATH,
PYTHONPATH, CLASSPATH
```

#### Layer 4 — 根级别强制（sandbox-enforcer.cjs）⚠️ 安全关键
**Layers 1–3 都是声明性的，恶意脚本可以直接忽略**。Layer 4 在子进程启动时通过 `NODE_OPTIONS=--require` 强制加载 `client/src/main/services/sandbox-enforcer.cjs`，在用户脚本运行**之前**monkey-patch 掉所有受限 API：

| 被 patch 的模块 | 行为 |
|---|---|
| `http`, `https` | `request`/`get` 抛 `ERR_PERMISSION_DENIED` |
| `net` | `connect`/`createConnection`/`createServer` 抛 `ERR_PERMISSION_DENIED` |
| `tls` | `connect` 抛 `ERR_PERMISSION_DENIED` |
| `dgram` | `createSocket` 抛 `ERR_PERMISSION_DENIED` |
| `dns` | `lookup`/`resolve*` 抛 `ERR_PERMISSION_DENIED` |
| `globalThis.fetch` | 抛 `ERR_PERMISSION_DENIED` |
| `child_process` | `spawn`/`exec`/`execFile`/`fork` 等抛 `ERR_PERMISSION_DENIED` |
| `worker_threads` | `Worker` 构造抛 `ERR_PERMISSION_DENIED` |
| `fs` (同步+异步+promises) | 路径必须在 `cwd` 或 `TEMP/TMP/TMPDIR` 之内，否则抛 `ERR_PERMISSION_DENIED` |

**绕过不可能**：patch 在模块导出对象上，脚本 `require('http')` 拿到的就是 patch 后的版本。
**白名单绕过**：`TASK_PERM_BYPASS=1`（仅供内部脚本使用）跳过所有 patch。

`scripts/check-i18n.cjs` 在 CI 阶段扫描所有 `t()` 调用并校验 `zh-CN.json`，防止 i18n 缺失 key 导致界面显示原始 key（被用户误认为变量名）。

测试：`tests/main/sandbox-enforcer.test.ts`（11/11 通过）证明 patch 生效。

#### 注入的环境变量（供脚本运行时自检）

| 变量名                    | 说明                                                         |
| ------------------------- | ------------------------------------------------------------ |
| `TASK_ID`                 | 任务 UUID                                                    |
| `TASK_CONFIG`             | JSON 序列化的 task.config                                    |
| `TASK_PERM_NETWORK`       | `"1"` 或 `"0"`，生效的网络权限                               |
| `TASK_PERM_FILESYSTEM`    | `"1"` 或 `"0"`，生效的文件系统权限                           |
| `TASK_SANDBOX`            | `"1"` 或 `"0"`，是否沙箱模式                                 |
| `TASK_WALLETS`            | JSON 数组格式的钱包数据（仅在非沙箱且有 network 权限时注入） |
| `TASK_ACCOUNTS`           | JSON 数组格式的账户数据（仅在非沙箱且有 network 权限时注入） |

#### 任务生命周期

- **启动** → `spawn` 子进程 → 自动安装 `package.json` 依赖
- **暂停** → 发送 SIGSTOP（非 Windows）或软暂停
- **恢复** → 发送 SIGCONT（非 Windows）或软恢复
- **停止** → 发送 SIGTERM → 5s 后 SIGKILL
- **日志** → 子进程 stdout/stderr 自动捕获并写入 `task_logs` 表
- **输出** → 任务完成后保留 stdout/stderr（最后 10KB）

### 6.3 脚本 SDK（已实现 — 696858f）

脚本与主进程之间通过 **stdin/stdout NDJSON 协议**（每行一个 JSON 对象，类似 LSP）通信。
完全向后兼容老的纯文本 stdout 脚本：解析器对每行尝试 `JSON.parse`，非 JSON 行走原始 `logBuffer.push('info', line)`。

#### 6.3.1 协议消息

**脚本 → 主进程**（stdout）：

| type | 必填字段 | 用途 |
|---|---|---|
| `log` | `level` (`debug`/`info`/`warn`/`error`), `message` | 结构化日志 → task_logs 表 |
| `progress` | `percent` (0-100), `message?` | 任务进度，UI 实时显示 |
| `error` | `message` | 错误日志（level=error） |
| `result` | `ok` (boolean), `data?`, `error?` | 脚本主动报告最终结果 |

**主进程 → 脚本**（stdin）：

| type/id | 字段 | 用途 |
|---|---|---|
| `shutdown` | — | 主进程通知脚本优雅退出（SIGTERM 前） |

#### 6.3.2 极简 SDK（Node.js 零依赖示例）

```js
// 脚本入口 index.js
function sdk(level, message, fields) {
  process.stdout.write(JSON.stringify({ type: 'log', level, message, fields }) + '\n')
}
function progress(percent, message) {
  process.stdout.write(JSON.stringify({ type: 'progress', percent, message }) + '\n')
}

// 业务
sdk('info', '开始执行')
progress(0, '初始化')
// ...
progress(100, '完成')
process.stdout.write(JSON.stringify({ type: 'result', ok: true, data: { count: 42 } }) + '\n')
```

#### 6.3.3 解析器位置
`client/src/main/services/sdk-protocol.ts` 的 `SdkLineParser` 类：
- `feed(chunk)`: 投递 stdout 数据块（按 `\n` 切分）
- `flush()`: 进程退出时调用，处理残留不完整行
- `waitForResponse(id, timeoutMs)`: 主进程发起 RPC 后等脚本响应（暂未启用）

TaskService 在 `task.ts:339-355` 位置把 stdout 改走 `SdkLineParser.feed()`，stderr 仍走纯文本（脚本 SDK 不期望从 stderr 发 JSON）。

### 6.4 脚本下载流程

1. 用户在 Templates 页面浏览远程脚本列表（`marketplaceApi.listScripts()`）
2. 点击安装 → `scriptApi.download(scriptId)`
3. `ScriptFetcher` 从 Marketplace Server 下载 zip → 校验 → 解压到 `{userData}/scripts/{scriptId}/`
4. 解压后检查 `manifest.json`，写入 `meta.json`
5. 写入 `task_templates` 表，标记 `is_installed=1`

---

## 7. 各模块详细规范

### 7.1 账户管理（Accounts）

**页面**：`src/renderer/src/pages/Accounts.tsx`

**已实现功能**：
- ✅ 动态表单渲染：选择模板后，根据 `Template.schema` 通过 `DynamicForm` 组件自动渲染表单字段
- ✅ JSON 批量导入账户（支持粘贴 JSON 数组）
- ✅ 文件导入（带解析和预览）
- ✅ 创建账户时检查账号池是否存在，不存在时提示确认
- ✅ 账号池列表获取
- ✅ 批量创建接口
- ✅ 账户导出功能
- ✅ 搜索和分页
- ✅ 标签管理

**账户模板流程**：
- 用户必须先从 Marketplace 下载账户模板（`templates` 表）
- 下载的模板包含 `schema`（JSON Schema），前端用此 schema 渲染 DynamicForm

### 7.2 代理管理（Proxies）

**页面**：`src/renderer/src/pages/Proxies.tsx`

**已实现功能**：
- ✅ 多种代理格式支持：manual / api / ip / ws
- ✅ 多种协议支持：http / https / socks5 / ws
- ✅ 批量选择和批量删除
- ✅ 代理地址一键复制
- ✅ 标签管理
- ✅ 搜索和分页
- ✅ 状态管理（active / inactive / expired）
- ✅ 代理提供商配置（Settings 页面）

### 7.3 任务管理（Tasks）

**页面**：`src/renderer/src/pages/Tasks.tsx`

**已实现功能**：
- ✅ 三层权限控制模型（沙箱模式 + manifest 权限 + 环境变量保护）
- ✅ 任务启动/暂停/恢复/停止
- ✅ 实时日志查看
- ✅ 任务进度跟踪
- ✅ 任务输出获取
- ✅ 任务配置表单（基于脚本 schema）
- ✅ 依赖自动安装
- ✅ 子进程管理和清理
- ✅ 孤立任务清理

### 7.4 空投管理（Airdrops）

**页面**：`src/renderer/src/pages/Airdrops.tsx`

**已实现功能**：
- ✅ `website` 字段（官网 URL）
- ✅ `scriptTemplateId` 字段（关联任务脚本模板）
- ✅ `accountPool` 字段（关联账号池，下拉选择）
- ✅ 描述字段支持 Markdown（UI 提示）
- ✅ 链接管理
- ✅ 任务列表管理
- ✅ 收益记录管理
- ✅ 标签和标签管理
- ✅ 搜索和分页
- ✅ 状态管理（ongoing / completed / cancelled / claimed）
- ✅ 项目类型分类

### 7.5 模板系统

#### 账户模板（`templates` 表）

- 用途：定义账户的数据结构（如 EVM 钱包需要 address + privateKey）
- 来源：从 Marketplace Server 下载或本地创建
- schema 格式：标准 JSON Schema

#### 任务脚本模板（`task_templates` 表）

- 用途：记录已安装的任务脚本元数据
- 来源：从 Marketplace Server 下载脚本 zip 包后自动创建

---

## 8. 类型定义速查

所有共享类型定义在 `client/src/shared/types/index.ts`。

| 类型                 | 说明                                                         |
| -------------------- | ------------------------------------------------------------ |
| `Wallet`             | EVM/Solana/SUI/Bitcoin 钱包                                 |
| `Account`            | 账号池中的账户（关联 Template）                             |
| `Proxy`              | 代理配置                                                     |
| `ProxyFormat`        | 代理格式类型（manual/api/ip/ws）                            |
| `ProxyProvider`      | 代理提供商 API 配置                                         |
| `Task`               | 任务（关联脚本文件夹）                                      |
| `TaskLog`            | 任务日志                                                     |
| `TaskStatus`         | `idle \| running \| paused \| stopped \| complete \| error` |
| `Template`           | 账户模板                                                     |
| `TaskTemplate`       | 任务脚本模板（已安装的任务脚本）                            |
| `ScheduledTask`      | 定时任务                                                     |
| `AirdropProject`     | 空投项目                                                     |
| `AirdropStatus`      | `ongoing \| completed \| cancelled \| claimed`              |
| `AirdropProjectType` | `testnet \| mainnet \| galxe \| quest \| social \| other`   |
| `RemoteScript`       | 服务端脚本元数据                                             |
| `InstalledScript`    | 已安装到本地的脚本                                           |
| `RemoteTemplate`     | 服务端模板元数据                                             |
| `AirdropLink`        | `{label, url}`                                              |
| `AirdropTaskItem`    | 空投任务项                                                   |
| `Earning`            | 收益记录                                                     |
| `StatsAggregate`     | Dashboard 统计聚合                                          |
| `AppInfo`            | 应用信息                                                     |
| `ApiResult<T>`       | `{data?: T, error?: ApiError}`                              |
| `ListResponse<T>`    | `{items: T[], total, page, pageSize, totalPages}`           |
| `PermissionSet`      | 脚本运行时权限 `{network, filesystem}`                       |
| `TaskOutput`         | 任务输出 `{taskId, exitCode, stdout, stderr, durationMs}`   |

---

## 9. 开发指南

- 前后端通信必须通过 `transport.ts` 统一封装，IPC 优先、HTTP 降级
- 主进程 handler 通过 `handlerMap` 统一注册（`register()`）
- HTTP API 服务器监听 `127.0.0.1:34116`，仅用于冗余通信和调试
- 数据库操作使用 better-sqlite3 的同步 API
- 所有实体 ID 使用 UUID v4
- 日期使用 ISO 8601 格式
- JSON 字段由 `StoreService` 自动序列化/反序列化
- 新增 IPC channel 时需同时：
  1. 在 `ipc/index.ts` 中 `register()`
  2. 在 `renderer/src/api.ts` 中添加类型化方法
  3. 在 `preload/index.ts` 中添加到 allowlist（如需要）

---

## 10. 主题系统

项目支持 dark / light 双主题，基于 React Context 架构实现主题状态共享。

### 10.1 架构

**文件**: `client/src/renderer/src/hooks/useTheme.tsx`

| 导出 | 类型 | 说明 |
|------|------|------|
| `ThemeProvider` | React.FC | 顶层 Provider，包裹整个应用；内部持有 `pref` + `systemTheme` 共享状态 |
| `useTheme()` | hook | 返回 `{ theme, pref, setPref }`；从 Context 读取，多组件共享同一份状态 |
| `initTheme()` | 函数 | 同步应用主题到 `<html>` class，在 `main.tsx` 启动前调用以防止 FOUC |
| `applyTheme(pref)` | 函数 | 设置 `document.documentElement.classList` + `<meta name="color-scheme">` |
| `ThemePref` | 类型 | `'auto' \| 'light' \| 'dark'` |
| `ResolvedTheme` | 类型 | `'light' \| 'dark'` |

**使用方式**:

```ts
// main.tsx — 启动前同步初始化 + Provider 包裹
import { initTheme, ThemeProvider } from './hooks/useTheme'
initTheme()
root.render(<ThemeProvider><App /></ThemeProvider>)

// 任意子组件 — 读取主题
const { theme, pref, setPref } = useTheme()
// theme: 'light' | 'dark'
// setPref('light') — 全局切换主题，所有 useTheme() 调用方同步更新
```

### 10.2 主题切换链路

1. 用户在 `ThemeToggle` 点击切换 → 调用 `setPref('light'|'dark')`
2. Context Provider 的 `pref` state 更新 → 所有 `useTheme()` 调用方拿到新的 `theme`
3. `applyTheme(pref)` → 更新 `<html class="dark|light">` + `<meta name="color-scheme">`
4. `main.css` 的 `.dark { ... }` 选择器基于 `<html class="dark">` 触发 CSS 变量覆盖
5. `LoginPage` 的 `data-theme` 属性 + WebGL `ParticlegroundBg` 同步切换

### 10.3 主题控件

**文件**: `client/src/renderer/src/components/ThemeToggle.tsx`
- 两种形态：`collapsed=true` 单图标循环点击；`collapsed=false` 三段式 radio-group
- 渲染位置：`TitleBar` 右侧（`collapsed` 模式）

---

## 11. Midnight Forge 设计语言（v0.2.1）

登录页暨全局品牌视觉系统，统一 dark / light 双主题配色。

### 11.1 色彩 token

| Token | Dark 值 | Light 值 | 用途 |
|-------|--------|---------|------|
| `--forge-canvas` | `#08070d` | `#faf8ff` | 登录页画布背景 |
| `--forge-ink` | `#f5f3ff` | `#0f0d18` | 主文字色 |
| `--forge-mute` | `#9b97a8` | `#5a5765` | 次级文字 |
| `--forge-brand-1` | `#a78bfa` | `#7c3aed` | 品牌紫（薰衣草紫 / 深紫） |
| `--forge-brand-2` | `#fbbf24` | `#d97706` | 品牌金（暖琥珀金） |
| `--forge-line` | `#2a2735` | `#e2dceb` | 描边色 |
| `--forge-card-bg` | `rgba(15,13,22,0.6)` | `rgba(255,255,255,0.7)` | 卡片背景（玻璃拟物） |

**主应用 token**（`main.css`）：

| Token | Dark 值 | Light 值 | 说明 |
|-------|--------|---------|------|
| `--color-primary` | `#a78bfa` | `#7c3aed` | **品牌紫**（v0.2.1 从蓝色 `#2563eb` 重塑） |
| `--color-bg-page` | `#0f0d18` | `#faf8ff` | 页面画布（与登录页 canvas 对齐） |
| `--color-bg-card` | `#1a1726` | `#ffffff` | 卡片表面 |
| `--color-brand-1` | `#c4b5fd` | `#a78bfa` | 品牌紫（更亮，保证 dark 模式可读性） |
| `--color-brand-2` | `#fbbf24` | `#fbbf24` | 品牌金 |
| `--font-sans` | `'Inter', -apple-system, ...` | 同 | Inter 优先字体栈 |

**圆角 token**（v0.2.1 新增）:

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-card` | 16px | 卡片 |
| `--radius-input` | 10px | 输入框 |
| `--radius-button` | 8px | 按钮 |

### 11.2 BrandMark 组件

**文件**: `client/src/renderer/src/components/BrandMark.tsx`
- 品牌字标 `TASKFORGE` — 18px 极宽字距（letter-spacing: 0.4em）+ CSS 紫金渐变
- `aurora-drift` 8s 动画（`background-position` 漂移）
- 3 种尺寸：`sm`(12px) / `md`(18px 默认) / `lg`(24px)
- 可选 `subtitle` prop（11px uppercase 紫调灰副标题）
- 被 `TitleBar` 和 `LoginPage` 共用 — 保证登录页 + 主应用品牌一致性

### 11.3 WebGL 背景

**文件**: `client/src/renderer/src/components/ParticlegroundBg.tsx`
- 单 quad + OrthographicCamera + ShaderMaterial
- 4 个漂浮 metaball 光源（其中 1 个跟随鼠标 1:1 snap）
- 主题感知：dark / light 两套 PALETTE，切换时 uniforms 平滑 lerp（~320ms）
- 接受 `theme?: 'light' | 'dark'` prop

### 11.4 登录页动效清单

| 动效 | 实现 | 参数 |
|------|------|------|
| 卡片揭开入场 | `clip-path: inset(50%) → 0%` | 0.9s cubic-bezier(0.16,1,0.3,1) |
| 字标紫金漂移 | `background-position` aurora-drift | 8s linear infinite |
| 输入框焦点光扫 | `scaleX(0→1)` sweep 线 | 0.4s |
| 能量条 hover | 满高背景 + box-shadow 紫光 + brightness(1.1) | 0.2s |
| 能量条 loading | 紫金渐变 200% `background-size` | 1.5s linear infinite |

---

## 12. 待实现功能清单（TODO）

### 任务系统
- [ ] 脚本 SDK：stdin/stdout JSON-RPC 通信协议，提供结构化的日志、进度、账户/代理获取 API
- [ ] `requiredAccountTemplateIds` 校验（安装脚本前检查所需账户模板）
- [ ] 通过任务模板（而非脚本路径）选择脚本的完整流程

### 代理管理
- [ ] ProxyProvider 自动同步机制（从 API 自动拉取代理到 proxies 表）
- [ ] 统一代理管理入口到 Proxies 页面（Settings 中的 proxy_providers 设为只读或移除）

### 空投管理
- [ ] Markdown 编辑器组件集成（当前仅提示支持，无实际编辑器）
- [ ] Markdown 渲染组件

### 服务端
- [ ] manifest.json 上传时自动校验格式
