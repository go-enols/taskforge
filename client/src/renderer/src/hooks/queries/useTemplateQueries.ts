/**
 * @file 模板/脚本数据查询 Hook
 * @description 封装参数模板和任务脚本的查询与变更操作，
 *              包括本地模板 CRUD、远程脚本获取、安装与移除。
 * @module renderer/hooks/queries
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templateApi, taskTemplateApi, marketplaceApi, scriptApi } from '../../api'
import type {
  Template,
  TaskTemplate,
  RemoteScript,
  InstalledScript,
  ListResponse
} from '../../types'

/** 参数模板查询键工厂 */
export const templateKeys = {
  /** 所有模板根键 */
  all: ['templates'] as const,
  /** 分页列表查询键 */
  list: (page: number, pageSize: number, search: string) =>
    [...templateKeys.all, 'list', page, pageSize, search] as const,
  /** 单个模板详情查询键 */
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const
}

/** 任务脚本模板查询键工厂 */
export const taskTemplateKeys = {
  /** 所有任务模板根键 */
  all: ['taskTemplates'] as const,
  /** 分页列表查询键 */
  list: (page: number, pageSize: number, search: string) =>
    [...taskTemplateKeys.all, 'list', page, pageSize, search] as const,
  /** 单个任务模板详情查询键 */
  detail: (id: string) => [...taskTemplateKeys.all, 'detail', id] as const,
  /** 已安装脚本查询键 */
  installed: ['installedScripts'] as const,
  /** 远程脚本查询键 */
  remote: ['remoteScripts'] as const
}

/**
 * 获取参数模板分页列表
 * @param page - 页码（默认 1）
 * @param pageSize - 每页条数（默认 20）
 * @param search - 搜索关键字
 */
export function useTemplateList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<Template>>({
    queryKey: templateKeys.list(page, pageSize, search),
    queryFn: () => templateApi.list(page, pageSize, search)
  })
}

/** 创建参数模板 mutation */
export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Template, 'id' | 'updatedAt'>) => templateApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all })
  })
}

/** 更新参数模板 mutation */
export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Template> }) =>
      templateApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all })
  })
}

/** 删除参数模板 mutation */
export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => templateApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all })
  })
}

/**
 * 获取已安装的任务脚本分页列表
 * @param page - 页码（默认 1）
 * @param pageSize - 每页条数（默认 20）
 * @param search - 搜索关键字
 */
export function useTaskTemplateList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<TaskTemplate>>({
    queryKey: taskTemplateKeys.list(page, pageSize, search),
    queryFn: () => taskTemplateApi.list(page, pageSize, search)
  })
}

/** 获取所有已安装脚本列表 */
export function useInstalledScripts() {
  return useQuery<InstalledScript[]>({
    queryKey: taskTemplateKeys.installed,
    queryFn: () => scriptApi.listInstalled()
  })
}

/** 获取远程市场脚本列表 */
export function useRemoteScripts() {
  return useQuery<{ items: RemoteScript[]; total: number }>({
    queryKey: taskTemplateKeys.remote,
    queryFn: () => marketplaceApi.listScripts()
  })
}

/** 下载并安装远程脚本 mutation */
export function useDownloadScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scriptId: string) => scriptApi.download(scriptId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskTemplateKeys.installed })
      qc.invalidateQueries({ queryKey: taskTemplateKeys.all })
    }
  })
}

/** 移除已安装脚本 mutation */
export function useRemoveScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scriptId: string) => scriptApi.remove(scriptId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskTemplateKeys.installed })
      qc.invalidateQueries({ queryKey: taskTemplateKeys.all })
    }
  })
}
