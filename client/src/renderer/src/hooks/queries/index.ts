/**
 * @file React Query Hooks 统一导出
 * @description 将所有数据查询 Hooks 和键工厂统一导出，方便外部引用。
 * @module renderer/hooks/queries
 */

export { queryClient } from './queryClient'

export {
  walletKeys,
  useWalletList,
  useWallet,
  useCreateWallet,
  useUpdateWallet,
  useDeleteWallet,
  useBatchDeleteWallets
} from './useWalletQueries'

export {
  scriptParamKeys,
  useScriptParamList,
  useScriptParam,
  useScriptParamPools,
  useCreateScriptParam,
  useUpdateScriptParam,
  useDeleteScriptParam
} from './useScriptParamQueries'

export {
  proxyKeys,
  useProxyList,
  useCreateProxy,
  useUpdateProxy,
  useDeleteProxy,
  useBatchDeleteProxies
} from './useProxyQueries'

export {
  taskKeys,
  useTaskList,
  useTask,
  useTaskLogs,
  useCreateTask,
  useUpdateTask,
  useStartTask,
  useStopTask,
  usePauseTask,
  useResumeTask,
  useDeleteTask
} from './useTaskQueries'

export {
  templateKeys,
  taskTemplateKeys,
  useTemplateList,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useTaskTemplateList,
  useInstalledScripts,
  useRemoteScripts,
  useDownloadScript,
  useRemoveScript
} from './useTemplateQueries'

export {
  airdropKeys,
  useAirdropList,
  useAirdrop,
  useCreateAirdrop,
  useUpdateAirdrop,
  useDeleteAirdrop
} from './useAirdropQueries'

export {
  settingKeys,
  schedulerKeys,
  captchaKeyKeys,
  proxyProviderKeys,
  appKeys,
  useSetting,
  useAllSettings,
  useSetSetting,
  useSchedulerList,
  useCreateScheduler,
  useUpdateScheduler,
  useDeleteScheduler,
  useCaptchaKeyList,
  useCreateCaptchaKey,
  useDeleteCaptchaKey,
  useProxyProviderList,
  useCreateProxyProvider,
  useDeleteProxyProvider,
  useAppInfo,
  useAppStats
} from './useSettingQueries'
