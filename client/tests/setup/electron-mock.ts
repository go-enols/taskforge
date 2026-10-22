/**
 * @file 全局测试环境：Electron 模块桩
 * @description 主进程单元测试无需真实 Electron 运行时（CI 安装时使用了 --ignore-scripts，
 *              不存在 electron 二进制）。这里提供覆盖被测代码用到的 API 的最小桩，
 *              使 StoreService / EncryptionService / IPC 等模块可以在纯 Node 下加载。
 *
 *              注意：单个测试文件仍可用 vi.mock('electron', ...) 覆盖本桩来做断言。
 * @module tests/setup
 */
import { vi } from 'vitest'
import { tmpdir } from 'os'

vi.mock('electron', () => {
  const app = {
    getVersion: () => '0.3.0-test',
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
    isPackaged: false,
    on: vi.fn(),
    whenReady: () => Promise.resolve(),
    quit: vi.fn()
  }

  return {
    app,
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      removeHandler: vi.fn()
    },
    BrowserWindow: {
      getAllWindows: () => [],
      fromWebContents: () => null
    },
    safeStorage: {
      // 测试环境视为“safeStorage 不可用”，EncryptionService 会走明文降级路径。
      isEncryptionAvailable: () => false,
      encryptString: (plaintext: string) => Buffer.from(plaintext, 'utf8'),
      decryptString: (cipher: Buffer) => cipher.toString('utf8')
    },
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn()
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
      showErrorBox: vi.fn()
    },
    nativeTheme: {
      shouldUseDarkColors: false,
      on: vi.fn()
    }
  }
})
