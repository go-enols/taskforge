import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { airdropApi } from '../../api'
import type { AirdropProject, ListResponse } from '../../types'

export const airdropKeys = {
  all: ['airdrops'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...airdropKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...airdropKeys.all, 'detail', id] as const
}

export function useAirdropList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<AirdropProject>>({
    queryKey: airdropKeys.list(page, pageSize, search),
    queryFn: () => airdropApi.list(page, pageSize, search)
  })
}

export function useAirdrop(id: string | null) {
  return useQuery<AirdropProject | null>({
    queryKey: airdropKeys.detail(id!),
    queryFn: () => airdropApi.get(id!),
    enabled: !!id
  })
}

export function useCreateAirdrop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>) =>
      airdropApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: airdropKeys.all })
  })
}

export function useUpdateAirdrop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AirdropProject> }) =>
      airdropApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: airdropKeys.all })
  })
}

export function useDeleteAirdrop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => airdropApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: airdropKeys.all })
  })
}
