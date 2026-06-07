import type {
  Wallet,
  Account,
  Proxy,
  Task,
  TaskLog,
  Template,
  ScheduledTask,
  AirdropProject,
  AirdropAnalytics,
  AppInfo,
  StatsAggregate,
  ListResponse,
  AppLog,
  CaptchaKey,
  ProxyProvider,
  RemoteScript,
  InstalledScript,
  RemoteTemplate,
  TaskTemplate,
  TaskOutput
} from './types'
import { call } from './transport'

export const appApi = {
  getInfo: () => call<AppInfo>('app:getInfo'),
  getStats: () => call<StatsAggregate>('app:getStats')
}

export const walletApi = {
  list: (page = 1, pageSize = 50, search = '') =>
    call<ListResponse<Wallet>>('wallet:list', [page, pageSize, search]),
  get: (id: string) => call<Wallet | null>('wallet:get', [id]),
  create: (data: Omit<Wallet, 'id' | 'createdAt'>) => call<Wallet>('wallet:create', [data]),
  update: (id: string, data: Partial<Omit<Wallet, 'id' | 'createdAt'>>) =>
    call<Wallet>('wallet:update', [id, data]),
  delete: (id: string) => call<void>('wallet:delete', [id]),
  batchDelete: (ids: string[]) => call<void>('wallet:batchDelete', [ids])
}

export const accountApi = {
  list: (page = 1, pageSize = 50, search = '') =>
    call<ListResponse<Account>>('account:list', [page, pageSize, search]),
  get: (id: string) => call<Account | null>('account:get', [id]),
  create: (data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) =>
    call<Account>('account:create', [data]),
  update: (id: string, data: Partial<Account>) => call<Account>('account:update', [id, data]),
  delete: (id: string) => call<void>('account:delete', [id]),
  listPools: () => call<string[]>('account:listPools'),
  batchCreate: (items: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>[]) =>
    call<number>('account:batchCreate', [items])
}

export const proxyApi = {
  list: (page = 1, pageSize = 50, search = '') =>
    call<ListResponse<Proxy>>('proxy:list', [page, pageSize, search]),
  get: (id: string) => call<Proxy | null>('proxy:get', [id]),
  create: (data: Omit<Proxy, 'id' | 'createdAt'>) => call<Proxy>('proxy:create', [data]),
  update: (id: string, data: Partial<Omit<Proxy, 'id' | 'createdAt'>>) =>
    call<Proxy>('proxy:update', [id, data]),
  delete: (id: string) => call<void>('proxy:delete', [id]),
  batchDelete: (ids: string[]) => call<void>('proxy:batchDelete', [ids])
}

export const taskApi = {
  list: (page = 1, pageSize = 50, search = '') =>
    call<ListResponse<Task>>('task:list', [page, pageSize, search]),
  get: (id: string) => call<Task | null>('task:get', [id]),
  create: (data: { scriptFolder: string; config: Record<string, unknown>; isSandbox?: boolean }) =>
    call<Task>('task:create', [data]),
  start: (id: string) => call<void>('task:start', [id]),
  stop: (id: string) => call<void>('task:stop', [id]),
  pause: (id: string) => call<void>('task:pause', [id]),
  resume: (id: string) => call<void>('task:resume', [id]),
  delete: (id: string) => call<void>('task:delete', [id]),
  update: (id: string, data: Partial<Task>) => call<Task>('task:update', [id, data]),
  clearLogs: (taskId: string) => call<void>('task:clearLogs', [taskId]),
  getLogs: (taskId: string, limit = 100) => call<TaskLog[]>('task:getLogs', [taskId, limit]),
  getProgress: (taskId: string) =>
    call<{ percent: number; message: string } | null>('task:getProgress', [taskId]),
  getOutput: (taskId: string) => call<TaskOutput | null>('task:getOutput', [taskId])
}

export const scriptApi = {
  listRemote: () => call<RemoteScript[]>('script:listRemote'),
  download: (scriptId: string) => call<InstalledScript>('script:download', [scriptId]),
  checkUpdate: () => call<RemoteScript[]>('script:checkUpdate'),
  listInstalled: () => call<InstalledScript[]>('script:listInstalled'),
  remove: (scriptId: string) => call<void>('script:remove', [scriptId])
}

