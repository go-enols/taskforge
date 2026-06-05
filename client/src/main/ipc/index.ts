/**
 * @file IPC 处理器注册表与 API 执行引擎
 * @description 统一注册所有 IPC channel 到 handlerMap，同时支持 IPC 和 HTTP 两种传输层调用。
 *              registerIpcHandlers() 将所有业务 handler 注册到 IPC（ipcMain.handle）和
 *              handlerMap（供 HTTP API 服务器使用），实现单一入口、双传输层的架构。
 * @module main/ipc
 */
import { ipcMain, IpcMainInvokeEvent, app, dialog, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { StoreService } from '../services/store'
import { WalletService } from '../services/wallet'
import { TaskService } from '../services/task'
import { ScriptFetcher } from '../services/script-fetcher'
import { WalletRepository } from '../services/repositories/wallet'
import { ProxyRepository } from '../services/repositories/proxy'
import { TaskRepository } from '../services/repositories/task'
import { Task } from '../../shared/types'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'
import JSON5 from 'json5'
import { createLogger } from '../utils/logger'

const logger = createLogger('ipc')

/**
 * 恢复原生对话框关闭后的窗口状态
 *
 * Windows 平台原生 IFileDialog/IFileSaveDialog 关闭后，父 HWND 偶尔会停留在
 * WS_DISABLED 状态，导致后续所有鼠标点击在到达 renderer 之前被 OS 丢弃，
 * 表现为"页面看起来正常但所有按钮都点不动"。
 *
 * 此辅助函数强制清除该状态，恢复窗口可交互。失败安全（窗口已销毁时静默跳过）。
 *
 * @param win - 触发原生对话框的 BrowserWindow
 */
function restoreWindowAfterDialog(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    // 显式重新启用窗口（清除 WS_DISABLED）
    win.setEnabled(true)
    // 重新聚焦 OS 窗口
    win.focus()
    // 重新聚焦 webContents（renderer 进程）
    win.webContents.focus()
  } catch (err) {
    logger.warn('Failed to restore window after native dialog:', { error: err instanceof Error ? err.message : String(err) })
  }
}

/** 所有需要注入到 IPC 处理器的服务与仓库实例集合 */
interface Services {
  /** 数据库存储服务 */
  store: StoreService
  /** 钱包管理服务（密钥生成、派生） */
  walletService: WalletService
  /** 任务执行引擎（子进程管理） */
  taskService: TaskService
  /** 远程脚本下载器 */
  scriptFetcher: ScriptFetcher
  /** 钱包数据仓库 */
  walletRepo: WalletRepository
  /** 代理数据仓库 */
  proxyRepo: ProxyRepository
  /** 任务数据仓库 */
  taskRepo: TaskRepository
}

/** API 错误信息结构 */
export interface ApiError {
  /** 错误描述 */
  message: string
  /** 错误编码（如 NOT_FOUND / VALIDATION_ERROR） */
  code?: string
  /** 错误分类（如 GENERAL / BUSINESS / SYSTEM） */
  category?: string
}

/**
 * API 调用结果包装
 * 无论 IPC 还是 HTTP 传输层，统一返回此结构。
 * 正常时 data 存在，异常时 error 存在。
 */
export interface ApiResult<T = unknown> {
  /** 成功响应数据 */
  data?: T
  /** 错误信息（存在时表示调用失败） */
  error?: ApiError
}

/** API 处理器函数签名：接收任意参数数组，返回任意值或 Promise */
export type ApiHandler = (...args: unknown[]) => unknown | Promise<unknown>

/**
 * 全局处理器映射表
 * 存储所有已注册的 channel → handler 映射，供 IPC 和 HTTP 共享调用。
 * HTTP API 服务器通过 executeHandler() 使用此映射表。
 */
export const handlerMap = new Map<string, ApiHandler>()

/**
 * 统一错误处理：将未知类型的异常转换为 ApiResult 错误结构
 * @param err - 捕获到的任意异常
 * @returns 包含错误信息的 ApiResult 对象
 */
