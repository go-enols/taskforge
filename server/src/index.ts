import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "./middleware/auth";
import { ensureKeys } from "./utils/keys";
import authRouter from "./routes/auth";
import scriptsRouter from "./routes/scripts";
import templatesRouter from "./routes/templates";
import usersRouter from "./routes/users";
import { stmts } from "./db";

// Ensure keys are generated and loaded
const keys = ensureKeys();
process.env.JWT_SECRET = keys.jwtSecret;
process.env.MARKETPLACE_API_KEY = keys.apiKey;

const app = express();
const PORT = parseInt(process.env.PORT || "3400", 10);
const HOST = process.env.HOST || "127.0.0.1";

app.use(cors());
app.use(express.json());

// Rate limiting
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
app.get("/api/health", (_req, res) => {
  const count = stmts.userCount.get() as { count: number }
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    needsSetup: count.count === 0
  })
})

// Auth routes — stricter rate limit, no auth middleware required
app.use("/api/auth", authLimiter, authRouter);

// Protected marketplace routes
app.use("/api/scripts", authMiddleware, apiLimiter, scriptsRouter);
app.use("/api/templates", authMiddleware, apiLimiter, templatesRouter);
app.use("/api/users", authMiddleware, apiLimiter, usersRouter);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err)
  res.status(500).json({ error: { message: err.message || 'Internal server error', code: 'INTERNAL_ERROR' } })
})

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: { message: "Not found", code: "NOT_FOUND" } });
});

export function startServer(): void {
  app.listen(PORT, HOST, () => {
    console.log(`Marketplace server running on http://${HOST}:${PORT}`);
  });
}

startServer();
