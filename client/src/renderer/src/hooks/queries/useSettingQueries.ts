import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingApi, schedulerApi, captchaKeyApi, proxyProviderApi, appApi } from '../../api'
import type {
  ScheduledTask,
  CaptchaKey,
  ProxyProvider,
  StatsAggregate,
  ListResponse
} from '../../types'

export const settingKeys = {
  all: ['settings'] as const,
  key: (key: string) => [...settingKeys.all, key] as const
}

export const schedulerKeys = {
  all: ['scheduledTasks'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...schedulerKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...schedulerKeys.all, 'detail', id] as const
}

export const captchaKeyKeys = {
  all: ['captchaKeys'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...captchaKeyKeys.all, 'list', page, pageSize, search] as const
}

export const proxyProviderKeys = {
  all: ['proxyProviders'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...proxyProviderKeys.all, 'list', page, pageSize, search] as const
}

export const appKeys = {
  info: ['appInfo'] as const,
  stats: ['appStats'] as const
}

export function useSetting(key: string | null) {
  return useQuery<string | null>({
    queryKey: settingKeys.key(key!),
    queryFn: () => settingApi.get(key!),
    enabled: !!key
  })
}

export function useAllSettings() {
  return useQuery<Record<string, string>>({
    queryKey: settingKeys.all,
    queryFn: () => settingApi.getAll()
  })
}

export function useSetSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => settingApi.set(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingKeys.all })
  })
}

export function useSchedulerList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<ScheduledTask>>({
    queryKey: schedulerKeys.list(page, pageSize, search),
    queryFn: () => schedulerApi.list()
  })
}

export function useCreateScheduler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<ScheduledTask, 'id' | 'createdAt'>) => schedulerApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: schedulerKeys.all })
  })
}

export function useUpdateScheduler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ScheduledTask> }) =>
      schedulerApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: schedulerKeys.all })
  })
}

export function useDeleteScheduler() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => schedulerApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: schedulerKeys.all })
  })
}

export function useCaptchaKeyList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<CaptchaKey>>({
    queryKey: captchaKeyKeys.list(page, pageSize, search),
    queryFn: () => captchaKeyApi.list()
  })
}

export function useCreateCaptchaKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<CaptchaKey, 'id' | 'createdAt'>) => captchaKeyApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: captchaKeyKeys.all })
  })
}

export function useDeleteCaptchaKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => captchaKeyApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: captchaKeyKeys.all })
  })
}

export function useProxyProviderList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<ProxyProvider>>({
    queryKey: proxyProviderKeys.list(page, pageSize, search),
    queryFn: () => proxyProviderApi.list()
  })
}

export function useCreateProxyProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<ProxyProvider, 'id' | 'createdAt'>) => proxyProviderApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: proxyProviderKeys.all })
  })
}

export function useDeleteProxyProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => proxyProviderApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: proxyProviderKeys.all })
  })
}

export function useAppInfo() {
  return useQuery({
    queryKey: appKeys.info,
    queryFn: () => appApi.getInfo()
  })
}

export function useAppStats() {
  return useQuery<StatsAggregate>({
    queryKey: appKeys.stats,
    queryFn: () => appApi.getStats()
  })
}
