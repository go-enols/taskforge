/**
 * Monkey-patch process.stdout/stderr.write to silently ignore EPIPE errors.
 *
 * EPIPE occurs when the parent process pipe is closed (e.g. terminal closed
 * or app is shutting down), but Node.js still tries to write to stdout/stderr.
 * This catches ALL EPIPE regardless of origin: Logger, raw console.*, HTTP
 * server internals, or any third-party code.
 */
function wrapStream(stream: NodeJS.WriteStream): void {
  const orig = stream.write.bind(stream) as typeof stream.write
  stream.write = function (...args: Parameters<typeof orig>): boolean {
    try {
      return orig(...args)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EPIPE') {
        // Swallow EPIPE silently — stream is gone, nothing to do
        return false
      }
      throw err
    }
  } as typeof stream.write
}

wrapStream(process.stdout)
wrapStream(process.stderr)

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

function resolveLogLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase()
  if (env && env in LOG_LEVEL_PRIORITY) {
    return env as LogLevel
  }
  return 'info'
}

const currentLogLevel: LogLevel = resolveLogLevel()

let isShuttingDown = false

type DbLoggerFn = (level: string, category: string, message: string, fields?: Record<string, unknown>) => void

export class Logger {
  private static dbLogger?: DbLoggerFn

  constructor(public readonly category: string) {}

  /**
   * Register a callback that writes logs to the database.
   * Called by StoreService after DB is ready.
   */
  static setDbLogger(fn: DbLoggerFn): void {
    Logger.dbLogger = fn
  }

  /**
   * Signal all loggers to suppress further output.
   * Call this early in app 'before-quit' so that late cleanup logging
   * doesn't attempt to write to a broken pipe.
   */
  static shutdown(): void {
    isShuttingDown = true
  }

  private shouldLog(level: LogLevel): boolean {
    if (isShuttingDown) return false
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel]
  }

  private format(level: LogLevel, msg: string, fields?: Record<string, unknown>): string {
    const base = `[${level.toUpperCase()}] [${this.category}] ${msg}`
    if (fields && Object.keys(fields).length > 0) {
      return `${base} ${JSON.stringify(fields)}`
    }
    return base
  }

  private emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return
    const formatted = this.format(level, msg, fields)
    console[level](formatted)
    try {
      Logger.dbLogger?.(level, this.category, msg, fields)
    } catch {
      // Swallow DB errors — never let logging break the app
    }
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit('debug', msg, fields)
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit('info', msg, fields)
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit('warn', msg, fields)
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit('error', msg, fields)
  }
}

export function createLogger(category: string): Logger {
  return new Logger(category)
}
