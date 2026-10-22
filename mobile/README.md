# TaskForge Mobile PWA

TaskForge 移动端 Web 应用（可安装到手机桌面），复用部署在 `https://task.likecloud.top` 的
Marketplace Server API。

## 功能

- 登录 / 注册 / 首次初始化管理员
- 脚本市场：列表、搜索、详情（描述、标签、更新日志、参数 Schema、版本历史）、下载 ZIP
- 模板市场：账户模板（Schema 查看）、项目模板（字段列表）
- 个人中心：修改显示名称/密码、重新生成 API Key（仅展示一次）、服务状态、退出登录
- PWA：manifest + Service Worker，支持添加到主屏幕、离线打开应用壳
- 移动端优先的暗色品牌 UI，适配刘海屏安全区域

## 开发

```bash
cd mobile
npm install
npm run dev        # http://127.0.0.1:5174/app/，/api 代理到 http://127.0.0.1:8268
```

本地开发需要先启动 Marketplace Server（`cd server && npm run dev`）。

## 构建

```bash
cd mobile
npm run build      # 产物输出到 mobile/app/（base=/app/）
npm run preview    # 本地预览构建产物
```

## 部署

生产环境由 nginx 静态托管在 `https://task.likecloud.top/app/`：

1. `npm run build`（产物 `mobile/app/`）
2. 将 `mobile/app/` 同步到服务器 `/home/ubuntu/taskforge/mobile/app/`
3. nginx 站点配置见 [`deploy/server/nginx-task.likecloud.top.conf`](../deploy/server/nginx-task.likecloud.top.conf)：
   - `/app/` → 静态文件（`root /home/ubuntu/taskforge/mobile`）
   - `/api/` 及其余请求 → `127.0.0.1:8268`
   - `/` → 302 到 `/app/`
4. `sudo nginx -t && sudo systemctl reload nginx`

## 技术栈

Vite 7 + React 19 + TypeScript，无 UI 框架依赖；API 客户端在 `src/api.ts`，
Token 存于 `localStorage`（`tf_mobile_token`），401 自动清理登录态。
