/**
 * @file 脚本参数数据查询 Hook
 * @description 封装参数池中脚本参数的列表查询、详情获取、参数池名称列表和 CRUD 操作。
 * @module renderer/hooks/queries
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptParamApi } from '../../api'
import type { ScriptParam, ListResponse } from '../../types'

/** 脚本参数查询键工厂 */
export const scriptParamKeys = {
  /** 所有脚本参数根键 */
  all: ['scriptParams'] as const,
  /** 分页列表查询键 */
  list: (page: number, pageSize: number, search: string) =>
    [...scriptParamKeys.all, 'list', page, pageSize, search] as const,
  /** 单个脚本参数详情查询键 */
  detail: (id: string) => [...scriptParamKeys.all, 'detail', id] as const,
  /** 参数池名称列表查询键 */
  pools: ['scriptParamPools'] as const
}

/**
 * 获取脚本参数分页列表
 * @param page - 页码（默认 1）
 * @param pageSize - 每页条数（默认 20）
 * @param search - 搜索关键字
 */
export function useScriptParamList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<ScriptParam>>({
    queryKey: scriptParamKeys.list(page, pageSize, search),
    queryFn: () => scriptParamApi.list(page, pageSize, search)
  })
}

/**
 * 获取单个脚本参数详情
 * @param id - 脚本参数 ID，为 null 时禁用查询
 */
export function useScriptParam(id: string | null) {
  return useQuery<ScriptParam | null>({
    queryKey: scriptParamKeys.detail(id!),
    queryFn: () => scriptParamApi.get(id!),
    enabled: !!id
  })
}

/** 获取所有参数池名称列表 */
export function useScriptParamPools() {
  return useQuery<string[]>({
    queryKey: scriptParamKeys.pools,
    queryFn: () => scriptParamApi.listPools()
  })
}

/** 创建脚本参数 mutation */
export function useCreateScriptParam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<ScriptParam, 'id' | 'createdAt' | 'updatedAt'>) =>
      scriptParamApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptParamKeys.all })
  })
}

/** 更新脚本参数 mutation */
export function useUpdateScriptParam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ScriptParam> }) =>
      scriptParamApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptParamKeys.all })
  })
}

/** 删除脚本参数 mutation */
export function useDeleteScriptParam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => scriptParamApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: scriptParamKeys.all })
  })
}
