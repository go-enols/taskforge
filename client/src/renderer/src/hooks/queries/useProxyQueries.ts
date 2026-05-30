import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { proxyApi } from '../../api'
import type { Proxy, ListResponse } from '../../types'

export const proxyKeys = {
  all: ['proxies'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...proxyKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...proxyKeys.all, 'detail', id] as const
}

export function useProxyList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<Proxy>>({
    queryKey: proxyKeys.list(page, pageSize, search),
    queryFn: () => proxyApi.list(page, pageSize, search)
  })
}

export function useCreateProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Proxy, 'id' | 'createdAt'>) => proxyApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: proxyKeys.all })
  })
}

export function useUpdateProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Proxy> }) => proxyApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: proxyKeys.all })
  })
}

export function useDeleteProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => proxyApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: proxyKeys.all })
  })
}

export function useBatchDeleteProxies() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => proxyApi.batchDelete(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: proxyKeys.all })
  })
}
