import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templateApi, taskTemplateApi, marketplaceApi, scriptApi } from '../../api'
import type {
  Template,
  TaskTemplate,
  RemoteScript,
  InstalledScript,
  ListResponse
} from '../../types'

export const templateKeys = {
  all: ['templates'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...templateKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const
}

export const taskTemplateKeys = {
  all: ['taskTemplates'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...taskTemplateKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...taskTemplateKeys.all, 'detail', id] as const,
  installed: ['installedScripts'] as const,
  remote: ['remoteScripts'] as const
}

export function useTemplateList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<Template>>({
    queryKey: templateKeys.list(page, pageSize, search),
    queryFn: () => templateApi.list(page, pageSize, search)
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Template, 'id' | 'updatedAt'>) => templateApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all })
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Template> }) =>
      templateApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all })
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => templateApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all })
  })
}

export function useTaskTemplateList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<TaskTemplate>>({
    queryKey: taskTemplateKeys.list(page, pageSize, search),
    queryFn: () => taskTemplateApi.list(page, pageSize, search)
  })
}

export function useInstalledScripts() {
  return useQuery<InstalledScript[]>({
    queryKey: taskTemplateKeys.installed,
    queryFn: () => scriptApi.listInstalled()
  })
}

export function useRemoteScripts() {
  return useQuery<{ items: RemoteScript[]; total: number }>({
    queryKey: taskTemplateKeys.remote,
    queryFn: () => marketplaceApi.listScripts()
  })
}

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