export const templateApi = {
  list: (page?: number, pageSize?: number, search?: string) =>
    call<ListResponse<Template>>('template:list', [page, pageSize, search]),
  get: (id: string) => call<Template | null>('template:get', [id]),
  create: (data: Omit<Template, 'id' | 'updatedAt'> & { id?: string }) =>
    call<Template>('template:create', [data]),
  update: (id: string, data: Partial<Template>) => call<Template>('template:update', [id, data]),
  delete: (id: string) => call<void>('template:delete', [id]),
  checkAccounts: (id: string) => call<number>('template:checkAccounts', [id])
}

export const taskTemplateApi = {
  list: (page?: number, pageSize?: number, search?: string) =>
    call<ListResponse<TaskTemplate>>('taskTemplate:list', [page, pageSize, search]),
  get: (id: string) => call<TaskTemplate | null>('taskTemplate:get', [id])
}

export const schedulerApi = {
  list: (page?: number, pageSize?: number, search?: string) =>
    call<ListResponse<ScheduledTask>>('scheduler:list', [page, pageSize, search]),
  create: (data: Omit<ScheduledTask, 'id' | 'createdAt'>) =>
    call<ScheduledTask>('scheduler:create', [data]),
  update: (id: string, data: Partial<ScheduledTask>) =>
    call<ScheduledTask>('scheduler:update', [id, data]),
  delete: (id: string) => call<void>('scheduler:delete', [id])
}

