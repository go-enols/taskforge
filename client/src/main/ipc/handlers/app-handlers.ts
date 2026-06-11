/**
 * @file 应用信息 IPC 处理器
 */
import { app } from 'electron'
import { register, Services } from '../registry'

export function registerAppHandlers(services: Services): void {
  const { store } = services

  register('app:getInfo', () => store.getAppInfo(app.getVersion(), app.getPath('userData')))
  register('app:getStats', () => store.getStats())
  register('app:getTempDir', () => app.getPath('temp'))
}
