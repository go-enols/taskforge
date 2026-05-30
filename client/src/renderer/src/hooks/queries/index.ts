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
  accountKeys,
  useAccountList,
  useAccount,
  useAccountPools,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount
} from './useAccountQueries'

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
