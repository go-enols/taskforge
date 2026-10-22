/**
 * @file 服务端测试环境初始化
 * @description 在测试文件加载前：
 * 1. 把数据目录指向临时目录（避免写入 server/data 或本机真实数据库）
 * 2. 注入固定 JWT secret / API key（不依赖 .env）
 * 3. 关闭限流（避免用例之间互相影响）
 * @module server/test
 */
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const dataDir = mkdtempSync(join(tmpdir(), 'tf-server-test-'))

process.env.MARKETPLACE_DATA_DIR = dataDir
process.env.NODE_ENV = 'test'
process.env.DISABLE_RATE_LIMIT = '1'
process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef'
process.env.MARKETPLACE_API_KEY = 'legacy-demo-key'
// 默认关闭 legacy 全局 admin key；需要兼容旧部署时显式开启
process.env.ALLOW_LEGACY_ADMIN_KEY = '0'

process.on('exit', () => {
  try {
    rmSync(dataDir, { recursive: true, force: true })
  } catch {
    /* ignore cleanup errors */
  }
})
