/**
 * @file 设置 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerSettingHandlers(services: Services): void {
  const { store } = services

  register('setting:get', (key) => store.getSetting(key as string))
  register('setting:set', (key, value) => store.setSetting(key as string, value as string))
  register('setting:getAll', () => store.getAllSettings())
  register('setting:delete', (key) => store.deleteSetting(key as string))
}
