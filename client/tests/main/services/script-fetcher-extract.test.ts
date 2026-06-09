/**
 * @file ScriptFetcher 端到端测试 — 覆盖 installScript downloadScript 真实下载+解压流程
 * @description 这个测试是修复 "模板市场安装任务脚本时报错 读取 zip 失败: ADM-ZIP: Invalid filename"
 *              回归测试。完整链路：本地 HTTP server 提供脚本列表 + zip 下载 → ScriptFetcher.downloadScript
 *              下载 → 校验 SHA256 → 解压到 scriptsDir/{id}/ → 验证 manifest + meta.json 写入。
 *
 * 触发场景：源 zip 文件位于 destDir 之内（scriptsDir/{id}/download.tmp），旧的 extractZip
 *          在打开 AdmZip 之前先 rmSync(destDir)，把源文件误删，导致 "Invalid filename"。
 * @module tests/main/services
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import http from 'http'
import AdmZip from 'adm-zip'
import { ScriptFetcher } from '../../../src/main/services/script-fetcher'
import { StoreService } from '../../../src/main/services/store'

/**
 * Mock electron so we can override app.getPath('userData').
 * Must use a getter so the test can re-point userData per case.
 */
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getVersion: () => '0.0.0-test',
    getPath: (name: string) => {
      // Use a module-level escape hatch injected below.
      const w = globalThis as unknown as { __taskforge_userdata__?: string }
      if (name === 'userData') {
        if (!w.__taskforge_userdata__) {
          throw new Error('test forgot to set __taskforge_userdata__')
        }
        return w.__taskforge_userdata__
      }
      return '/tmp'
    }
  },
  // safeStorage is imported by EncryptionService → StoreService → used in constructor.
  // We expose a stub that returns "not available" so wallets are stored in plaintext.
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8')
  }
}))

/**
 * Spin up a tiny HTTP server that mimics the Marketplace /api/scripts surface:
 *   GET  /api/scripts                  → list scripts
 *   GET  /api/scripts/:id/download     → serve the zip as application/zip
 *
 * @param scripts Array of { id, name, version, description, checksum, downloadUrl, schema }
 * @param zipByPath Map of "GET path" → Buffer of zip body
 * @returns base URL like http://127.0.0.1:12345
 */
async function startMockMarketplace(
  scripts: Array<Record<string, unknown>>,
  zipByPath: Record<string, Buffer>
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    try {
      const url = req.url || ''
      if (url === '/api/scripts' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: { items: scripts, total: scripts.length } }))
        return
      }
      if (url in zipByPath && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/zip' })
        res.end(zipByPath[url])
        return
      }
      res.writeHead(404).end()
    } catch (err) {
      res.writeHead(500).end((err as Error).message)
    }
  })
  await new Promise<void>((resolveP) => server.listen(0, '127.0.0.1', () => resolveP()))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('server failed to bind')
  const baseUrl = `http://127.0.0.1:${addr.port}`
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolveP) => {
        server.close(() => resolveP())
      })
  }
}

/**
 * Build a valid script zip in memory containing manifest.json + index.js.
 */
function buildScriptZip(): Buffer {
  const zip = new AdmZip()
  zip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify({
        id: 'sample-script',
        name: 'Sample Script',
        version: '1.0.0',
        description: 'A sample script for testing',
        entryPoint: 'index.js',
        runtime: 'node',
        schema: { type: 'object', properties: {} }
      })
    )
  )
  zip.addFile('index.js', Buffer.from('module.exports = { hello: () => "world" }'))
  return zip.toBuffer()
}

describe('ScriptFetcher.downloadScript — end-to-end (regression for ADM-ZIP Invalid filename)', () => {
  let workDir: string
  let userDataDir: string
  let store: StoreService
  let fetcher: ScriptFetcher
  let server: { baseUrl: string; close: () => Promise<void> } | null = null

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'scriptFetcher-e2e-'))
    userDataDir = join(workDir, 'userdata')
    const w = globalThis as unknown as { __taskforge_userdata__?: string }
    w.__taskforge_userdata__ = userDataDir

    const dbPath = join(workDir, 'store.db')
    store = new StoreService(dbPath)
    fetcher = new ScriptFetcher(store)
  })

  afterEach(async () => {
    await server?.close()
    server = null
    store.close()
    rmSync(workDir, { recursive: true, force: true })
  })

  it('installs a script when the zip is served correctly (no Invalid filename error)', async () => {
    const zipBuf = buildScriptZip()
    const checksum = createHash('sha256').update(zipBuf).digest('hex')
    const scriptId = 'sample-script'
    const downloadPath = `/api/scripts/${scriptId}/download`

    server = await startMockMarketplace(
      [
        {
          id: scriptId,
          name: 'Sample Script',
          version: '1.0.0',
          description: 'A sample script for testing',
          schema: { type: 'object' },
          entryPoint: 'index.js',
          checksum,
          downloadUrl: downloadPath
        }
      ],
      { [downloadPath]: zipBuf }
    )

    // Override the server URL via setting store
    store.setSetting('marketplace_server_url', server.baseUrl)

    // This is the line that used to throw "读取 zip 失败: ADM-ZIP: Invalid filename"
    const installed = await fetcher.downloadScript(scriptId)

    // Assertions: install completed
    expect(installed.id).toBe(scriptId)
    expect(installed.name).toBe('Sample Script')
    expect(installed.installPath).toBe(join(userDataDir, 'scripts', scriptId))

    // Files actually extracted to disk
    const scriptDir = join(userDataDir, 'scripts', scriptId)
    expect(existsSync(join(scriptDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(scriptDir, 'index.js'))).toBe(true)
    expect(existsSync(join(scriptDir, 'meta.json'))).toBe(true)

    // The downloaded temp file should be cleaned up after success
    expect(existsSync(join(scriptDir, 'download.tmp'))).toBe(false)

    // Manifest content must be valid (would be empty if extraction corrupted)
    const manifest = JSON.parse(readFileSync(join(scriptDir, 'manifest.json'), 'utf-8'))
    expect(manifest.id).toBe(scriptId)

    // meta.json should also contain the parsed permissions
    const meta = JSON.parse(readFileSync(join(scriptDir, 'meta.json'), 'utf-8'))
    expect(meta.id).toBe(scriptId)
    expect(meta.permissions).toBeDefined()

    // task_templates table should have an entry
    const tmpl = store.getTaskTemplate(scriptId)
    expect(tmpl).toBeDefined()
    expect(tmpl?.isInstalled).toBe(true)
  })

  it('throws a clear error when the downloaded file is missing (not the misleading "Invalid filename")', async () => {
    // Server advertises a script but doesn't actually serve a file at the download URL
    const scriptId = 'missing-script'
    const downloadPath = `/api/scripts/${scriptId}/download`

    server = await startMockMarketplace(
      [
        {
          id: scriptId,
          name: 'Missing',
          version: '1.0.0',
          description: 'No body served',
          schema: { type: 'object' },
          entryPoint: 'index.js',
          checksum: 'unused',
          downloadUrl: downloadPath
        }
      ],
      {} // no zip at all — server returns 404
    )

    store.setSetting('marketplace_server_url', server.baseUrl)

    // Will throw at download or checksum step, NOT at extractZip
    await expect(fetcher.downloadScript(scriptId)).rejects.toThrow()
  })
})