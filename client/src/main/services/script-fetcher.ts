/**
 * @file ScriptFetcher 鈥?杩滅▼鑴氭湰涓嬭浇鍣? * @description 浠?Marketplace Server 涓嬭浇浠诲姟鑴氭湰 zip 鍖咃紝鏍￠獙 SHA256 鏍￠獙鍜岋紝
 *              瑙ｅ帇鍒版湰鍦?scripts 鐩綍锛岃В鏋?manifest.json 骞跺啓鍏?meta.json锛? *              鏈€鍚庢敞鍐屽埌 task_templates 琛ㄣ€傚悓鏃舵彁渚涘凡瀹夎鑴氭湰鐨勭鐞嗗姛鑳姐€? * @module main/services
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
 * 杩滅▼鑴氭湰涓嬭浇涓庣鐞嗗櫒
 *
 * 鑱岃矗鑼冨洿锛? * - 浠?Marketplace Server 鑾峰彇杩滅▼鑴氭湰鍒楄〃
 * - 涓嬭浇鑴氭湰 zip 鍖?鈫?鏍￠獙 SHA256 鈫?瑙ｅ帇鍒?{userData}/scripts/{scriptId}/
 * - 瑙ｆ瀽 manifest.json锛屾彁鍙栬繍琛屾椂鏉冮檺澹版槑
 * - 鍐欏叆 meta.json锛屾敞鍐屽埌 task_templates 琛? * - 妫€鏌ユ洿鏂帮紙姣斿鏈湴涓庤繙绋嬬増鏈彿锛? * - 鍒楀嚭/鍒犻櫎宸插畨瑁呰剼鏈紙鍚屾椂娓呯悊鍏宠仈浠诲姟鍜屽畾鏃朵换鍔★級
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
   * @param store - StoreService 瀹炰緥锛岀敤浜庤鍐欐暟鎹簱鍜岄厤缃?   */
  constructor(store: StoreService) {
    this.store = store
    this.scriptsDir = join(app.getPath('userData'), 'scripts')
    if (!existsSync(this.scriptsDir)) {
      mkdirSync(this.scriptsDir, { recursive: true })
    }
  }

  /** 鑾峰彇 Marketplace Server 鍩虹 URL锛堜粠 setting 涓鍙栵紝榛樿 localhost:3400锛?*/
  getServerUrl(): string {
    const url = this.store.getSetting('marketplace_server_url')
    return url || this.defaultServerUrl
  }

  /** 鏋勯€?HTTP 璁よ瘉澶达細浼樺厛浣跨敤 JWT token锛屽叾娆?API key */
  private getAuthHeaders(): Record<string, string> {
    // Prefer JWT over API key
    const jwt = this.store.getSetting('marketplace_jwt')
    if (jwt) return { Authorization: `Bearer ${jwt}` }
    const key = this.store.getSetting('marketplace_api_key')
    return key ? { Authorization: `Bearer ${key}` } : {}
  }

  /**
   * 浠?Marketplace Server 鑾峰彇杩滅▼鑴氭湰鍒楄〃
   *
   * @returns 杩滅▼鑴氭湰鍏冩暟鎹暟缁?   * @throws 缃戠粶璇锋眰澶辫触鏃舵姏鍑?Error
   */
  async fetchScriptList(): Promise<RemoteScript[]> {
    const serverUrl = this.getServerUrl()
    const url = `${serverUrl}/api/scripts`
    const response = await fetch(url, { headers: this.getAuthHeaders() })
    if (!response.ok) {
      throw new Error(`Failed to fetch script list: ${response.status} ${response.statusText}`)
    }
    // 瑙ｆ瀽鍝嶅簲锛氬吋瀹?{data: {items: [...]}} 鍜岀洿鎺ユ暟缁勪袱绉嶆牸寮?    
    const json = (await response.json()) as Record<string, unknown>

    const data = json.data as Record<string, unknown> | undefined
    return (data?.items ?? json) as RemoteScript[]
  }

  /**
   * 涓嬭浇骞跺畨瑁呰繙绋嬭剼鏈?   *
   * 瀹屾暣娴佺▼锛?   * 1. 浠庤繙绋嬪垪琛ㄦ煡鎵炬寚瀹氳剼鏈?   * 2. 鍒涘缓鏈湴 {userData}/scripts/{scriptId}/ 鐩綍
   * 3. 涓嬭浇 zip 鍖呭埌涓存椂鏂囦欢
   * 4. 璁＄畻 SHA256 鏍￠獙鍜屽苟涓庢湇鍔＄姣斿
   * 5. 瑙ｅ帇鍒扮洰鏍囩洰褰?   * 6. 璇诲彇骞惰В鏋?manifest.json
   * 7. 鎻愬彇杩愯鏃舵潈闄愬０鏄?   * 8. 鍐欏叆 meta.json 鎸佷箙鍖栧厓鏁版嵁
   * 9. 娉ㄥ唽鍒?task_templates 琛紙宸插瓨鍦ㄥ垯鏇存柊锛?   *
   * @param scriptId - 鑴氭湰 UUID
   * @returns 宸插畨瑁呰剼鏈殑瀹屾暣鍏冩暟鎹?   * @throws 鑴氭湰鏈壘鍒般€佹牎楠屽拰涓嶅尮閰嶃€佷笅杞藉け璐ユ椂鎶涘嚭 Error
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

    // 把下载缓存放到系统临时目录（位于 scriptDir 之外），避免 zip 文件被
    // extractZip 在清理 destDir 时误删。这是防御性修复，详见 zipExtractor.ts。
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
      // 注意: 这里是软检查, 仍然返回 installed 由 UI 决定是否提示
      const requiredIds = manifest.requiredAccountTemplateIds as string[] | undefined
      if (requiredIds && requiredIds.length > 0) {
        const templatesRes = this.store.listTemplates(1, 9999)
        const installedIds = new Set(templatesRes.items.map((t) => t.id))
        const missing = requiredIds.filter((id) => !installedIds.has(id))
        if (missing.length > 0) {
          logger.warn('Script requires account templates not installed locally', {
            scriptId,
            requiredIds,
            missing
          })
          ;(installed as InstalledScript & { missingAccountTemplates?: string[] }).missingAccountTemplates = missing
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
   * 妫€鏌ュ凡瀹夎鑴氭湰鏄惁鏈夊彲鐢ㄦ洿鏂?   *
   * 閬嶅巻鎵€鏈夊凡瀹夎鑴氭湰锛屼笌杩滅▼鍒楄〃姣斿鐗堟湰鍙凤紝
   * 杩斿洖鐗堟湰鍙蜂笉鍚岋紙鏈夋柊鐗堟湰锛夌殑杩滅▼鑴氭湰鍒楄〃銆?   *
   * @returns 闇€瑕佹洿鏂扮殑杩滅▼鑴氭湰鏁扮粍
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
   * 鑾峰彇鎵€鏈夊凡瀹夎鑴氭湰鍒楄〃
   *
   * 鎵弿 {userData}/scripts/ 鐩綍锛岃鍙栨瘡涓瓙鐩綍涓嬬殑 meta.json锛?   * 浣跨敤 JSON5 瑙ｆ瀽浠ュ吋瀹瑰鏉炬牸寮忋€?   *
   * @returns 宸插畨瑁呰剼鏈暟缁?   */
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
        // 鍚戝悗鍏煎锛氭棫鐗?meta.json 鍙兘娌℃湁 permissions 瀛楁
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
   * 鍗歌浇宸插畨瑁呯殑鑴氭湰
   *
   * 1. 鍒犻櫎鍏宠仈鐨勬墍鏈変换鍔¤褰曞拰鏃ュ織
   * 2. 鍒犻櫎鍏宠仈鐨勫畾鏃朵换鍔?   * 3. 浠?task_templates 琛ㄧЩ闄?   * 4. 鍒犻櫎鑴氭湰鐩綍鍙婃墍鏈夋枃浠?   *
   * @param scriptId - 鑴氭湰 UUID
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
   * 浠?manifest 涓彁鍙栬繍琛屾椂鏉冮檺澹版槑锛岀己澶?闈炴硶鍊奸粯璁ゆ嫆缁濓紙瀹夊叏浼樺厛锛夈€?   */
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

  /** 璇诲彇骞惰В鏋愯剼鏈洰褰曚腑鐨?manifest.json锛堜娇鐢?JSON5 浠ュ吋瀹规敞閲婂拰瀹芥澗鏍煎紡锛?*/
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

  /** 鍐呴儴锛氫笅杞芥枃浠跺埌鏈湴锛屾敮鎸佽嚜鍔ㄩ噸璇曪紙鎸囨暟閫€閬匡紝榛樿 3 娆★級 */
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

  /** 鍐呴儴杈呭姪锛氬皢 Web ReadableStream 杞崲涓?Node.js Readable 娴?*/
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

  /** 鍐呴儴杈呭姪锛氳绠楁枃浠剁殑 SHA256 鏍￠獙鍜?*/
  private calculateChecksum(filePath: string): string {
    const content = readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  }

  /** 浠庝笅杞?URL 鎺ㄦ柇鍘嬬缉鍖呮牸寮忥細鏀寔 zip銆乼ar銆乼ar.gz */
  private getArchiveExtension(url: string): string {
    if (url.endsWith('.tar.gz') || url.endsWith('.tgz')) return 'tar.gz'
    if (url.endsWith('.tar')) return 'tar'
    return 'zip'
  }

  /**
   * 内部：解压脚本包到目标目录
   *
   * 纯 JS 解压（adm-zip），跨平台一致行为，零外部命令依赖。
   * tar/tar.gz 暂不支持（当前仅 zip）。
   */
  private async extractArchive(archivePath: string, destDir: string, _ext: string): Promise<void> {
    if (_ext === 'tar.gz' || _ext === 'tar') {
      throw new Error('tar/tar.gz 暂不支持，请使用 zip 格式打包')
    }
    extractZip(archivePath, destDir)
  }
}
