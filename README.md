# TaskForge

一个基于 Electron + React + TypeScript 的全栈桌面应用，专注于**自动化脚本的分发 + 沙箱执行**。开发者把脚本发布到 Marketplace，用户从市场浏览安装、配置账号/代理、即可一键运行。附带独立的 Express 服务端子项目作为脚本与账户模板的分发后端。

> **产品定位**：TaskForge 是一套脚本分发平台，用于个人开发者、小团队的脚本共享解决方案，让你不再需要一个一个的分发，支持您自定义自己的服务器接入自己的服务/

## 项目结构

- `client/` — Electron 桌面应用（主程序）
- `server/` — Marketplace 服务端（Express + SQLite）

## 推荐 IDE 配置

- VSCode + ESLint + Prettier

## 快速开始

### 端到端本地开发

在两个终端中分别运行：

```bash
# 终端 1 - 启动服务端
cd server
npm install
npm run dev

# 终端 2 - 启动客户端
cd client
npm install
npm run dev
```

客户端从 `http://127.0.0.1:3400` 获取脚本和模板（可在 Settings 页面配置 `marketplace_server_url`）。

## Client (Electron 应用)

### 开发命令

```bash
cd client
npm install
npm run dev          # 开发模式
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化
npm test             # 运行 Vitest 测试
npm run build        # 完整构建
npm run build:win    # Windows 安装包
npm run build:mac    # macOS 安装包
npm run build:linux  # Linux 安装包
```

### 功能特性

- **脚本市场（核心）** — 上传/下载/审核/版本管理任务脚本；账户模板（账号 schema）同源发布
- **沙箱任务执行引擎** — 子进程管理、4 层权限控制（manifest 声明 + 沙箱标志 + 环境变量白名单 + CJS 强制 patch）
- **数据驱动** — 用数据模板（账户/账号池/代理）作为脚本输入，模板自带 JSON Schema
- **定时任务调度** — Cron 表达式定时执行任务
- **项目追踪** — 支持状态管理、Markdown 描述、关联脚本和账号池（作为可选业务场景）
- **代理管理** — 支持 http/https/socks5/ws 代理，多种格式
- **用户角色系统** — admin/developer/user 权限分级
- **国际化** — 简体中文（i18next，预留 en locale 扩展点）
- **双传输层通信** — IPC 优先、HTTP 降级（稳定可靠）

### 技术栈

- Electron + electron-vite
- React 19 + TypeScript
- Tailwind CSS v4
- better-sqlite3（本地数据库）
- ethers.js / @solana/web3.js
- react-router-dom
- @tanstack/react-query
- react-hook-form + zod
- sonner（Toast）
- lucide-react（图标）
- Vitest（测试）

## Server (Marketplace)

### 开发命令

```bash
cd server
npm install
npm run dev          # tsx watch 模式，监听 http://localhost:3400
npm run build        # tsc 编译到 dist/
npm start            # 运行编译后的 dist/index.js
```

### API 端点

- `GET /api/health` — 健康检查
- `POST /api/auth/setup` — 初始化（创建第一个管理员用户）
- `POST /api/auth/login` — 用户登录
- `POST /api/auth/register` — 用户注册
- `GET /api/users/me` — 获取当前用户信息
- `GET /api/users` — 列出所有用户（admin 权限）
- `PUT /api/users/:id/role` — 更新用户角色（admin 权限）
- `GET /api/scripts` — 列出所有脚本
- `GET /api/scripts/:id` — 获取脚本详情
- `GET /api/scripts/:id/download` — 下载脚本 zip
- `POST /api/scripts` — 上传脚本（multipart）
- `PUT /api/scripts/:id` — 更新脚本
- `DELETE /api/scripts/:id` — 删除脚本
- `GET /api/templates` — 列出所有模板
- `GET /api/templates/:id` — 获取模板详情
- `POST /api/templates` — 创建模板
- `PUT /api/templates/:id` — 更新模板
- `DELETE /api/templates/:id` — 删除模板

### 配置

- 默认端口：3400（可通过 `PORT` 环境变量覆盖）
- 监听地址：127.0.0.1（可通过 `HOST` 环境变量覆盖）
- 数据库：`server/data/marketplace.db`（SQLite + WAL）
- 上传目录：`server/data/uploads/scripts/`、`server/data/uploads/templates/`
- 认证：JWT Token + Bearer Token

## 开发指南

详细的开发规范、架构说明和待实现功能请参阅：

- **AGENTS.md** — 完整的开发规范文档（架构、技术栈、数据库设计、模块详情、TODO 清单）
- **CLAUDE.md** — Claude 专用指导文档

## 许可证

MIT
