/**
 * @file 日志 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerLogHandlers(services: Services): void {
  const { store } = services

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
}
