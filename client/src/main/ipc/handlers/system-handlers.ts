/**
 * @file 系统级 IPC 处理器
 * @description 包含更新、对话框、文件系统、压缩、窗口、Shell 等直接使用 Electron API 的处理器。
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'
import AdmZip from 'adm-zip'
import { readZipEntry } from '../../utils/zipExtractor'
import { handlerMap, isTrustedIpcEvent, register, restoreWindowAfterDialog, Services } from '../registry'
import { createLogger } from '../../utils/logger'
import { authorizeDir, authorizePath, isExistingDirectory, isPathAuthorized } from '../../services/path-allowlist'

const logger = createLogger('ipc')

export function registerSystemHandlers(services: Services): void {
  const { store } = services
  /* ────────── 更新 ────────── */

  /**
   * 向所有 BrowserWindow 广播更新状态事件
   */
  const broadcastUpdateStatus = (payload: Record<string, unknown>): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('update:status', payload)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateStatus({ status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    broadcastUpdateStatus({ status: 'available', data: { version: info.version } })
  })
  autoUpdater.on('update-not-available', () => {
    broadcastUpdateStatus({ status: 'not-available' })
  })
  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdateStatus({
      status: 'downloading',
      data: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      }
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdateStatus({ status: 'downloaded', data: { version: info.version } })
  })
  autoUpdater.on('error', (err) => {
    broadcastUpdateStatus({ status: 'error', data: err?.message ?? String(err) })
  })

  /** 自动更新是否可用：必须是打包环境且存在 app-update.yml */
  const isUpdaterConfigured = (): boolean => {
    if (!app.isPackaged) return false
    try {
      return fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))
    } catch {
      return false
    }
  }

  register('update:check', async () => {
    if (!isUpdaterConfigured()) return { available: false, skipped: 'not-packaged' }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { available: !!result?.updateInfo, version: result?.updateInfo?.version ?? null }
    } catch (err) {
      logger.warn('update:check failed', { error: err instanceof Error ? err.message : String(err) })
      return { available: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  register('update:download', async () => {
    if (!isUpdaterConfigured()) return { downloaded: false, skipped: 'not-packaged' }
    try {
      await autoUpdater.downloadUpdate()
      return { downloaded: true }
    } catch (err) {
      logger.warn('update:download failed', {
        error: err instanceof Error ? err.message : String(err)
      })
      return { downloaded: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  register('update:install', () => {
    if (!isUpdaterConfigured()) return { installed: false, skipped: 'not-packaged' }
    autoUpdater.quitAndInstall()
    return { installed: true }
  })

  /* ────────── 对话框 ────────── */

  register('dialog:openFile', async (...args: unknown[]) => {
    const _filters = args[0] as { name: string; extensions: string[] }[] | undefined
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { canceled: true, filePath: null, content: null }
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: _filters ?? [{ name: 'JSON', extensions: ['json'] }]
      })
      if (result.canceled || result.filePaths.length === 0)
        return { canceled: true, filePath: null, content: null }
      // 记录用户本次会话显式选择的路径，后续 fs:* 才允许访问
      authorizePath(result.filePaths[0])
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      return { canceled: false, filePath: result.filePaths[0], content }
    } finally {
      restoreWindowAfterDialog(win)
    }
  })

  register('dialog:saveFile', async (...args: unknown[]) => {
    const _defaultName = args[0] as string
    const _content = args[1] as string
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { canceled: true, filePath: null }
    try {
      const result = await dialog.showSaveDialog(win, {
        defaultPath: _defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (result.canceled || !result.filePath) return { canceled: true, filePath: null }
      // 记录用户选择的保存路径，后续 fs:* 才允许写入
      authorizePath(result.filePath)
      fs.writeFileSync(result.filePath, _content, 'utf-8')
      return { canceled: false, filePath: result.filePath }
    } finally {
      restoreWindowAfterDialog(win)
    }
  })

  register('dialog:selectFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { canceled: true, folderPath: null }
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0)
        return { canceled: true, folderPath: null }
      // 目录级授权：该目录及其子路径在本次会话内允许 fs:* / zip:* / shell:openPath
      authorizeDir(result.filePaths[0])
      return { canceled: false, folderPath: result.filePaths[0] }
    } finally {
      restoreWindowAfterDialog(win)
    }
  })

  /* ────────── 文件系统 ────────── */

  register('fs:readFile', async (...args: unknown[]) => {
    const _path = args[0] as string
    if (!isPathAuthorized(_path)) {
      return { success: false, content: null, error: 'Path not authorized' }
    }
    try {
      const content = fs.readFileSync(_path, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return { success: false, content: null, error: (err as Error).message }
    }
  })

  register('fs:writeFile', async (...args: unknown[]) => {
    const _path = args[0] as string
    const _content = args[1] as string
    if (!isPathAuthorized(_path)) {
      return { success: false, error: 'Path not authorized' }
    }
    try {
      fs.writeFileSync(_path, _content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  register('fs:exists', async (...args: unknown[]) => {
    const _path = args[0] as string
    if (!isPathAuthorized(_path)) return false
    try {
      return fs.existsSync(_path)
    } catch (err) {
      logger.warn('fs:exists failed', { path: _path, error: String(err) })
      return false
    }
  })

  /* ────────── 压缩 ────────── */

  register('zip:create', async (...args: unknown[]) => {
    const zipPath = args[0] as string
    const sourceDir = args[1] as string
    if (!isPathAuthorized(zipPath) || !isPathAuthorized(sourceDir)) {
      return { success: false, error: 'Path not authorized' }
    }
    if (!isExistingDirectory(sourceDir)) {
      return { success: false, error: `源目录不存在: ${sourceDir}` }
    }
    try {
      const resolvedZip = path.resolve(zipPath)
      const resolvedSource = path.resolve(sourceDir)
      if (!/^[^;|&`$\n\r]+$/.test(resolvedZip) || !/^[^;|&`$\n\r]+$/.test(resolvedSource)) {
        return { success: false, error: 'Invalid characters in path' }
      }

      const zip = new AdmZip()
      zip.addLocalFolder(resolvedSource)
      zip.writeZip(resolvedZip)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  register('zip:extractManifest', async (...args: unknown[]) => {
    const sourcePath = args[0] as string
    if (!isPathAuthorized(sourcePath)) {
      return { success: false, manifest: null, error: 'Path not authorized' }
    }
    try {
      const resolved = path.resolve(sourcePath)
      if (!/^[^;|&`$\n\r]+$/.test(resolved)) {
        return { success: false, manifest: null, error: 'Invalid characters in path' }
      }

      // Branch on directory vs file: folder = read manifest.json directly,
      // zip = extract entry. Without this branch, AdmZip on a directory
      // throws EISDIR (illegal operation on a directory, read).
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        const manifestPath = path.join(resolved, 'manifest.json')
        if (!fs.existsSync(manifestPath)) {
          return { success: false, manifest: null, error: 'manifest.json not found in directory' }
        }
        const content = fs.readFileSync(manifestPath, 'utf-8')
        const manifest = JSON5.parse(content) as Record<string, unknown>
        return { success: true, manifest }
      }

      const output = readZipEntry(resolved, 'manifest.json')
      if (output === null) {
        return { success: false, manifest: null, error: 'manifest.json not found in archive' }
      }
      const manifest = JSON5.parse(output) as Record<string, unknown>
      return { success: true, manifest }
    } catch (err) {
      return { success: false, manifest: null, error: (err as Error).message }
    }
  })

  /* ────────── 服务端上传（带上传进度事件） ────────── */

  /**
   * Multipart/form-data 上传共享实现，同时供 IPC（带进度推送）和 HTTP 通道使用。
   * 仅 `ipcMain.handle` 路径会触发 `upload:progress` 事件回传到渲染进程。
   * `method` 默认 'POST'；脚本代码包更新用 'PUT'。
   */
  async function uploadMultipart(
    url: string,
    zipPath: string,
    headers: Record<string, string>,
    formFields: Record<string, string>,
    onProgress?: (pct: number) => void,
    method: 'POST' | 'PUT' = 'POST'
  ): Promise<{ success: boolean; status: number; data?: unknown; error?: string }> {
    try {
      const fileContent = fs.readFileSync(zipPath)
      const fileName = path.basename(zipPath)
      const boundary = '----FormBoundary' + Math.random().toString(36).substring(2)

      const parts: Buffer[] = []
      for (const [key, value] of Object.entries(formFields)) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`, 'utf-8'))
      }
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/zip\r\n\r\n`, 'utf-8'))
      parts.push(fileContent)
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'))
      const bodyBuffer = Buffer.concat(parts)

      onProgress?.(0)

      const response = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: bodyBuffer as unknown as BodyInit,
        signal: AbortSignal.timeout(5 * 60 * 1000)
      })

      onProgress?.(100)

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const msg = data?.error?.message || `HTTP ${response.status}`
        return { success: false, status: response.status, error: msg }
      }
      return { success: true, status: response.status, data }
    } catch (err) {
      return { success: false, status: 0, error: (err as Error).message }
    }
  }

  /**
   * 校验服务端上传的目标 URL 与本地源文件。
   * 仅允许 http/https URL，且源文件必须位于应用目录或用户本次会话选择过的路径。
   */
  function validateUploadTarget(url: unknown, zipPath: unknown): string | null {
    if (typeof url !== 'string' || typeof zipPath !== 'string') return 'Invalid upload arguments'
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Only http(s) upload URLs are allowed'
      }
    } catch {
      return 'Invalid upload URL'
    }
    if (!isPathAuthorized(zipPath)) return 'Source file path not authorized'
    return null
  }

  // HTTP 通道（无进度事件）
  // arg 4: optional HTTP method — 'POST' (default, new script) or 'PUT' (script update with ZIP)
  handlerMap.set('server:upload', async (...args: unknown[]) => {
    const url = args[0] as string
    const zipPath = args[1] as string
    const invalid = validateUploadTarget(url, zipPath)
    if (invalid) return { success: false, status: 0, error: invalid }
    const headers = args[2] as Record<string, string>
    const formFields = (args[3] as Record<string, string>) || {}
    const method = (args[4] as 'POST' | 'PUT' | undefined) ?? 'POST'
    return uploadMultipart(url, zipPath, headers, formFields, undefined, method)
  })
  // IPC 通道（带 upload:progress 事件）
  ipcMain.handle('server:upload', async (event, ...args: unknown[]) => {
    if (!isTrustedIpcEvent(event)) {
      return { success: false, status: 0, error: 'Untrusted IPC sender' }
    }
    const url = args[0] as string
    const zipPath = args[1] as string
    const invalid = validateUploadTarget(url, zipPath)
    if (invalid) return { success: false, status: 0, error: invalid }
    const headers = args[2] as Record<string, string>
    const formFields = (args[3] as Record<string, string>) || {}
    const method = (args[4] as 'POST' | 'PUT' | undefined) ?? 'POST'
    const result = await uploadMultipart(url, zipPath, headers, formFields, (pct: number) => {
      try { event.sender.send('upload:progress', pct) } catch {}
    }, method)
    if (result.success) return { data: result }
    return { error: { message: result.error || `HTTP ${result.status}`, code: 'UPLOAD_FAILED' } }
  })

  /* ────────── 窗口 ────────── */

  register('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
    return null
  })
  register('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return null
  })
  register('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
    return null
  })
  register('window:isMaximized', () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)
  register('window:platform', () => process.platform)

  /* ────────── Shell ────────── */

  /** 在系统文件管理器中打开指定路径（Explorer / Finder / xdg-open） */
  register('shell:openPath', async (...args: unknown[]) => {
    const p = args[0]
    if (typeof p !== 'string' || !p) {
      return { success: false, error: 'Invalid path' }
    }
    if (!isPathAuthorized(p)) {
      return { success: false, error: 'Path not authorized' }
    }
    try {
      const errMsg = await shell.openPath(p)
      if (errMsg) return { success: false, error: errMsg }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  /* ────────── 开发者工具 ────────── */

  register('devtools:toggle', (enabled?: unknown) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const on = enabled ? true : false
    if (on) {
      win.webContents.openDevTools()
    } else {
      win.webContents.closeDevTools()
    }
    store.setSetting('devtools_enabled', on ? 'true' : 'false')
    return null
  })
}
