/**
 * @file TaskForge 移动端 API 客户端
 * @description 与 Marketplace Server（Express）通信；生产环境为同源 /api，开发环境由 Vite 代理。
 * @module mobile/src/api
 */

/** 登录用户 */
export interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'developer' | 'user'
  apiKeySet?: boolean
  createdAt?: string
}

/** 脚本市场条目 */
export interface ScriptItem {
  id: string
  name: string
  version: string
  description: string
  schema?: Record<string, unknown>
  entryPoint?: string
  tags?: string[]
  changelog?: string
  downloads?: number
  visible?: boolean
  createdBy?: string | null
  createdByName?: string
  reviewStatus?: 'pending' | 'approved' | 'rejected' | string
  reviewComment?: string
  avgRating?: number
  reviewCount?: number
  updatedAt?: string
  createdAt?: string
}

/** 账户模板 */
export interface TemplateItem {
  id: string
  name: string
  type: string
  version?: string
  description?: string
  schema?: Record<string, unknown>
  visible?: boolean
  reviewStatus?: string
  updatedAt?: string
}

/** 项目模板字段 */
export interface ProjectTemplateField {
  key?: string
  label?: string
  type?: string
  required?: boolean
  [key: string]: unknown
}

/** 项目模板 */
export interface ProjectTemplateItem {
  id: string
  name: string
  description?: string
  icon?: string
  fields?: ProjectTemplateField[]
  builtIn?: boolean
  enabled?: boolean
  visible?: boolean
  reviewStatus?: string
}

/** 脚本版本记录 */
export interface ScriptVersion {
  version: string
  changelog?: string
  checksum?: string
  createdBy?: string | null
  createdAt?: string
}

/** 健康检查响应 */
export interface HealthInfo {
  status: string
  db?: string
  timestamp: string
  needsSetup: boolean
}

/** 分页响应 */
export interface ListResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** API 错误 */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const TOKEN_KEY = 'tf_mobile_token'
const USER_KEY = 'tf_mobile_user'

/** 读取本地 JWT */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** 写入/清除本地 JWT */
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore quota/private mode */
  }
}

/** 读取缓存的用户信息 */
export function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

/** 缓存用户信息 */
export function setCachedUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

/** 登录态失效时通知 UI */
function emitUnauthorized(): void {
  setToken(null)
  setCachedUser(null)
  window.dispatchEvent(new Event('tf:unauthorized'))
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  unwrap?: boolean
  signal?: AbortSignal
}

/** 发起 JSON 请求并解包 { data } */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (options.auth !== false && token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    })
  } catch (err) {
    throw new ApiError(
      err instanceof DOMException && err.name === 'AbortError'
        ? '请求超时，请检查网络'
        : '网络连接失败，请检查网络后重试',
      0
    )
  }

  const contentType = response.headers.get('content-type') ?? ''
  let payload: unknown = null
  if (contentType.includes('json')) {
    payload = await response.json().catch(() => null)
  }

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; code?: string } } | null)?.error
    if (response.status === 401) emitUnauthorized()
    throw new ApiError(error?.message || `请求失败（${response.status}）`, response.status, error?.code)
  }

  // 健康检查等少数接口直接返回对象（非 { data } 包装）
  if (options.unwrap === false) return payload as T
  return (payload as { data?: T } | null)?.data as T
}

/** 认证相关 */
export const authApi = {
  health: () => request<HealthInfo>('/api/health', { auth: false, unwrap: false }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false
    }),
  register: (username: string, password: string, displayName?: string) =>
    request<{ token: string; apiKey?: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: { username, password, displayName },
      auth: false
    }),
  setup: (username: string, password: string, displayName?: string) =>
    request<{ token: string; apiKey?: string; user: User }>('/api/auth/setup', {
      method: 'POST',
      body: { username, password, displayName },
      auth: false
    })
}

/** 当前用户 */
export const userApi = {
  me: () => request<User>('/api/users/me'),
  updateMe: (input: { displayName?: string; currentPassword?: string; newPassword?: string }) =>
    request<User>('/api/users/me', { method: 'PATCH', body: input }),
  regenerateKey: () =>
    request<User & { apiKey: string }>('/api/users/me/regenerate-key', { method: 'POST' })
}

/** 脚本市场 */
export const scriptApi = {
  list: (page = 1, pageSize = 20, search = '') =>
    request<ListResponse<ScriptItem>>(
      `/api/scripts?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`
    ),
  get: (id: string) => request<ScriptItem>(`/api/scripts/${encodeURIComponent(id)}`),
  versions: (id: string) => request<ScriptVersion[]>(`/api/scripts/${encodeURIComponent(id)}/versions`),

  /** 下载脚本 zip 为 Blob（App 安装到本机时使用） */
  fetchZip: async (id: string): Promise<Blob> => {
    const token = getToken()
    const response = await fetch(`/api/scripts/${encodeURIComponent(id)}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!response.ok) {
      if (response.status === 401) emitUnauthorized()
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null
      throw new ApiError(payload?.error?.message || `下载失败（${response.status}）`, response.status)
    }
    return await response.blob()
  },

  /** 下载脚本 zip 并触发浏览器保存 */
  download: async (id: string, fallbackName: string): Promise<void> => {
    const blob = await scriptApi.fetchZip(id)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${fallbackName}.zip`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
}

/** 模板市场 */
export const templateApi = {
  list: (page = 1, pageSize = 50) =>
    request<ListResponse<TemplateItem>>(`/api/templates?page=${page}&pageSize=${pageSize}`),
  projectList: () =>
    request<{ items: ProjectTemplateItem[]; total: number }>('/api/project-templates')
}