export const airdropApi = {
  list: (page = 1, pageSize = 50, search = '') =>
    call<ListResponse<AirdropProject>>('airdrop:list', [page, pageSize, search]),
  create: (data: Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'>) =>
    call<AirdropProject>('airdrop:create', [data]),
  get: (id: string) => call<AirdropProject | null>('airdrop:get', [id]),
  update: (id: string, data: Partial<AirdropProject>) =>
    call<AirdropProject>('airdrop:update', [id, data]),
  delete: (id: string) => call<void>('airdrop:delete', [id]),
  getAnalytics: () => call<AirdropAnalytics>('airdrop:analytics')
}

export const settingApi = {
  get: (key: string) => call<string | null>('setting:get', [key]),
  set: (key: string, value: string) => call<void>('setting:set', [key, value]),
  getAll: () => call<Record<string, string>>('setting:getAll'),
  delete: (key: string) => call<void>('setting:delete', [key])
}

export const logApi = {
  query: (
    level?: string,
    category?: string,
    search?: string,
    since?: string,
    until?: string,
    limit?: number
  ) => call<ListResponse<AppLog>>('log:query', [level, category, search, since, until, limit]),
  getCategories: () => call<string[]>('log:getCategories'),
  setLevel: (level: string) => call<void>('log:setLevel', [level]),
  getLevel: () => call<string>('log:getLevel'),
  deleteLogs: () => call<void>('log:deleteLogs')
}

export const captchaKeyApi = {
  list: () => call<ListResponse<CaptchaKey>>('captchaKey:list'),
  create: (data: Omit<CaptchaKey, 'id' | 'createdAt'>) =>
    call<CaptchaKey>('captchaKey:create', [data]),
  update: (id: string, data: Partial<CaptchaKey>) =>
    call<CaptchaKey>('captchaKey:update', [id, data]),
  delete: (id: string) => call<void>('captchaKey:delete', [id])
}

export const proxyProviderApi = {
  list: () => call<ListResponse<ProxyProvider>>('proxyProvider:list'),
  create: (data: Omit<ProxyProvider, 'id' | 'createdAt'>) =>
    call<ProxyProvider>('proxyProvider:create', [data]),
  update: (id: string, data: Partial<ProxyProvider>) =>
    call<ProxyProvider>('proxyProvider:update', [id, data]),
  delete: (id: string) => call<void>('proxyProvider:delete', [id])
}

export const updateApi = {
  check: () => call<void>('update:check'),
  download: () => call<void>('update:download'),
  install: () => call<void>('update:install')
}

export const windowApi = {
  minimize: () => call<void>('window:minimize'),
  toggleMaximize: () => call<void>('window:maximize'),
  close: () => call<void>('window:close'),
  isMaximized: () => call<boolean>('window:isMaximized'),
  platform: () => call<string>('window:platform')
}

export const shellApi = {
  openPath: (path: string) =>
    call<{ success: boolean; error?: string }>('shell:openPath', [path])
}

export const dialogApi = {
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    call<{ canceled: boolean; filePath: string | null; content: string | null }>(
      'dialog:openFile',
      [filters]
    ),
  saveFile: (defaultName: string, content: string) =>
    call<{ canceled: boolean; filePath: string | null }>('dialog:saveFile', [defaultName, content])
}

export const fileApi = {
  selectFolder: () => call<{ canceled: boolean; folderPath: string | null }>('dialog:selectFolder'),
  readFile: (path: string) =>
    call<{ success: boolean; content: string | null; error?: string }>('fs:readFile', [path]),
  writeFile: (path: string, content: string) =>
    call<{ success: boolean; error?: string }>('fs:writeFile', [path, content]),
  exists: (path: string) => call<boolean>('fs:exists', [path])
}

export const zipApi = {
  create: (zipPath: string, sourceDir: string) =>
    call<{ success: boolean; error?: string }>('zip:create', [zipPath, sourceDir]),
  extractManifest: (zipPath: string) =>
    call<{ success: boolean; manifest: Record<string, unknown> | null; error?: string }>(
      'zip:extractManifest',
      [zipPath]
    )
}

export const serverApi = {
  upload: (url: string, zipPath: string, headers: Record<string, string>, formFields?: Record<string, string>) =>
    call<unknown>('server:upload', [url, zipPath, headers, formFields])
}

const MARKETPLACE_URL_KEY = 'marketplace_server_url'
const MARKETPLACE_API_KEY_KEY = 'marketplace_api_key'
const DEFAULT_MARKETPLACE_URL = 'http://localhost:3400'

export async function getMarketplaceUrl(): Promise<string> {
  try {
    const saved = await settingApi.get(MARKETPLACE_URL_KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return DEFAULT_MARKETPLACE_URL
}

export async function setMarketplaceUrl(url: string): Promise<void> {
  await settingApi.set(MARKETPLACE_URL_KEY, url)
}

export async function getMarketplaceApiKey(): Promise<string> {
  try {
    const saved = await settingApi.get(MARKETPLACE_API_KEY_KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return ''
}

export async function setMarketplaceApiKey(key: string): Promise<void> {
  await settingApi.set(MARKETPLACE_API_KEY_KEY, key)
}

export async function getMarketplaceHeaders(): Promise<Record<string, string>> {
  try {
    const jwt = await settingApi.get('marketplace_jwt')
    if (jwt) return { Authorization: `Bearer ${jwt}` }
  } catch {
    /* ignore */
  }
  try {
    const localJwt = localStorage.getItem('marketplace_jwt')
    if (localJwt) return { Authorization: `Bearer ${localJwt}` }
  } catch {
    /* ignore */
  }
  const key = await getMarketplaceApiKey()
  return key ? { Authorization: `Bearer ${key}` } : {}
}

export const marketplaceApi = {
  getUrl: getMarketplaceUrl,
  setUrl: setMarketplaceUrl,
  getApiKey: getMarketplaceApiKey,
  setApiKey: setMarketplaceApiKey,

  login: (username: string, password: string) =>
    call<{
      token: string
      user: { id: string; username: string; displayName: string; role: string }
    }>('market:login', [username, password]),

  register: (username: string, password: string, displayName: string) =>
    call<{
      token: string
      user: { id: string; username: string; displayName: string; role: string }
    }>('market:register', [username, password, displayName]),

  setup: (username: string, password: string, displayName: string) =>
    call<{
      token: string
      user: { id: string; username: string; displayName: string; role: string }
    }>('market:setup', [username, password, displayName]),

  getUser: () =>
    call<{ id: string; username: string; displayName: string; role: string } | null>(
      'market:getUser'
    ),

  getMe: async () => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/users/me`, { headers })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const json = await resp.json()
    return json.data as {
      id: string
      username: string
      displayName: string
      role: string
      apiKey: string
      createdAt: string
      updatedAt: string
    }
  },

  updateMe: async (data: {
    displayName?: string
    currentPassword?: string
    newPassword?: string
  }) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data)
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      let msg = errBody
      try {
        const parsed = JSON.parse(errBody)
        const e = parsed.error
        msg =
          (typeof e === 'object' && e !== null ? e.message : null) ??
          parsed.message ??
          (typeof e === 'string' ? e : null) ??
          errBody
      } catch {
        /* keep errBody */
      }
      throw new Error(msg)
    }
    return (await resp.json()) as { data: unknown; updated: string[] }
  },

  regenerateMyKey: async () => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/users/me/regenerate-key`, {
      method: 'POST',
      headers
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const json = await resp.json()
    return json.data as {
      id: string
      username: string
      displayName: string
      role: string
      apiKey: string
      createdAt: string
      updatedAt: string
    }
  },

  testConnection: async (url?: string) => {
    const base = url || (await getMarketplaceUrl())
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/health`, { headers })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return (await resp.json()) as { status: string; needsSetup: boolean; timestamp: string }
  },

  logout: () => call<null>('market:logout'),

  listScripts: async (serverUrl?: string) => {
    const base = serverUrl || (await getMarketplaceUrl())
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/scripts?all=true`, { headers })
    if (!resp.ok) throw new Error(`Failed to fetch scripts: ${resp.status}`)
    const json = await resp.json()
    const data = json.data ?? json
    return {
      items: data.items ?? [],
      total: data.total ?? 0,
      page: data.page ?? 1,
      pageSize: data.items?.length ?? data.total ?? 0,
      totalPages: data.totalPages ?? 1
    } as ListResponse<RemoteScript>
  },

  listTemplates: async (serverUrl?: string) => {
    const base = serverUrl || (await getMarketplaceUrl())
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/templates?all=true`, { headers })
    if (!resp.ok) throw new Error(`Failed to fetch templates: ${resp.status}`)
    const json = await resp.json()
    const data = json.data ?? json
    return {
      items: data.items ?? [],
      total: data.total ?? 0,
      page: data.page ?? 1,
      pageSize: data.items?.length ?? data.total ?? 0,
      totalPages: data.totalPages ?? 1
    } as ListResponse<RemoteTemplate>
  },

  installTemplate: async (_serverUrl: string, template: RemoteTemplate) => {
    const existing = await templateApi.list(1, 9999)
    const dup = existing.items.find((t) => t.id === template.id)
    if (dup) {
      await templateApi.update(dup.id, {
        name: template.name,
        type: template.type,
        version: template.version,
        schema: template.schema
      })
    } else {
      await templateApi.create({
        id: template.id,
        name: template.name,
        type: template.type,
        version: template.version,
        schema: template.schema,
        isLocal: false
      })
    }
  },

  patchTemplate: async (id: string, data: Record<string, unknown>) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data)
    })
    if (!resp.ok) throw new Error(`Failed to update template: ${resp.status}`)
    return resp.json()
  },

  patchScript: async (id: string, data: Record<string, unknown>) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/scripts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data)
    })
    if (!resp.ok) throw new Error(`Failed to update script: ${resp.status}`)
    return resp.json()
  },

  deleteScript: async (id: string) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/scripts/${id}`, {
      method: 'DELETE',
      headers
    })
    if (!resp.ok) throw new Error(`Failed to delete script: ${resp.status}`)
    return resp.json()
  },

  deleteTemplate: async (id: string) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/templates/${id}`, {
      method: 'DELETE',
      headers
    })
    if (!resp.ok) throw new Error(`Failed to delete template: ${resp.status}`)
    return resp.json()
  },

  reuploadScript: async (id: string, filePath: string) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const result = await serverApi.upload(`${base}/api/scripts/${id}/reupload`, filePath, headers)
    return result
  },

  getPendingScripts: async () => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/scripts/pending`, { headers })
    if (!resp.ok) throw new Error(`Failed to fetch pending scripts: ${resp.status}`)
    return resp.json()
  },

  getMyPendingScripts: async () => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/scripts/my-pending`, { headers })
    if (!resp.ok) throw new Error(`Failed to fetch pending scripts: ${resp.status}`)
    return resp.json()
  },

  reviewScript: async (id: string, action: 'approve' | 'reject', comment?: string) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/scripts/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action, comment })
    })
    if (!resp.ok) throw new Error(`Failed to review script: ${resp.status}`)
    return resp.json()
  },

  getPendingTemplates: async () => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/templates/pending`, { headers })
    if (!resp.ok) throw new Error(`Failed to fetch pending templates: ${resp.status}`)
    return resp.json()
  },

  getMyPendingTemplates: async () => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/templates/my-pending`, { headers })
    if (!resp.ok) throw new Error(`Failed to fetch pending templates: ${resp.status}`)
    return resp.json()
  },

  reviewTemplate: async (id: string, action: 'approve' | 'reject', comment?: string) => {
    const base = await getMarketplaceUrl()
    const headers = await getMarketplaceHeaders()
    const resp = await fetch(`${base}/api/templates/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action, comment })
    })
    if (!resp.ok) throw new Error(`Failed to review template: ${resp.status}`)
    return resp.json()
  }
}
