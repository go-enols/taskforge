/**
 * @file Electron 主进程入口
 * @description 负责窗口管理、服务初始化、自动更新、生命周期管理。
 *              启动时依次初始化数据库、服务层、IPC 通信、HTTP API 服务器，
 *              并在退出时有序清理所有资源。
 * @module main
 */
import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
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
 * 根据当前平台（macOS / Windows / Linux）配置窗口样式（macOS 使用隐藏标题栏 + 交通灯），
 * 注入 HTTP API 端口和令牌到渲染进程，以支持 IPC 与 HTTP 双传输层降级。
 * @param httpPort - HTTP API 服务端口，注入渲染进程用于传输层降级
 * @param httpApiToken - HTTP API 认证令牌，用于渲染进程安全调用 */
function createWindow(httpPort: number, httpApiToken: string): void {
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
      sandbox: false,
      additionalArguments: [`--http-port=${httpPort}`, `--http-token=${httpApiToken}`]
    }
  })
  if (store.getSetting('devtools_enabled') === 'true') {
    mainWindow.webContents.openDevTools()
  }

  /** 拦截外部链接打开请求，使用系统默认浏览器打开 */
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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

  // 为每个新创建的窗口注入快捷键优化
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow(httpPort, httpApiToken)

  setTimeout(() => {
    autoUpdater.checkForUpdates()
  }, 3000)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(httpPort, httpApiToken)
  })
}).catch((err) => {
  console.error('Failed to initialize app:', err)
  dialog.showErrorBox('Initialization Error', `Failed to start: ${err.message}`)
  app.quit()
})

/**
 * 窗口全部关闭时：macOS 平台直接退出，macOS 保留调度器但关闭窗口
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
