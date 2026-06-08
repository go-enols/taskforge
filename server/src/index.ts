/**
 * @file Express 服务端入口
 * @description 初始化 Express 应用，配置 CORS、限流、路由挂载和错误处理。
 *              监听 127.0.0.1:3400，提供脚本/模板市场的 RESTful API。
 * @module server
 */
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "./middleware/auth";
import { ensureKeys } from "./utils/keys";
import authRouter from "./routes/auth";
import scriptsRouter from "./routes/scripts";
import templatesRouter from "./routes/templates";
import usersRouter from "./routes/users";
import projectTemplatesRouter from "./routes/project-templates";
import { stmts } from "./db";

// Ensure keys are generated and loaded
/** 确保 JWT 和 API 密钥存在，注入环境变量 */
const keys = ensureKeys();
process.env.JWT_SECRET = keys.jwtSecret;
process.env.MARKETPLACE_API_KEY = keys.apiKey;

/** Express 应用实例 */
const app = express();
/** 服务监听端口，默认 3400，可通过 PORT 环境变量覆盖 */
const PORT = parseInt(process.env.PORT || "3400", 10);
/** 监听地址，默认 127.0.0.1，可通过 HOST 环境变量覆盖 */
const HOST = process.env.HOST || "127.0.0.1";

/** 启用 CORS 跨域支持 */
app.use(cors());
/** 解析 JSON 请求体 */
app.use(express.json());

// Rate limiting
/** 认证端点限流器：每分钟最多 10 次请求 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many auth requests, try again later",
      code: "RATE_LIMITED",
    },
  },
});

/** 通用 API 限流器：每分钟最多 100 次请求 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many requests, try again later",
      code: "RATE_LIMITED",
    },
  },
});

// Health check (no rate limit)
/** 健康检查端点：返回服务状态、时间戳和是否需要初始化 */
app.get("/api/health", (_req, res) => {
  const count = stmts.userCount.get() as { count: number }
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    needsSetup: count.count === 0
  })
})

// Auth routes — stricter rate limit, no auth middleware required
/** 认证路由（带限流，无需认证中间件） */
app.use("/api/auth", authLimiter, authRouter);

/** 脚本/模板/用户路由（需要认证 + 限流） */
app.use("/api/scripts", authMiddleware, apiLimiter, scriptsRouter);
app.use("/api/templates", authMiddleware, apiLimiter, templatesRouter);
app.use("/api/project-templates", authMiddleware, apiLimiter, projectTemplatesRouter);
app.use("/api/users", authMiddleware, apiLimiter, usersRouter);

// Global error handler
/** 全局错误处理中间件：捕获未处理的异常 */
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err)
  res.status(500).json({ error: { message: err.message || 'Internal server error', code: 'INTERNAL_ERROR' } })
})

/** 404 兜底处理：所有未匹配路由返回 404 */
app.use((_req, res) => {
  res.status(404).json({ error: { message: "Not found", code: "NOT_FOUND" } });
});

/**
 * 启动 Express 服务端
 * 监听配置的端口和地址，启动后输出日志到控制台
 */
export function startServer(): void {
  app.listen(PORT, HOST, () => {
    console.log(`Marketplace server running on http://${HOST}:${PORT}`);
  });
}

/** 自动启动服务 */
startServer();
