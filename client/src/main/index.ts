import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { StoreService } from './services/store'
import { EncryptionService } from './services/encryption'
import { WalletService } from './services/wallet'
import { TaskService } from './services/task'
import { ScriptFetcher } from './services/script-fetcher'
import { SchedulerService } from './services/scheduler'
import { HttpApiServer } from './httpapi/server'
import { Logger, createLogger } from './utils/logger'

let store: StoreService
let httpServer: HttpApiServer
let taskService: TaskService
let scriptFetcher: ScriptFetcher
let schedulerService: SchedulerService

// Auto-updater configuration
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

function sendUpdateStatusToWindows(status: string, data?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', { status, data })
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatusToWindows('checking')
})

autoUpdater.on('update-available', (info) => {
  sendUpdateStatusToWindows('available', info)
})

autoUpdater.on('update-not-available', () => {
  sendUpdateStatusToWindows('not-available')
})

autoUpdater.on('error', (err) => {
  sendUpdateStatusToWindows('error', err.message)
})

autoUpdater.on('download-progress', (progress) => {
  sendUpdateStatusToWindows('downloading', {
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond
  })
})

autoUpdater.on('update-downloaded', () => {
  sendUpdateStatusToWindows('downloaded')
})

process.on('uncaughtException', (error) => {
  createLogger('main').error('Uncaught exception', { error: error.message, stack: error.stack })
})

process.on('unhandledRejection', (reason) => {
  createLogger('main').error('Unhandled rejection', { reason: String(reason) })
})

app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch(
  'disable-features',
  'VaapiVideoDecoder,VaapiVideoEncoder,VaapiVideoDecodeLinuxGL'
)

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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const broadcastMaximizedChanged = (maximized: boolean): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('window:maximizedChanged', maximized)
    }
  }
  mainWindow.on('maximize', () => broadcastMaximizedChanged(true))
  mainWindow.on('unmaximize', () => broadcastMaximizedChanged(false))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.airdrop-farm')

  const dataDir = app.getPath('userData')
  const dbPath = join(dataDir, 'airdrop-farm.db')

  const encryption = new EncryptionService()
  store = new StoreService(dbPath, encryption)
  const walletService = new WalletService(store)
  taskService = new TaskService(store, {
    rendererSender: (channel, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, data)
      }
    }
  })
  taskService.cleanOrphanTasks()
  scriptFetcher = new ScriptFetcher(store)
  schedulerService = new SchedulerService(store, taskService)
  schedulerService.start()

  registerIpcHandlers({
    store,
    walletService,
    taskService,
    scriptFetcher,
    walletRepo: store.walletRepo,
    proxyRepo: store.proxyRepo,
    taskRepo: store.taskRepo
  })

  const httpApiToken = randomBytes(32).toString('hex')
  httpServer = new HttpApiServer(34116, httpApiToken)
  await httpServer.start()
  const httpPort = httpServer.getPort()

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  } else {
    schedulerService.stop()
  }
})

let isQuitting = false

app.on('before-quit', (e) => {
  if (isQuitting) return
  isQuitting = true
  Logger.shutdown()
  e.preventDefault()
  schedulerService.stop()
  taskService.cleanup()
  // Wait 500ms for task exit handlers to flush before closing store
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
