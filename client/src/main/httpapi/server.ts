import { createServer, IncomingMessage, ServerResponse } from 'http'
import { executeHandler } from '../ipc'
import { createLogger } from '../utils/logger'

const logger = createLogger('http')

interface HttpRequest {
  channel: string
  args: unknown[]
}

export class HttpApiServer {
  private server: ReturnType<typeof createServer> | null = null
  private actualPort: number | null = null

  constructor(
    private port = 34116,
    private authToken: string = ''
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res))

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && this.port < 34126) {
          this.port++
          this.server!.close()
          this.server!.listen(this.port, '127.0.0.1')
          return
        }
        logger.error('HTTP server error', { error: err.message })
        reject(err)
      })

      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server!.address()
        this.actualPort = typeof addr === 'object' && addr !== null ? addr.port : this.port
        logger.info('HTTP API server started', { port: this.actualPort })
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      const srv = this.server
      this.server = null
      srv.close(() => {
        resolve()
      })
    })
  }

  getPort(): number {
    return this.actualPort ?? this.port
  }

  getAddress(): string {
    return `http://127.0.0.1:${this.getPort()}`
  }

  /**
   * 判断请求 Origin 是否为受信任的本机来源。
   *
   * - 无 Origin：非浏览器请求（curl / 主进程内部），允许
   * - `null`：Electron 打包后 file:// 页面的 Origin，允许（配合 Bearer token 鉴权）
   * - http(s)://localhost | 127.0.0.1 | [::1]（任意端口）：开发服务器，允许
   *
   * 拒绝 `http://localhost.evil.com` 这类前缀伪造来源。
   */
  private isAllowedOrigin(origin: string): boolean {
    if (!origin) return true
    if (origin === 'null') return true
    try {
      const parsed = new URL(origin)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
      return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    } catch {
      return false
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json')
    const origin = req.headers.origin || ''
    const allowedOrigin = this.isAllowedOrigin(origin)
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*')
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      if (!allowedOrigin) {
        res.writeHead(403)
        res.end(JSON.stringify({ error: { message: 'Origin not allowed', code: 'FORBIDDEN' } }))
        return
      }
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/api/health') {
      res.writeHead(200)
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
      return
    }

    if (this.authToken) {
      const auth = req.headers.authorization
      if (!auth || auth !== `Bearer ${this.authToken}`) {
        res.writeHead(401)
        res.end(JSON.stringify({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }))
        return
      }
    }

    if (req.method === 'POST' && req.url === '/api/call') {
      try {
        const body = await this.readBody(req)
        const { channel, args = [] } = JSON.parse(body) as HttpRequest

        if (!channel || typeof channel !== 'string') {
          res.writeHead(400)
          res.end(
            JSON.stringify({
              error: { message: 'Missing or invalid channel', code: 'VALIDATION_ERROR' }
            })
          )
          return
        }

        const result = await executeHandler(channel, args as unknown[])
        res.writeHead(200)
        res.end(JSON.stringify(result))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('HTTP request error', { error: message })
        res.writeHead(500)
        res.end(JSON.stringify({ error: { message, code: 'INTERNAL_ERROR' } }))
      }
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ error: { message: 'Not found', code: 'NOT_FOUND' } }))
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10MB
      let totalSize = 0
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length
        if (totalSize > MAX_BODY_SIZE) {
          reject(new Error('Request body too large (max 10MB)'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      req.on('error', reject)
    })
  }
}
