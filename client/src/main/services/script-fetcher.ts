/**
 * @file ScriptFetcher — 远程脚本下载器
 * @description 从 Marketplace Server 下载任务脚本 zip 包，校验 SHA256 校验和，
 *              解压到本地 scripts 目录，解析 manifest.json 并写入 meta.json，
 *              最后注册到 task_templates 表。同时提供已安装脚本的管理功能。
 * @module main/services
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs'
import { createWriteStream } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createHash } from 'crypto'
import JSON5 from 'json5'
import { createLogger } from '../utils/logger'
import { extractZip } from '../utils/zipExtractor'
import type { RemoteScript, InstalledScript, PermissionSet } from '../../shared/types'
import type { StoreService } from './store'

const logger = createLogger('script-fetcher')

/**
 * 远程脚本下载与管理器
 *
 * 职责范围：
 * - 从 Marketplace Server 获取远程脚本列表
 * - 下载脚本 zip 包 → 校验 SHA256 → 解压到 {userData}/scripts/{scriptId}/
 * - 解析 manifest.json，提取运行时权限声明
 * - 写入 meta.json，注册到 task_templates 表
 * - 检查更新（比对本地与远程版本号）
 * - 列出/删除已安装脚本（同时清理关联任务和定时任务）
 *
 * @example
 * ```ts
 * const fetcher = new ScriptFetcher(store)
 * const scripts = await fetcher.fetchScriptList()
 * const installed = await fetcher.downloadScript(scriptId)
 * const updates = await fetcher.checkUpdates()
 * ```
 */
export class ScriptFetcher {
  private scriptsDir: string
  private store: StoreService
  private defaultServerUrl = 'http://localhost:3400'

  /**
   * @param store - StoreService 实例，用于读写数据库和配置   */
  constructor(store: StoreService) {
    this.store = store
    this.scriptsDir = join(app.getPath('userData'), 'scripts')
    if (!existsSync(this.scriptsDir)) {
      mkdirSync(this.scriptsDir, { recursive: true })
    }
  }

  /** 获取 Marketplace Server 基础 URL（从 setting 中读取，默认 localhost:3400 */
  getServerUrl(): string {
    const url = this.store.getSetting('marketplace_server_url')
    return url || this.defaultServerUrl
  }

  /** 构建 HTTP 认证头：优先使用 JWT token，其次 API key */
  private getAuthHeaders(): Record<string, string> {
    // Prefer JWT over API key
    const jwt = this.store.getSetting('marketplace_jwt')
    if (jwt) return { Authorization: `Bearer ${jwt}` }
    const key = this.store.getSetting('marketplace_api_key')
    return key ? { Authorization: `Bearer ${key}` } : {}
  }

  /**
   * 从 Marketplace Server 获取远程脚本列表
   *
   * @returns 远程脚本元数据数据
   * @throws 网络请求失败时抛出Error
   */
  async fetchScriptList(): Promise<RemoteScript[]> {
    const serverUrl = this.getServerUrl()
    const url = `${serverUrl}/api/scripts`
    const response = await fetch(url, { headers: this.getAuthHeaders() })
    if (!response.ok) {
      throw new Error(`Failed to fetch script list: ${response.status} ${response.statusText}`)
    }
    // 解析响应：兼容 {data: {items: [...]}} 和直接数组两种格式
    const json = (await response.json()) as Record<string, unknown>

    const data = json.data as Record<string, unknown> | undefined
    return (data?.items ?? json) as RemoteScript[]
  }

