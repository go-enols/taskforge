/**
 * @file Express 服务端入口
 * @description 加载密钥、创建应用并监听端口（默认 8268 / 0.0.0.0，可用 PORT / HOST 覆盖）。
 *              应用本身的构建逻辑在 app.ts（便于 supertest 测试），本文件只负责进程生命周期。
 * @module server
 */
import { createApp } from "./app";
import { ensureKeys } from "./utils/keys";

/** 确保 JWT 和 API 密钥存在，注入环境变量 */
const keys = ensureKeys();
process.env.JWT_SECRET = keys.jwtSecret;
process.env.MARKETPLACE_API_KEY = keys.apiKey;

/** Express 应用实例 */
const app = createApp();

/** 服务监听端口，默认 8268，可通过 PORT 环境变量覆盖 */
const PORT = parseInt(process.env.PORT || "8268", 10);
/** 监听地址，默认 0.0.0.0，可通过 HOST 环境变量覆盖 */
const HOST = process.env.HOST || "0.0.0.0";

/**
 * 启动 Express 服务端
 * 监听配置的端口和地址，启动后输出到控制台
 */
export function startServer(): void {
  app.listen(PORT, HOST, () => {
    console.log(`Marketplace server running on http://${HOST}:${PORT}`);
  });
}

// 兜底日志：未被捕获的 rejection / 异常不应静默丢失。
// Express 4 的 async 路由已通过 asyncHandler 转发，这里主要是最后一道观测防线。
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException:", err);
});

/** 自动启动服务 */
startServer();

export { app };
