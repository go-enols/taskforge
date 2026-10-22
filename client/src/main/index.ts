/**
 * @file Electron 主进程入口
 * @description 负责窗口管理、服务初始化、自动更新、生命周期管理。
 *              启动时依次初始化数据库、服务层、IPC 通信、HTTP API 服务器，
 *              并在退出时有序清理所有资源。
 * @module main
 */
import { app, shell, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { randomBytes } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { StoreService } from './services/store'
import { EncryptionService } from './services/encryption'
import { TaskService } from './services/task'
import { ScriptFetcher } from './services/script-fetcher'
import { SchedulerService } from './services/scheduler'
import { HttpApiServer } from './httpapi/server'
import { Logger } from './utils/logger'

/** 数据库服务实例 */
let store: StoreService
/** HTTP API 服务器实例 */
let httpServer: HttpApiServer
/** 任务执行引擎实例 */
let taskService: TaskService
/** 远程脚本下载器实例 */
let scriptFetcher: ScriptFetcher
/** 定时任务调度器实例 */
let schedulerService: SchedulerService

/** 自动更新配置：
 * - autoDownload = false：启动时不自动下载，由用户主动点击"下载"按钮触发
 * - autoInstallOnAppQuit = false：不退出时自动安装，由用户主动点击"安装并重启"触发
 *   （如果保留 true，"立即安装"按钮会和退出时自动安装冲突，且用户无法推迟安装）
 */
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

/**
 * 创建并显示主窗口
 *
 * 根据当前平台（macOS / Windows / Linux）配置窗口样式（macOS 使用隐藏标题栏 + 交通灯）。
 * 窗口使用 sandbox + contextIsolation，渲染层只能通过 preload 暴露的白名单 IPC 与主进程通信。
 */
function createWindow(): void {
  const isDarwin = process.platform === 'darwin'
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: true,
    autoHideMenuBar: true,
    ...(isDarwin
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 12 } }
      : { frame: false }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 硬化配置：preload 只使用 electron 模块，可在 sandbox 中运行；
      // 渲染层无法直接访问 Node/Electron API，只能走白名单 IPC。
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })
  if (store.getSetting('devtools_enabled') === 'true') {
    mainWindow.webContents.openDevTools()
  }

  /** 允许内部导航的页面前缀（打包后的 renderer 目录 / 开发 dev server） */
  const rendererBaseUrl = pathToFileURL(join(__dirname, '../renderer')).href
  const devRendererUrl = process.env['ELECTRON_RENDERER_URL']
  /** 判断目标 URL 是否属于应用自身页面 */
  const isInternalUrl = (target: string): boolean => {
    if (devRendererUrl && target.startsWith(devRendererUrl)) return true
    return target === rendererBaseUrl || target.startsWith(rendererBaseUrl + '/')
  }

  /**
   * 拦截外部链接打开请求：只允许 http/https 交给系统浏览器打开。
   * 其余 scheme（file://、smb://、自定义协议等）一律拒绝，避免打开本地文件或泄露凭据。
   */
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const target = new URL(details.url)
      if (target.protocol === 'http:' || target.protocol === 'https:') {
        void shell.openExternal(details.url)
      } else {
        console.warn('[security] Blocked openExternal for scheme:', target.protocol)
      }
    } catch {
      console.warn('[security] Blocked malformed external URL')
    }
    return { action: 'deny' }
  })

  /**
   * 阻止主窗口被导航到外部页面（否则远端页面会继承 preload 的 electronAPI）。
   * 仅允许应用自身页面（整页刷新/路由 hash 变化不触发 will-navigate）。
   */
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isInternalUrl(targetUrl)) {
      event.preventDefault()
      console.warn('[security] Blocked navigation to external URL:', targetUrl)
    }
  })
  // 新窗口/嵌入 webview 一律拒绝；外部链接走上面的 openExternal 白名单
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  /**
   * 向所有窗口广播最大化状态变更
   * @param maximized - 是否已最大化
   */
  const broadcastMaximizedChanged = (maximized: boolean): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('window:maximizedChanged', maximized)
    }
  }
  // 监听窗口最大化/还原事件
  mainWindow.on('maximize', () => broadcastMaximizedChanged(true))
  mainWindow.on('unmaximize', () => broadcastMaximizedChanged(false))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 应用就绪后的初始化流程。
 *
 * 步骤依次为：
 * 1. 创建加密服务与数据库实例
 * 2. 初始化钱包服务、任务引擎、脚本下载器、定时调度器
 * 3. 清理上次残留的孤儿任务
 * 4. 注册所有 IPC 通信处理器
 * 5. 启动 HTTP API 服务器（端口 34116，随机令牌认证）
 * 6. 创建主窗口并注入 HTTP 连接信息
 * 7. 延迟 3 秒后检查自动更新
 * 8. macOS 下处理 activate 事件（无窗口时重建）
 */
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.taskforge')

  // 数据库路径：%APPDATA%/TaskForge/taskforge.db
  const dataDir = app.getPath('userData')
  const dbPath = join(dataDir, 'taskforge.db')

  const encryption = new EncryptionService()
  store = new StoreService(dbPath, encryption)
  // 初始化各业务服务

  taskService = new TaskService(store, {
    /** 向所有渲染进程窗口发送任务相关事件 */
    rendererSender: (channel, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, data)
      }
    }
  })
  // 清理上次异常退出遗留的孤儿任务（worker 进程已死但状态未更新） taskService.cleanOrphanTasks()
  scriptFetcher = new ScriptFetcher(store)
  schedulerService = new SchedulerService(store, taskService)
  // 启动定时任务调度器，检查并执行到期的 cron 任务
  schedulerService.start()

  // 注册所有 IPC 处理器（双向通信），连接渲染进程与主进程服务
  registerIpcHandlers({
    store,
    taskService,
    scriptFetcher,
    walletRepo: store.walletRepo,
    proxyRepo: store.proxyRepo,
    taskRepo: store.taskRepo
  })

  // 启动 HTTP API 冗余服务器（渲染进程传输层降级备用）
  const httpApiToken = randomBytes(32).toString('hex')
  httpServer = new HttpApiServer(34116, httpApiToken)
  await httpServer.start()
  const httpPort = httpServer.getPort()

  // preload 通过同步 IPC 获取 HTTP 端口/令牌（sandbox 下不再通过 argv 传递）
  ipcMain.on('app:getHttpInfo', (event) => {
    event.returnValue = { port: httpPort, token: httpApiToken }
  })

  // 拒绝所有渲染层权限申请（摄像头/麦克风/通知/地理位置等均不需要）
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)

  // macOS：关闭窗口后重新激活时恢复定时调度器（否则 cron 任务永久停摆）
  app.on('activate', function () {
    schedulerService.start()
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // 为每个新创建的窗口注入快捷键优化
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // 自动更新检查：仅在「打包且存在 app-update.yml」的环境执行；dev / 解包目录
  // （electron-builder --dir 不会生成 app-update.yml）直接跳过，避免无意义的 ENOENT。
  setTimeout(() => {
    const updateConfigPath = join(process.resourcesPath, 'app-update.yml')
    if (!app.isPackaged || !existsSync(updateConfigPath)) {
      console.info('[updater] skipped: missing app-update.yml (dev or unpacked build)')
      return
    }
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.warn('[updater] checkForUpdates failed:', err instanceof Error ? err.message : String(err))
    })
  }, 3000)
}).catch((err) => {
  console.error('Failed to initialize app:', err)
  dialog.showErrorBox('Initialization Error', `Failed to start: ${err.message}`)
  app.quit()
})

/**
 * 窗口全部关闭时：非 macOS 直接退出；macOS 保留进程但停止调度器
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  } else {
    schedulerService.stop()
  }
})

/** 防止重复退出 */
let isQuitting = false

/**
 * 应用退出前的清理流程。
 *
 * 按序执行：停止日志写入、停止调度器、清理任务引擎（终止子进程）→
 * 关闭 HTTP 服务、关闭数据库、退出应用。
 * 使用延迟确保异步关闭操作完成。
 */
app.on('before-quit', (e) => {
  if (isQuitting) return
  isQuitting = true
  Logger.shutdown()
  e.preventDefault()
  schedulerService.stop()
  taskService.cleanup()

  setTimeout(() => {
    httpServer
      .stop()
      .then(() => {
        store.close()
        app.quit()
      })
      .catch(() => {
        store.close()
        app.quit()
      })
  }, 500)
})
