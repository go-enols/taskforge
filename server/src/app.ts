/**
 * @file Express 应用工厂
 * @description 构建 Express 应用（安全响应头、CORS、限流、路由、统一错误处理），不负责监听端口。
 *              拆出工厂函数以便自动化测试（supertest）直接挂载 app，而无需启动真实端口。
 * @module server/app
 */
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "./middleware/auth";
import authRouter from "./routes/auth";
import scriptsRouter from "./routes/scripts";
import templatesRouter from "./routes/templates";
import usersRouter from "./routes/users";
import projectTemplatesRouter from "./routes/project-templates";
import { stmts, db } from "./db";

/** 应用创建选项 */
export interface CreateAppOptions {
  /** 额外允许的 CORS 来源（默认读取环境变量 CORS_ORIGINS） */
  corsOrigins?: string[];
}

/** 本机来源（Electron 开发服务器 / 本地 Web 调试） */
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * 默认 CORS 白名单：Electron 降级传输端口、开发态 vite dev server。
 * `*` 表示允许任意来源（保留上游行为，便于远程 Web 客户端接入；可用 CORS_ORIGINS 扩展）。
 */
const DEFAULT_CORS_WHITELIST = [
  "http://127.0.0.1:34116",
  "http://localhost:34116",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "*",
];

/**
 * 创建 Express 应用（不监听端口）。
 * @param options - 可选的 CORS 来源覆盖（测试用）
 * @returns 配置完成的 Express 实例
 */
export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();

  // 生产部署位于 nginx / Cloudflare 之后：信任一层反向代理（nginx 已通过
  // set_real_ip_from + CF-Connecting-IP 还原真实客户端 IP 到 X-Forwarded-For），
  // 否则 express-rate-limit 无法识别用户且会持续打印 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR。
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const extraOrigins =
    options.corsOrigins ??
    (process.env.CORS_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const corsWhitelist = [...DEFAULT_CORS_WHITELIST, ...extraOrigins];
  const allowAllOrigins = corsWhitelist.includes("*");

  /** 测试环境下关闭限流，避免用例互相干扰 */
  const skipRateLimit = (): boolean => process.env.DISABLE_RATE_LIMIT === "1";

  /**
   * CORS 来源校验：
   * - 非浏览器请求（无 Origin）/ Electron file:// 页面（Origin: null）放行
   * - 白名单命中放行；未配置 `*` 时，本机 localhost/127.0.0.1 任意端口放行
   * - 其余来源不返回 CORS 头（浏览器侧拦截），不做前缀匹配，避免 `localhost.evil.com` 绕过
   */
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origin === "null") {
          callback(null, true);
          return;
        }
        const allowed =
          allowAllOrigins ||
          corsWhitelist.includes(origin) ||
          LOCAL_ORIGIN_PATTERN.test(origin);
        callback(null, allowed);
      },
    }),
  );

  /** 基础安全响应头 */
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    next();
  });

  /** 解析 JSON 请求体（限制 10MB 防止大 JSON 攻击；上传 zip 走 multipart） */
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  /** 认证端点限流：每分钟最多 10 次请求 */
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    message: {
      error: { message: "Too many auth requests, try again later", code: "RATE_LIMITED" },
    },
  });

  /** 通用 API 限流：每分钟最多 100 次请求 */
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    message: {
      error: { message: "Too many requests, try again later", code: "RATE_LIMITED" },
    },
  });

  // Health check (no rate limit)
  /** 健康检查端点：探活数据库连接，返回服务状态、时间戳和是否需要初始化 */
  app.get("/api/health", (_req, res) => {
    let dbStatus: "connected" | "disconnected" = "connected";
    let needsSetup = false;
    try {
      db.prepare("SELECT 1").get();
      const count = stmts.userCount.get() as { count: number };
      needsSetup = count.count === 0;
    } catch {
      dbStatus = "disconnected";
    }
    res.json({
      status: dbStatus === "connected" ? "ok" : "degraded",
      db: dbStatus,
      timestamp: new Date().toISOString(),
      needsSetup,
    });
  });

  // Auth routes — stricter rate limit, no auth middleware required
  app.use("/api/auth", authLimiter, authRouter);

  /**
   * 脚本/模板/用户路由：限流先于认证执行，避免未认证请求绕过限流计数。
   * 认证中间件对 GET 放行（公开读取），写请求要求 Bearer Token。
   */
  app.use("/api/scripts", apiLimiter, authMiddleware, scriptsRouter);
  app.use("/api/templates", apiLimiter, authMiddleware, templatesRouter);
  app.use("/api/project-templates", apiLimiter, authMiddleware, projectTemplatesRouter);
  app.use("/api/users", apiLimiter, authMiddleware, usersRouter);

  /** 404 兜底处理：所有未匹配路由返回 404 */
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { message: "Not found", code: "NOT_FOUND" } });
  });

  /**
   * 全局错误处理中间件。
   *
   * 统一把 body-parser / multer / 业务错误映射为正确的 HTTP 状态码，
   * 并且不把数据库/文件系统内部细节原样暴露给客户端（5xx 时）。
   */
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const e = (err ?? {}) as {
      status?: number;
      statusCode?: number;
      type?: string;
      code?: string | number;
      message?: string;
      body?: unknown;
    };

    let status =
      typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : 500;
    let code = typeof e.code === "string" ? e.code : undefined;
    let message = e.message || "Internal server error";

    // express.json 解析失败 / 请求体过大
    if (e.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in e)) {
      status = 400;
      code = "INVALID_JSON";
      message = "请求体不是有效的 JSON";
    } else if (e.type === "entity.too.large") {
      status = 413;
      code = "PAYLOAD_TOO_LARGE";
      message = "请求体过大（JSON 上限 10MB）";
    } else if (e.code === "LIMIT_FILE_SIZE") {
      status = 413;
      code = "FILE_TOO_LARGE";
      message = "上传文件过大（最大 50MB）";
    } else if (e.code === "LIMIT_UNEXPECTED_FILE") {
      status = 400;
      code = "INVALID_UPLOAD";
      message = "上传字段名不匹配，应使用 file 字段";
    } else if (e.code === "SQLITE_CONSTRAINT_UNIQUE" || e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      status = 409;
      code = "CONFLICT";
      message = "数据已存在，操作冲突";
    }

    if (status >= 500) {
      console.error("[server] Unhandled error:", err);
      if (process.env.NODE_ENV === "production") {
        message = "服务器内部错误";
      }
    }

    res.status(status).json({
      error: { message, code: code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR") },
    });
  });

  return app;
}
