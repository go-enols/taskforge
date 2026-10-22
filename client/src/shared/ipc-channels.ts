/**
 * @file IPC channel 白名单（共享给 preload 校验 + 测试防漂移）
 * @description 由 client/src/main 中实际注册的 channel 生成，并纳入版本管理。
 *              preload 只允许调用/订阅此文件列出的 channel，避免渲染层被注入代码后
 *              调用任意主进程 handler。
 *
 *              维护方式：新增 IPC handler 后，执行
 *              `node scripts/generate-ipc-channels.cjs` 重新生成本文件；
 *              `tests/main/ipc/channel-allowlist.test.ts` 会扫描源码校验两者一致。
 * @module shared/ipc-channels
 */

/** preload.invoke 允许调用的 channel（IPC handler 白名单） */
export const IPC_INVOKE_CHANNELS: readonly string[] = [
  'airdrop:analytics',
  'airdrop:create',
  'airdrop:delete',
  'airdrop:get',
  'airdrop:list',
  'airdrop:update',
  'app:getInfo',
  'app:getStats',
  'app:getTempDir',
  'captchaKey:create',
  'captchaKey:delete',
  'captchaKey:get',
  'captchaKey:list',
  'captchaKey:update',
  'devtools:toggle',
  'dialog:openFile',
  'dialog:saveFile',
  'dialog:selectFolder',
  'fs:exists',
  'fs:readFile',
  'fs:writeFile',
  'log:deleteLogs',
  'log:getCategories',
  'log:getLevel',
  'log:query',
  'log:setLevel',
  'market:getUser',
  'market:login',
  'market:logout',
  'market:register',
  'market:setup',
  'market:testConnection',
  'projectTemplate:create',
  'projectTemplate:delete',
  'projectTemplate:get',
  'projectTemplate:list',
  'projectTemplate:update',
  'proxy:batchDelete',
  'proxy:create',
  'proxy:delete',
  'proxy:get',
  'proxy:list',
  'proxy:update',
  'proxyProvider:create',
  'proxyProvider:delete',
  'proxyProvider:get',
  'proxyProvider:list',
  'proxyProvider:update',
  'scheduler:create',
  'scheduler:delete',
  'scheduler:get',
  'scheduler:list',
  'scheduler:update',
  'script:checkUpdate',
  'script:download',
  'script:listInstalled',
  'script:listRemote',
  'script:remove',
  'scriptParam:batchCreate',
  'scriptParam:create',
  'scriptParam:delete',
  'scriptParam:get',
  'scriptParam:list',
  'scriptParam:listPools',
  'scriptParam:update',
  'server:upload',
  'setting:delete',
  'setting:get',
  'setting:getAll',
  'setting:set',
  'shell:openPath',
  'task:clearLogs',
  'task:create',
  'task:delete',
  'task:get',
  'task:getLogs',
  'task:getOutput',
  'task:getProgress',
  'task:list',
  'task:pause',
  'task:resume',
  'task:start',
  'task:stop',
  'task:update',
  'taskTemplate:create',
  'taskTemplate:delete',
  'taskTemplate:get',
  'taskTemplate:list',
  'taskTemplate:update',
  'template:checkScriptParams',
  'template:create',
  'template:delete',
  'template:get',
  'template:list',
  'template:update',
  'update:check',
  'update:download',
  'update:install',
  'wallet:batchDelete',
  'wallet:create',
  'wallet:delete',
  'wallet:get',
  'wallet:list',
  'wallet:update',
  'window:close',
  'window:isMaximized',
  'window:maximize',
  'window:minimize',
  'window:platform',
  'zip:create',
  'zip:extractManifest'
]

/** preload.on 允许订阅的主进程 → 渲染层事件 channel */
export const IPC_EVENT_CHANNELS: readonly string[] = [
  'task:log',
  'task:output',
  'task:statusChanged',
  'update:status',
  'upload:progress',
  'window:maximizedChanged'
]

const INVOKE_SET = new Set<string>(IPC_INVOKE_CHANNELS)
const EVENT_SET = new Set<string>(IPC_EVENT_CHANNELS)

/**
 * 判断 channel 是否允许通过 preload.invoke 调用
 * @param channel - 渲染层传入的 channel
 * @returns 是否在白名单内
 */
export function isAllowedInvokeChannel(channel: unknown): channel is string {
  return typeof channel === 'string' && INVOKE_SET.has(channel)
}

/**
 * 判断 channel 是否允许通过 preload.on 订阅
 * @param channel - 渲染层传入的 channel
 * @returns 是否在白名单内
 */
export function isAllowedEventChannel(channel: unknown): channel is string {
  return typeof channel === 'string' && EVENT_SET.has(channel)
}