function handleError(err: unknown): ApiResult {
  const message = err instanceof Error ? err.message : String(err)
  logger.error('handler error', { message })
  return {
    error: {
      message,
      code:
        err instanceof Error && 'code' in err
          ? String((err as Error & { code: string }).code)
          : 'UNKNOWN',
      category:
        err instanceof Error && 'category' in err
          ? String((err as Error & { category: string }).category)
          : 'GENERAL'
    }
  }
}

/**
 * 执行指定 channel 的处理器
 *
 * 这是 IPC 和 HTTP 双传输层的统一执行入口。
 * 从 handlerMap 查找 channel 对应的 handler 并执行。
 *
 * @param channel - 要调用的 channel 名称（如 'wallet:list'）
 * @param args - 传递给 handler 的参数数组
 * @returns 调用结果，成功包含 data，失败包含 error
 */
export async function executeHandler(channel: string, args: unknown[]): Promise<ApiResult> {
  const handler = handlerMap.get(channel)
  if (!handler) {
    return { error: { message: `Unknown channel: ${channel}`, code: 'NOT_FOUND' } }
  }
  try {
    const result = await handler(...args)
    return { data: result }
  } catch (err) {
    return handleError(err)
  }
}

/**
 * 注册 IPC channel
 *
 * 同时注册到 handlerMap（供 HTTP API 共享）和 ipcMain.handle（IPC 通信），
 * 实现单一注册、双传输层可用。
 *
 * @param channel - channel 名称
 * @param handler - 对应的处理器函数
 */
function register(channel: string, handler: ApiHandler): void {
  handlerMap.set(channel, handler)
  ipcMain.handle(
    channel,
    async (_event: IpcMainInvokeEvent, ...args: unknown[]): Promise<ApiResult> => {
      return executeHandler(channel, args)
    }
  )
}

/**
 * 注册所有 IPC 处理器
 *
 * 将业务层所有暴露的功能注册为 IPC channel，覆盖数据 CRUD、任务管理、
 * 窗口控制、文件系统操作、市场认证等全部功能域。
 * 每个 handler 通过 register() 同时注册到 IPC 和 HTTP 双传输层。
 *
 * @param services - 所有需要注入的服务与仓库实例
 */
