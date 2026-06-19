/**
 * @file 结构化日志工具
 * @description 提供 JSON 格式的结构化日志，替代散落的 console.log/error。
 *              级别：debug / info / warn / error。生产环境默认 info，可通过 LOG_LEVEL 调整。
 *              输出格式：JSON 单行，含 timestamp / level / category / message / fields。
 * @module server/utils/logger
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** 当前最低输出级别（可通过 LOG_LEVEL 环境变量覆盖） */
const currentLevel: LogLevel = (() => {
  const env = (process.env.LOG_LEVEL || "").toLowerCase();
  if (env in LEVEL_PRIORITY) return env as LogLevel;
  return "info";
})();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  fields?: Record<string, unknown>;
}

/** 输出一条结构化日志到 stderr（避免干扰 stdout 的响应流） */
function emit(level: LogLevel, category: string, message: string, fields?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
  };
  if (fields && Object.keys(fields).length > 0) {
    entry.fields = fields;
  }
  process.stderr.write(JSON.stringify(entry) + "\n");
}

/** 日志记录器，绑定 category 前缀，便于按模块过滤 */
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** 创建带 category 的日志记录器 */
export function createLogger(category: string): Logger {
  return {
    debug: (msg, fields) => emit("debug", category, msg, fields),
    info: (msg, fields) => emit("info", category, msg, fields),
    warn: (msg, fields) => emit("warn", category, msg, fields),
    error: (msg, fields) => emit("error", category, msg, fields),
  };
}

/** 默认通用日志记录器（无特定 category） */
export const logger = createLogger("server");
