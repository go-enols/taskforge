import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { walletApi } from '../../api'
import type { Wallet, ListResponse } from '../../types'

export const walletKeys = {
  all: ['wallets'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...walletKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...walletKeys.all, 'detail', id] as const
}

export function useWalletList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<Wallet>>({
    queryKey: walletKeys.list(page, pageSize, search),
    queryFn: () => walletApi.list(page, pageSize, search)
  })
}

export function useWallet(id: string | null) {
  return useQuery<Wallet | null>({
    queryKey: walletKeys.detail(id!),
    queryFn: () => walletApi.get(id!),
    enabled: !!id
  })
}

export function useCreateWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Wallet, 'id' | 'createdAt'>) => walletApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: walletKeys.all })
  })
}

export function useUpdateWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Wallet> }) => walletApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: walletKeys.all })
  })
}

export function useDeleteWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => walletApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: walletKeys.all })
  })
}

export function useBatchDeleteWallets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => walletApi.batchDelete(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: walletKeys.all })
  })
}
