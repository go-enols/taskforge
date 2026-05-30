import { toast } from 'sonner'

export const toastSuccess = (msg: string): string | number => toast.success(msg)
export const toastError = (msg: string): string | number => toast.error(msg)
export const toastInfo = (msg: string): string | number => toast.info(msg)
export const toastWarning = (msg: string): string | number => toast.warning(msg)
export const toastLoading = (msg: string): string | number => toast.loading(msg)
export const toastPromise = <T>(
  promise: Promise<T>,
  opts: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((err: Error) => string)
  }
): ReturnType<typeof toast.promise> => toast.promise(promise, opts)
export const dismissToast = (id?: string | number): string | number => toast.dismiss(id)
