/**
 * @file IPC 处理器注册表与 API 执行引擎 — 单独入口
 * @description 聚合所有领域 handler 文件的注册函数，并提供 handlerMap 和 executeHandler
 *              给 HTTP API 服务器使用。所有 IPC channel 在 registerIpcHandlers() 中统一注册。
 */
import { handlerMap, executeHandler, Services } from './registry'
import { createLogger } from '../utils/logger'

import { registerAppHandlers } from './handlers/app-handlers'
import { registerWalletHandlers } from './handlers/wallet-handlers'
import { registerScriptParamHandlers } from './handlers/scriptParam-handlers'
import { registerProxyHandlers } from './handlers/proxy-handlers'
import { registerTaskHandlers } from './handlers/task-handlers'
import { registerScriptHandlers } from './handlers/script-handlers'
import { registerTemplateHandlers } from './handlers/template-handlers'
import { registerTaskTemplateHandlers } from './handlers/taskTemplate-handlers'
import { registerSchedulerHandlers } from './handlers/scheduler-handlers'
import { registerAirdropHandlers } from './handlers/airdrop-handlers'
import { registerProjectTemplateHandlers } from './handlers/projectTemplate-handlers'
import { registerCaptchaKeyHandlers } from './handlers/captchaKey-handlers'
import { registerProxyProviderHandlers } from './handlers/proxyProvider-handlers'
import { registerSettingHandlers } from './handlers/setting-handlers'
import { registerLogHandlers } from './handlers/log-handlers'
import { registerSystemHandlers } from './handlers/system-handlers'
import { registerMarketHandlers } from './handlers/market-handlers'

const logger = createLogger('ipc')

/**
 * 注册所有 IPC 处理器
 *
 * 调用各领域 handler 文件中的注册函数，将所有 handler 注册到 handlerMap 和 ipcMain.handle。
 * 每个 handler 通过 register() 同时注册到 IPC 和 HTTP 双传输层。
 *
 * @param services - 所有需要注入的服务与仓库实例
 */
export function registerIpcHandlers(services: Services): void {
  registerAppHandlers(services)
  registerWalletHandlers(services)
  registerScriptParamHandlers(services)
  registerProxyHandlers(services)
  registerTaskHandlers(services)
  registerScriptHandlers(services)
  registerTemplateHandlers(services)
  registerTaskTemplateHandlers(services)
  registerSchedulerHandlers(services)
  registerAirdropHandlers(services)
  registerProjectTemplateHandlers(services)
  registerCaptchaKeyHandlers(services)
  registerProxyProviderHandlers(services)
  registerSettingHandlers(services)
  registerLogHandlers(services)
  registerSystemHandlers(services)
  registerMarketHandlers(services)


  logger.info('All handlers registered', { count: handlerMap.size })
}

export { handlerMap, executeHandler }
