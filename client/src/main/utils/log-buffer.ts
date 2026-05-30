import type { TaskLogLevel } from '../../shared/types'

export interface LogEntry {
  level: TaskLogLevel
  message: string
  timestamp: string
}

export class LogBuffer {
  private lines: LogEntry[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private truncated = 0

  constructor(
    private flushCallback: (lines: LogEntry[]) => void,
    private flushIntervalMs = 50,
    private maxBatchSize = 20,
    private maxBufferLines = 200
  ) {}

  push(level: TaskLogLevel, message: string): void {
    if (this.lines.length >= this.maxBufferLines) {
      this.lines.shift()
      this.truncated++
    }

    this.lines.push({
      level,
      message: message.endsWith('\n') ? message.slice(0, -1) : message,
      timestamp: new Date().toISOString()
    })

    if (this.lines.length >= this.maxBatchSize) {
      this.flush()
      return
    }

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushIntervalMs)
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.lines.length === 0) return

    const batch = [...this.lines]
    this.lines = []

    if (this.truncated > 0) {
      batch.push({
        level: 'warn' as TaskLogLevel,
        message: `[truncated ${this.truncated} earlier lines]`,
        timestamp: new Date().toISOString()
      })
      this.truncated = 0
    }

    this.flushCallback(batch)
  }

  destroy(): void {
    this.flush()
  }
}
