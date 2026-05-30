import { contextBridge, ipcRenderer } from 'electron'
import { tmpdir } from 'os'

const httpPortArg = process.argv.find((a) => a.startsWith('--http-port='))
const httpPort = httpPortArg ? Number(httpPortArg.split('=')[1]) : 34116

const httpTokenArg = process.argv.find((a) => a.startsWith('--http-token='))
const httpToken = httpTokenArg ? httpTokenArg.split('=')[1] : ''

const api = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  httpPort: httpPort,
  httpToken: httpToken,
  tmpdir: (): string => tmpdir()
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  ;(window as unknown as Record<string, unknown>).electronAPI = api
}