  /**
   * 下载并安装远程脚本
   *
   * 完整流程：
   * 1. 从远程列表查找指定脚本
   * 2. 创建本地 {userData}/scripts/{scriptId}/ 目录
   * 3. 下载 zip 包到临时文件
   * 4. 计算 SHA256 校验和并与服务端比对
   * 5. 解压到目标目录
   * 6. 读取并解析 manifest.json
   * 7. 提取运行时权限声明
   * 8. 写入 meta.json 持久化元数据
   * 9. 注册到 task_templates 表（已存在则更新）
   *
   * @param scriptId - 脚本 UUID
   * @returns 已安装脚本的完整元数据
   * @throws 脚本未找到、校验和不匹配、下载失败时抛出 Error
   */
  async downloadScript(scriptId: string): Promise<InstalledScript> {
    const scripts = await this.fetchScriptList()
    const script = scripts.find((s) => s.id === scriptId)
    if (!script) throw new Error(`Script not found: ${scriptId}`)

    const scriptDir = join(this.scriptsDir, scriptId)
    if (!existsSync(scriptDir)) {
      mkdirSync(scriptDir, { recursive: true })
    }

    const downloadUrl = script.downloadUrl.startsWith('http')
      ? script.downloadUrl
      : `${this.getServerUrl()}${script.downloadUrl}`

    // 把下载缓存放到系统临时目录（位于 scriptDir 之外），避免 zip 文件和
    // extractZip 在清理 destDir 时误删。这是防御性修复，详见 zipExtractor.ts
    const downloadCacheDir = join(tmpdir(), 'taskforge-downloads')
    if (!existsSync(downloadCacheDir)) {
      mkdirSync(downloadCacheDir, { recursive: true })
    }
    const tmpPath = join(downloadCacheDir, `${scriptId}-${randomUUID()}.zip`)

    try {
      await this.downloadFile(downloadUrl, tmpPath)

      const checksum = this.calculateChecksum(tmpPath)
      if (checksum !== script.checksum) {
        throw new Error(
          `Checksum mismatch for ${scriptId}: expected ${script.checksum}, got ${checksum}`
        )
      }

      const ext = this.getArchiveExtension(downloadUrl)
      await this.extractArchive(tmpPath, scriptDir, ext)

      const manifest = this.readManifest(scriptDir)
      const permissions = this.extractPermissions(manifest)

      const installed: InstalledScript = {
        id: script.id,
        name: (manifest.name as string) || script.name,
        version: (manifest.version as string) || script.version,
        description: (manifest.description as string) || script.description,
        entryPoint: (manifest.entryPoint as string) || 'index.js',
        schema: (manifest.schema as Record<string, unknown>) || script.schema,
        installPath: scriptDir,
        checksum: script.checksum,
        remoteUrl: this.getServerUrl(),
        downloadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions
      }

      writeFileSync(join(scriptDir, 'meta.json'), JSON.stringify(installed, null, 2))

      const existing = this.store.getTaskTemplate(installed.id)
      if (existing) {
        this.store.updateTaskTemplate(installed.id, {
          name: installed.name,
          version: installed.version,
          description: installed.description,
          installPath: installed.installPath,
          manifest: manifest,
          remoteUrl: installed.remoteUrl,
          isInstalled: true
        })
      } else {
        try {
          this.store.createTaskTemplate({
            id: installed.id,
            name: installed.name,
            version: installed.version,
            description: installed.description,
            installPath: installed.installPath,
            manifest: manifest,
            remoteUrl: installed.remoteUrl,
            isInstalled: true
          })
        } catch {
          // ignore duplicate
        }
      }

      logger.info('Script downloaded', { scriptId, version: script.version })

      // 检查 manifest 声明的 requiredAccountTemplateIds 中哪些账户模板本地未下载
      // 检查 dataRequirements 中是否有未下载的脚本参数模板
      const dataReqs = manifest.dataRequirements as
        | Array<{
            key: string
            source: string
            templateType: string
          }>
        | undefined
      if (dataReqs && dataReqs.length > 0) {
        const scriptParamReqs = dataReqs.filter((r) => r.source === 'script_param')
        if (scriptParamReqs.length > 0) {
          const templatesRes = this.store.listTemplates(1, 9999)
          const installedIds = new Set(templatesRes.items.map((t) => t.id))
          const requiredIds = scriptParamReqs.map((r) => r.templateType)
          const missing = requiredIds.filter((id) => !installedIds.has(id))
          if (missing.length > 0) {
            logger.warn('Script requires templates not installed locally', {
              scriptId,
              requiredIds,
              missing
            })
            ;(
              installed as InstalledScript & { missingAccountTemplates?: string[] }
            ).missingAccountTemplates = missing
          }
        }
      }

      return installed
    } finally {
      // 始终清理临时下载文件，无论成功或失败
      if (existsSync(tmpPath)) {
        rmSync(tmpPath, { force: true })
      }
    }
  }

  /**
   * 检查已安装脚本是否有可用更新
   *
   * 遍历所有已安装脚本，与远程列表比对版本号，
   * 返回版本号不同（有新版本）的远程脚本列表。
   *
   * @returns 需要更新的远程脚本数组
   */
  async checkUpdates(): Promise<RemoteScript[]> {
    const installed = this.getInstalledScripts()
    const remote = await this.fetchScriptList()

    return remote.filter((r) => {
      const local = installed.find((i) => i.id === r.id)
      return !local || local.version !== r.version
    })
  }

  /**
   * 获取所有已安装脚本列表
   *
   * 扫描 {userData}/scripts/ 目录，读取每个子目录下的 meta.json。
   * 使用 JSON5 解析以兼容宽松格式。
   *
   * @returns 已安装脚本数组
   */
  getInstalledScripts(): InstalledScript[] {
    if (!existsSync(this.scriptsDir)) return []

    const dirs = readdirSync(this.scriptsDir, { withFileTypes: true }).filter((d) =>
      d.isDirectory()
    )

    const scripts: InstalledScript[] = []
    for (const dir of dirs) {
      const metaPath = join(this.scriptsDir, dir.name, 'meta.json')
      if (!existsSync(metaPath)) continue
      try {
        const raw = readFileSync(metaPath, 'utf-8')
        const script = JSON5.parse(raw) as InstalledScript
        // 向后兼容：旧版 meta.json 可能没有 permissions 字段
        if (!script.permissions) {
          script.permissions = { network: false, filesystem: false }
        }
        scripts.push(script)
      } catch {
        logger.warn('Failed to read script meta', { path: metaPath })
      }
    }
    return scripts
  }