export function registerIpcHandlers(services: Services): void {
  const { store, walletService, taskService, scriptFetcher, walletRepo, proxyRepo, taskRepo } =
    services

  // ==================== 应用信息 ====================
  register('app:getInfo', () => store.getAppInfo(app.getVersion(), app.getPath('userData')))
  register('app:getStats', () => store.getStats())
  register('app:getTempDir', () => app.getPath('temp'))

  // ==================== 钱包管理 ====================
  register('wallet:list', (_page?, _pageSize?, _search?) =>
    walletRepo.listWallets(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('wallet:get', (id) => walletRepo.getWallet(id as string))
  register('wallet:create', (data) =>
    walletRepo.createWallet(data as Parameters<typeof walletRepo.createWallet>[0])
  )
  register('wallet:update', (id, data) =>
    walletRepo.updateWallet(id as string, data as Parameters<typeof walletRepo.updateWallet>[1])
  )
  register('wallet:delete', (id) => walletRepo.deleteWallet(id as string))
  register('wallet:batchDelete', (ids) => walletRepo.batchDeleteWallets(ids as string[]))
  register('wallet:generateMnemonic', () => walletService.generateMnemonic())
  register('wallet:generateKeypair', (walletType) =>
    walletService.generateKeypair(walletType as string)
  )
  register('wallet:deriveFromMnemonic', (mnemonic, count, walletTypes) =>
    walletService.deriveFromMnemonic(mnemonic as string, count as number, walletTypes as string[])
  )

  // ==================== 账户管理 ====================
  register('account:list', (_page?, _pageSize?, _search?) =>
    store.listAccounts(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('account:get', (id) => store.getAccount(id as string))
  register('account:create', (data) =>
    store.createAccount(data as Parameters<typeof store.createAccount>[0])
  )
  register('account:update', (id, data) =>
    store.updateAccount(id as string, data as Parameters<typeof store.updateAccount>[1])
  )
  register('account:delete', (id) => store.deleteAccount(id as string))
  register('account:listPools', () => store.listAccountPools())
  register('account:batchCreate', (items) =>
    store.batchCreateAccounts(items as Parameters<typeof store.batchCreateAccounts>[0])
  )

  // ==================== 代理管理 ====================
  register('proxy:list', (_page?, _pageSize?, _search?) =>
    proxyRepo.listProxies(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('proxy:get', (id) => proxyRepo.getProxy(id as string))
  register('proxy:create', (data) =>
    proxyRepo.createProxy(data as Parameters<typeof proxyRepo.createProxy>[0])
  )
  register('proxy:update', (id, data) =>
    proxyRepo.updateProxy(id as string, data as Parameters<typeof proxyRepo.updateProxy>[1])
  )
  register('proxy:delete', (id) => proxyRepo.deleteProxy(id as string))
  register('proxy:batchDelete', (ids) => proxyRepo.batchDeleteProxies(ids as string[]))

  // ==================== 任务管理 ====================
  register('task:list', (_page?, _pageSize?, _search?) =>
    taskRepo.listTasks(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('task:get', (id) => taskRepo.getTask(id as string))
  register('task:create', (data) => {
    const input = data as Partial<Omit<Task, 'id'>>
    return taskRepo.createTask({
      scriptFolder: input.scriptFolder ?? '',
      config: input.config ?? {},
      status: input.status ?? 'idle',
      workerId: input.workerId ?? null,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      isSandbox: input.isSandbox ?? false
    })
  })
  register('task:update', (id, data) =>
    taskRepo.updateTask(id as string, data as Parameters<typeof taskRepo.updateTask>[1])
  )
  register('task:start', (id) => taskService.startTask(id as string))
  register('task:stop', (id) => taskService.stopTask(id as string))
  register('task:pause', (id) => taskService.pauseTask(id as string))
  register('task:resume', (id) => taskService.resumeTask(id as string))
  register('task:delete', (id) => taskRepo.deleteTask(id as string))
  register('task:getLogs', (taskId, limit?) =>
    taskRepo.getTaskLogs(taskId as string, limit as number | undefined)
  )
  register('task:clearLogs', (taskId?) => taskRepo.clearTaskLogs(taskId as string | undefined))
  register('task:getProgress', (taskId) => taskService.getTaskProgress(taskId as string))
  register('task:getOutput', (taskId) => taskService.getTaskOutput(taskId as string))

  // ==================== 脚本管理（远程 & 本地安装） ====================
  register('script:listRemote', () => scriptFetcher.fetchScriptList())
  register('script:download', (scriptId) => scriptFetcher.downloadScript(scriptId as string))
  register('script:checkUpdate', () => scriptFetcher.checkUpdates())
  register('script:listInstalled', () => scriptFetcher.getInstalledScripts())
  register('script:remove', (scriptId) => scriptFetcher.removeScript(scriptId as string))

  // ==================== 账户模板 ====================
  register('template:list', (_page?, _pageSize?, _search?) =>
    store.listTemplates(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('template:get', (id) => store.getTemplate(id as string))
  register('template:create', (data) =>
    store.createTemplate(data as Parameters<typeof store.createTemplate>[0])
  )
  register('template:update', (id, data) =>
    store.updateTemplate(id as string, data as Parameters<typeof store.updateTemplate>[1])
  )
  register('template:delete', (id) => store.deleteTemplate(id as string))
  register('template:checkAccounts', (id) => store.countAccountsByTemplate(id as string))

  // ==================== 定时任务调度 ====================
  register('scheduler:list', (_page?, _pageSize?, _search?) =>
    store.listScheduledTasks(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('scheduler:get', (id) => store.getScheduledTask(id as string))
  register('scheduler:create', (data) =>
    store.createScheduledTask(data as Parameters<typeof store.createScheduledTask>[0])
  )
  register('scheduler:update', (id, data) =>
    store.updateScheduledTask(id as string, data as Parameters<typeof store.updateScheduledTask>[1])
  )
  register('scheduler:delete', (id) => store.deleteScheduledTask(id as string))

  // ==================== 任务脚本模板（已安装的脚本元数据） ====================
  register('taskTemplate:list', (_page?, _pageSize?, _search?) =>
    store.listTaskTemplates(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('taskTemplate:get', (id) => store.getTaskTemplate(id as string))
  register('taskTemplate:create', (data) =>
    store.createTaskTemplate(data as Parameters<typeof store.createTaskTemplate>[0])
  )
  register('taskTemplate:update', (id, data) =>
    store.updateTaskTemplate(id as string, data as Parameters<typeof store.updateTaskTemplate>[1])
  )
  register('taskTemplate:delete', (id) => store.deleteTaskTemplate(id as string))

  // ==================== 验证码密钥管理 ====================
  register('captchaKey:list', (_page?, _pageSize?, _search?) =>
    store.listCaptchaKeys(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('captchaKey:get', (id) => store.getCaptchaKey(id as string))
  register('captchaKey:create', (data) =>
    store.createCaptchaKey(data as Parameters<typeof store.createCaptchaKey>[0])
  )
  register('captchaKey:update', (id, data) =>
    store.updateCaptchaKey(id as string, data as Parameters<typeof store.updateCaptchaKey>[1])
  )
  register('captchaKey:delete', (id) => store.deleteCaptchaKey(id as string))

  // ==================== 代理提供商管理 ====================
  register('proxyProvider:list', (_page?, _pageSize?, _search?) =>
    store.listProxyProviders(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('proxyProvider:get', (id) => store.getProxyProvider(id as string))
  register('proxyProvider:create', (data) =>
    store.createProxyProvider(data as Parameters<typeof store.createProxyProvider>[0])
  )
  register('proxyProvider:update', (id, data) =>
    store.updateProxyProvider(id as string, data as Parameters<typeof store.updateProxyProvider>[1])
  )
  register('proxyProvider:delete', (id) => store.deleteProxyProvider(id as string))

  // ==================== 空投项目管理 ====================
  register('airdrop:list', (_page?, _pageSize?, _search?) =>
    store.listAirdrops(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('airdrop:create', (data) =>
    store.createAirdrop(data as Parameters<typeof store.createAirdrop>[0])
  )
  register('airdrop:get', (id) => store.getAirdrop(id as string))
  register('airdrop:update', (id, data) =>
    store.updateAirdrop(id as string, data as Parameters<typeof store.updateAirdrop>[1])
  )
  register('airdrop:delete', (id) => store.deleteAirdrop(id as string))
  register('airdrop:analytics', () => store.getAirdropAnalytics())

  // ==================== 应用设置 ====================
  register('setting:get', (key) => store.getSetting(key as string))
  register('setting:set', (key, value) => store.setSetting(key as string, value as string))
  register('setting:getAll', () => store.getAllSettings())
  register('setting:delete', (key) => store.deleteSetting(key as string))

  // ==================== 日志查询 ====================
  register('log:query', (level?, category?, search?, since?, until?, limit?) =>
    store.queryLogs(
      level as string | undefined,
      category as string | undefined,
      search as string | undefined,
      since as string | undefined,
      until as string | undefined,
      limit as number | undefined
    )
  )
  register('log:getCategories', () => store.getLogCategories())
  register('log:setLevel', (level) => store.setLogLevel(level as string))
  register('log:getLevel', () => store.getLogLevel())
  register('log:deleteLogs', () => store.deleteAllLogs())

  // ==================== 自动更新 ====================
  register('update:check', () => {
    autoUpdater.checkForUpdates()
    return null
  })
  register('update:download', () => {
    autoUpdater.downloadUpdate()
    return null
  })
  register('update:install', () => {
    autoUpdater.quitAndInstall()
    return null
  })

  // ==================== 系统对话框（打开／保存文件、选择目录） ====================
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
      const fs = await import('fs')
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      return { canceled: false, filePath: result.filePaths[0], content }
    } finally {
      // Windows-specific fix: native IFileDialog sometimes leaves the parent
      // HWND in WS_DISABLED state after returning, which silently drops all
      // subsequent mouse clicks on the BrowserWindow. Restoring focus and
      // re-enabling the window forces the OS to clear the disabled state.
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
      const fs = await import('fs')
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
      return { canceled: false, folderPath: result.filePaths[0] }
    } finally {
      restoreWindowAfterDialog(win)
    }
  })

  register('fs:readFile', async (...args: unknown[]) => {
    const _path = args[0] as string
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
    try {
      fs.writeFileSync(_path, _content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  register('fs:exists', async (...args: unknown[]) => {
    const _path = args[0] as string
    try {
      return fs.existsSync(_path)
    } catch (err) {
      logger.warn('fs:exists failed', { path: _path, error: String(err) })
      return false
    }
  })

  // ==================== ZIP 压缩 ====================
  register('zip:create', async (...args: unknown[]) => {
    const zipPath = args[0] as string
    const sourceDir = args[1] as string
    try {
      const resolvedZip = path.resolve(zipPath)
      const resolvedSource = path.resolve(sourceDir)
      if (!/^[^;|&`$\n\r]+$/.test(resolvedZip) || !/^[^;|&`$\n\r]+$/.test(resolvedSource)) {
        return { success: false, error: 'Invalid characters in path' }
      }
      const platform = process.platform
      if (platform === 'win32') {
        const result = spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Compress-Archive -Path '${resolvedSource}\\*' -DestinationPath '${resolvedZip}' -Force`
          ],
          { stdio: 'pipe' }
        )
        if (result.error) throw result.error
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString() || 'PowerShell compress failed')
        }
      } else {
        const result = spawnSync('zip', ['-r', resolvedZip, '.'], {
          cwd: resolvedSource,
          stdio: 'pipe'
        })
        if (result.error) throw result.error
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString() || 'zip command failed')
        }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  register('zip:extractManifest', async (...args: unknown[]) => {
    const zipPath = args[0] as string
    try {
      const resolvedZip = path.resolve(zipPath)
      if (!/^[^;|&`$\n\r]+$/.test(resolvedZip)) {
        return { success: false, manifest: null, error: 'Invalid characters in path' }
      }
      const platform = process.platform
      let output: string
      if (platform === 'win32') {
        const tempDir = path.join(os.tmpdir(), `manifest-${Date.now()}`)
        fs.mkdirSync(tempDir, { recursive: true })
        const result = spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -Path '${resolvedZip}' -DestinationPath '${tempDir}' -Force`
          ],
          { stdio: 'pipe' }
        )
        if (result.error) throw result.error
        if (result.status !== 0) {
          fs.rmSync(tempDir, { recursive: true, force: true })
          throw new Error(result.stderr?.toString() || 'PowerShell extract failed')
        }
        const manifestPath = path.join(tempDir, 'manifest.json')
        if (!fs.existsSync(manifestPath)) {
          fs.rmSync(tempDir, { recursive: true, force: true })
          return { success: false, manifest: null, error: 'manifest.json not found in archive' }
        }
        output = fs.readFileSync(manifestPath, 'utf-8')
        fs.rmSync(tempDir, { recursive: true, force: true })
      } else {
        const result = spawnSync('unzip', ['-p', resolvedZip, 'manifest.json'], {
          encoding: 'utf-8',
          stdio: 'pipe'
        })
        if (result.error) throw result.error
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString() || 'unzip command failed')
        }
        output = result.stdout
      }
      const manifest = JSON5.parse(output) as Record<string, unknown>
      return { success: true, manifest }
    } catch (err) {
      return { success: false, manifest: null, error: (err as Error).message }
    }
  })

  // ==================== 服务端文件上传（multipart/form-data） ====================
  register('server:upload', async (...args: unknown[]) => {
    const url = args[0] as string
    const zipPath = args[1] as string
    const headers = args[2] as Record<string, string>
    const formFields = (args[3] as Record<string, string>) || {}
    try {
      const fileContent = fs.readFileSync(zipPath)
      const fileName = path.basename(zipPath)
      const boundary = '----FormBoundary' + Math.random().toString(36).substring(2)

      const parts: Buffer[] = []

      // 添加额外的表单字段
      for (const [key, value] of Object.entries(formFields)) {
        const fieldStr = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
        parts.push(Buffer.from(fieldStr, 'utf-8'))
      }

      // 添加文件字段
      const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/zip\r\n\r\n`
      parts.push(Buffer.from(fileHeader, 'utf-8'))
      parts.push(fileContent)
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'))

      const bodyBuffer = Buffer.concat(parts)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer
      })
      const data = await response.json().catch(() => null)
      return { success: response.ok, status: response.status, data }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ==================== 窗口控制 ====================
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

  // ==================== 系统 Shell 操作 ====================
  /** 在系统文件管理器中打开指定路径（Explorer / Finder / xdg-open） */
  register('shell:openPath', async (...args: unknown[]) => {
    const p = args[0]
    if (typeof p !== 'string' || !p) {
      return { success: false, error: 'Invalid path' }
    }
    try {
      const errMsg = await shell.openPath(p)
      if (errMsg) return { success: false, error: errMsg }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ==================== 市场认证系统 ====================
  register('market:login', async (username, password) => {
    const serverUrl = store.getSetting('marketplace_server_url') || 'http://localhost:3400'
    const apiKey = store.getSetting('marketplace_api_key')
    const resp = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ username, password })
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(
        (err as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`
      )
    }
    const data = (await resp.json()) as {
      data?: {
        token?: string
        user?: { id: string; username: string; displayName: string; role: string }
      }
    }
    if (data.data?.token) {
      store.setSetting('marketplace_jwt', data.data.token)
      store.setSetting('marketplace_user', JSON.stringify(data.data.user))
    }
    return data.data
  })

  register('market:getUser', async () => {
    const raw = store.getSetting('marketplace_user')
    const token = store.getSetting('marketplace_jwt')
    if (!raw || !token) return null

    try {
      const serverUrl = store.getSetting('marketplace_server_url') || 'http://localhost:3400'
      const resp = await fetch(`${serverUrl}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!resp.ok) {
        store.deleteSetting('marketplace_jwt')
        store.deleteSetting('marketplace_user')
        return null
      }
      const data = await resp.json()
      return data.data ?? null
    } catch (err) {
      logger.warn('market:getUser failed', { error: String(err) })
      return null
    }
  })

  register('market:logout', () => {
    store.deleteSetting('marketplace_jwt')
    store.deleteSetting('marketplace_user')
    return null
  })

  register('market:register', async (username, password, displayName) => {
    const serverUrl = store.getSetting('marketplace_server_url') || 'http://localhost:3400'
    const resp = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName })
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(
        (err as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`
      )
    }
    const data = (await resp.json()) as {
      data?: {
        token?: string
        user?: { id: string; username: string; displayName: string; role: string }
      }
    }
    if (data.data?.token) {
      store.setSetting('marketplace_jwt', data.data.token)
      store.setSetting('marketplace_user', JSON.stringify(data.data.user))
    }
    return data.data
  })

  register('market:setup', async (username, password, displayName) => {
    const serverUrl = store.getSetting('marketplace_server_url') || 'http://localhost:3400'
    const resp = await fetch(`${serverUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName })
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(
        (err as { error?: { message?: string } }).error?.message || `HTTP ${resp.status}`
      )
    }
    const data = (await resp.json()) as {
      data?: {
        token?: string
        user?: { id: string; username: string; displayName: string; role: string }
      }
    }
    if (data.data?.token) {
      store.setSetting('marketplace_jwt', data.data.token)
      store.setSetting('marketplace_user', JSON.stringify(data.data.user))
    }
    return data.data
  })

  logger.info('All handlers registered', { count: handlerMap.size })
}
