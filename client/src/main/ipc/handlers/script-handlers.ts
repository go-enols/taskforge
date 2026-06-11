/**
 * @file 脚本 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerScriptHandlers(services: Services): void {
  const { scriptFetcher } = services

  register('script:listRemote', () => scriptFetcher.fetchScriptList())
  register('script:download', (scriptId) => scriptFetcher.downloadScript(scriptId as string))
  register('script:checkUpdate', () => scriptFetcher.checkUpdates())
  register('script:listInstalled', () => scriptFetcher.getInstalledScripts())
  register('script:remove', (scriptId) => scriptFetcher.removeScript(scriptId as string))
}