  /**
   * 卸载已安装的脚本
   *
   * 1. 删除关联的所有任务记录和日志
   * 2. 删除关联的定时任务
   * 3. 从 task_templates 表移除
   * 4. 删除脚本目录及所有文件
   *
   * @param scriptId - 脚本 UUID
   */
  removeScript(scriptId: string): void {
    const scriptDir = join(this.scriptsDir, scriptId)
    const tmpl = this.store.getTaskTemplate(scriptId)
    if (tmpl) {
      const installPath = tmpl.installPath
      const tasks = this.store.taskRepo.listTasks(1, 99999)
      for (const task of tasks.items) {
        if (task.scriptFolder === installPath || task.scriptFolder === scriptId) {
          this.store.taskRepo.clearTaskLogs(task.id)
          this.store.taskRepo.deleteTask(task.id)
        }
      }
      const scheduled = this.store.listScheduledTasks(1, 99999)
      for (const st of scheduled.items) {
        if (st.templateId === scriptId) {
          this.store.deleteScheduledTask(st.id)
        }
      }
      this.store.deleteTaskTemplate(scriptId)
    }
    if (existsSync(scriptDir)) {
      rmSync(scriptDir, { recursive: true, force: true })
      logger.info('Script removed', { scriptId })
    }
  }

  /**
   * 从 manifest 中提取运行时权限声明，缺失/非法值默认拒绝（安全优先）。
   */
  private extractPermissions(manifest: Record<string, unknown>): PermissionSet {
    const raw = manifest.permissions
    if (!Array.isArray(raw)) {
      return { network: false, filesystem: false }
    }
    const arr = raw as string[]
    return {
      network: arr.includes('network'),
      filesystem: arr.includes('filesystem')
    }
  }

  /** 读取并解析脚本目录中的 manifest.json（使用 JSON5 以兼容注释和宽松格式） */
  private readManifest(scriptDir: string): Record<string, unknown> {
    const manifestPath = join(scriptDir, 'manifest.json')
    if (!existsSync(manifestPath)) {
      logger.warn('No manifest.json found in extracted script', { scriptDir })
      return {}
    }
    try {
      const raw = readFileSync(manifestPath, 'utf-8')
      return JSON5.parse(raw) as Record<string, unknown>
    } catch (err) {
      logger.warn('Failed to parse manifest.json', { scriptDir, error: String(err) })
      return {}
    }
  }

  /** 内部：下载文件到本地，支持自动重试（指数退避，默认 3 次） */
  private async downloadFile(url: string, destPath: string, retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { headers: this.getAuthHeaders() })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        if (!response.body) {
          throw new Error('No response body')
        }

        const fileStream = createWriteStream(destPath)
        const nodeStream = await this.webStreamToNode(response.body)

        await pipeline(nodeStream, fileStream)
        return
      } catch (err) {
        if (attempt === retries) throw err
        logger.warn(`Download retry ${attempt}/${retries}`, { url, error: String(err) })
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  /** 内部辅助：将 Web ReadableStream 转换为 Node.js Readable 流 */
  private async webStreamToNode(stream: ReadableStream<Uint8Array>): Promise<Readable> {
    const reader = stream.getReader()
    return new Readable({
      async read() {
        const { done, value } = await reader.read()
        if (done) this.push(null)
        else this.push(Buffer.from(value))
      }
    })
  }

  /** 内部辅助：计算文件的 SHA256 校验和 */
  private calculateChecksum(filePath: string): string {
    const content = readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  }

  /** 从下载 URL 推断压缩包格式：支持 zip、tar、tar.gz */
  private getArchiveExtension(url: string): string {
    if (url.endsWith('.tar.gz') || url.endsWith('.tgz')) return 'tar.gz'
    if (url.endsWith('.tar')) return 'tar'
    return 'zip'
  }

  /**
   * 内部：解压脚本包到目标目录
   *
   * 用 JS 解压（adm-zip），跨平台一致行为，零外部命令依赖。
   * tar/tar.gz 暂不支持（当前仅 zip）。
   */
  private async extractArchive(archivePath: string, destDir: string, _ext: string): Promise<void> {
    if (_ext === 'tar.gz' || _ext === 'tar') {
      throw new Error('tar/tar.gz 暂不支持，请使用 zip 格式打包')
    }
    extractZip(archivePath, destDir)
  }
}
