import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { taskApi } from '../../api'
import type { Task, TaskLog, ListResponse } from '../../types'

export const taskKeys = {
  all: ['tasks'] as const,
  list: (page: number, pageSize: number, search: string) =>
    [...taskKeys.all, 'list', page, pageSize, search] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
  logs: (taskId: string, limit: number) => [...taskKeys.all, 'logs', taskId, limit] as const
}

export function useTaskList(page = 1, pageSize = 20, search = '') {
  return useQuery<ListResponse<Task>>({
    queryKey: taskKeys.list(page, pageSize, search),
    queryFn: () => taskApi.list(page, pageSize, search)
  })
}

export function useTask(id: string | null) {
  return useQuery<Task | null>({
    queryKey: taskKeys.detail(id!),
    queryFn: () => taskApi.get(id!),
    enabled: !!id
  })
}

export function useTaskLogs(taskId: string | null, limit = 100) {
  return useQuery<TaskLog[]>({
    queryKey: taskKeys.logs(taskId!, limit),
    queryFn: () => taskApi.getLogs(taskId!, limit),
    enabled: !!taskId
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { scriptFolder: string; config: Record<string, unknown> }) =>
      taskApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed')
    }
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => taskApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed')
    }
  })
}

export function useStartTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => taskApi.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed')
    }
  })
}

export function useStopTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => taskApi.stop(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed')
    }
  })
}

export function usePauseTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => taskApi.pause(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed')
    }
  })
}

export function useResumeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => taskApi.resume(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed')
    }
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => taskApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
    onError: (err: Error) => {
      toast.error(err.message || 'Operation failed')
    }
  })
}
