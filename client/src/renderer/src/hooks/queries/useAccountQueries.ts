import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountApi } from '../../api'
import type { Account, ListResponse } from '../../types'

export const accountKeys = {
  all: ['accounts'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...accountKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...accountKeys.all, 'detail', id] as const,
  pools: ['accountPools'] as const
}

export function useAccountList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<Account>>({
    queryKey: accountKeys.list(page, pageSize, search),
    queryFn: () => accountApi.list(page, pageSize, search)
  })
}

export function useAccount(id: string | null) {
  return useQuery<Account | null>({
    queryKey: accountKeys.detail(id!),
    queryFn: () => accountApi.get(id!),
    enabled: !!id
  })
}

export function useAccountPools() {
  return useQuery<string[]>({
    queryKey: accountKeys.pools,
    queryFn: () => accountApi.listPools()
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => accountApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all })
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Account> }) =>
      accountApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all })
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all })
  })
}
