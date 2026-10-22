/**
 * @file electron-updater 测试桩
 * @description 主进程 handler 在模块作用域 import electron-updater，而 electron-updater
 *              在导入时会实例化 ElectronAppAdapter 并 require electron 二进制（CI 使用
 *              --ignore-scripts 安装，没有二进制）。vitest 通过 alias 把该模块指向本桩。
 * @module tests/setup
 */
import { vi } from 'vitest'

export const autoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  allowPrerelease: false,
  currentVersion: { version: '0.0.0-test' },
  checkForUpdates: vi.fn(async () => null),
  downloadUpdate: vi.fn(async () => []),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn()
}

export default { autoUpdater }
