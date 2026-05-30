export interface Wallet {
  id: string
  address: string
  privateKey: string | null
  mnemonic: string | null
  walletType: 'evm' | 'solana' | 'sui' | 'bitcoin'
  labels: string[]
  createdAt: string
}

export interface Account {
  id: string
  templateId: string
  data: Record<string, unknown>
  pool: string
  labels: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export type ProxyFormat = 'manual' | 'api' | 'ip' | 'ws'

export interface Proxy {
  id: string
  protocol: 'http' | 'https' | 'socks5' | 'ws'
  host: string
  port: number
  username: string | null
  password: string | null
  status: 'active' | 'inactive' | 'expired'
  format: ProxyFormat
  labels: string[]
  createdAt: string
}

export interface CaptchaKey {
  id: string
  provider: string
  apiKey: string
  balance: number
  createdAt: string
}

export interface ProxyProvider {
  id: string
  name: string
  apiUrl: string
  apiKey: string
  protocol: 'http' | 'https' | 'socks5'
  refreshInterval: number
  lastSync: string | null
  labels: string[]
  createdAt: string
}

export type TaskStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'complete' | 'error'

export interface Task {
  id: string
  scriptFolder: string
  config: Record<string, unknown>
  status: TaskStatus
  workerId: string | null
  startedAt: string | null
  endedAt: string | null
  isSandbox: boolean
}

export type TaskLogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface TaskLog {
  id: number
  taskId: string
  timestamp: string
  level: TaskLogLevel
  message: string
}

export interface Template {
  id: string
  type: string
  name: string
  schema: Record<string, unknown>
  version: string
  isLocal: boolean
  updatedAt: string
}

export interface TaskTemplate {
  id: string
  name: string
  version: string
  description: string
  installPath: string
  manifest: Record<string, unknown>
  remoteUrl: string | null
  isInstalled: boolean
  downloadedAt: string
  updatedAt: string
}

export interface ScheduledTask {
  id: string
  templateId: string
  config: Record<string, unknown>
  cronExpression: string
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  createdAt: string
}

export type AirdropStatus = 'ongoing' | 'completed' | 'cancelled' | 'claimed'
export type AirdropProjectType = 'testnet' | 'mainnet' | 'galxe' | 'quest' | 'social' | 'other'

export interface AirdropLink {
  label: string
  url: string
}

export interface EligibilityCriterion {
  id: string
  description: string
  requirementType: string
  requirementValue: string
  required: boolean
  met: boolean
  notes: string
}

export type AirdropTaskStatus = 'pending' | 'inProgress' | 'completed' | 'skipped'

export interface AirdropTaskItem {
  id: string
  title: string
  description: string
  deadline?: string
  status: AirdropTaskStatus
  notes: string
}

export interface Earning {
  id: string
  token: string
  amount: number
  valueUsd?: number
  date: string
  notes: string
}

export interface AirdropProject {
  id: string
  name: string
  chain: string
  status: AirdropStatus
  projectType: AirdropProjectType
  description: string
  website: string
  scriptTemplateId?: string
  accountPool: string
  links: AirdropLink[]
  eligibilityCriteria: EligibilityCriterion[]
  tasks: AirdropTaskItem[]
  earnings: Earning[]
  tags: string[]
  labels: string[]
  createdAt: string
  updatedAt: string
}

export interface TokenEarnings {
  token: string
  totalAmount: number
  totalValueUsd: number
}

export interface UpcomingDeadline {
  taskId: string
  projectName: string
  taskTitle: string
  deadline: string
}

export interface AirdropAnalytics {
  totalAirdrops: number
  ongoingCount: number
  completedCount: number
  claimedCount: number
  totalEarningsValueUsd: number
  tokenEarnings: TokenEarnings[]
  upcomingDeadlines: UpcomingDeadline[]
}

export interface AppLog {
  id: number
  timestamp: string
  level: string
  category: string
  message: string
  fields: unknown
}

export interface ListResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface TaskTimelineEntry {
  date: string
  started: number
  completed: number
  failed: number
}

export interface RecentTaskResult {
  id: string
  scriptFolder: string
  status: string
  startedAt: string | null
  endedAt: string | null
  durationSecs: number | null
}

export interface TemplateUsage {
  templateName: string
  taskCount: number
}

export interface TemplateRanking {
  templateName: string
  taskCount: number
  successCount: number
  errorCount: number
  successRate: number | null
}

export interface WeeklyTrend {
  weekStart: string
  started: number
  completed: number
  failed: number
}

export interface StatsAggregate {
  walletTotal: number
  walletChainDistribution: Record<string, number>
  proxyTotal: number
  proxyProtocolDistribution: Record<string, number>
  proxyStatusDistribution: Record<string, number>
  accountTotal: number
  accountPoolDistribution: Record<string, number>
  taskTotal: number
  taskStatusDistribution: Record<string, number>
  taskSuccessRate: number | null
  taskCompletedCount: number
  taskErrorCount: number
  totalFinishedTasks: number
  averageTaskDurationSecs: number | null
  taskDurationDistribution: Record<string, number>
  taskTimeline: TaskTimelineEntry[]
  recentTaskResults: RecentTaskResult[]
  templateUsage: TemplateUsage[]
  templateRanking: TemplateRanking[]
  weeklyTrend: WeeklyTrend[]
  totalLogs: number
}

export interface AppInfo {
  version: string
  dataDir: string
  dbConnected: boolean
  dbError: string | null
  walletCount: number
  accountCount: number
  proxyCount: number
  taskCount: number
  runningTaskCount: number
}

export interface BackupInfo {
  filename: string
  size: number
  createdAt: string
}

export interface UpdateInfo {
  version: string
  notes: string
  pub_date: string
  target: string
}

export interface ApiError {
  message: string
  code?: string
  category?: string
}

export interface ApiResult<T = unknown> {
  data?: T
  error?: ApiError
}

export interface RemoteScript {
  id: string
  name: string
  version: string
  description: string
  schema: Record<string, unknown>
  entryPoint?: string
  checksum: string
  downloadUrl: string
  changelog?: string
  tags?: string[]
  downloads?: number
  visible: boolean
  createdBy?: string
  createdByName?: string
  reviewStatus?: string
  reviewComment?: string
  updatedAt: string
}

export interface RemoteTemplate {
  id: string
  name: string
  type: string
  version: string
  description: string
  schema: Record<string, unknown>
  checksum?: string
  downloadUrl: string | null
  downloads?: number
  downloadCount?: number
  visible: boolean
  createdBy?: string
  createdByName?: string
  reviewStatus?: string
  reviewComment?: string
  updatedAt: string
}

/** 脚本运行时权限 */
export interface PermissionSet {
  /** 允许发起网络请求 */
  network: boolean
  /** 允许读写脚本目录外的文件系统 */
  filesystem: boolean
}

export interface InstalledScript {
  id: string
  name: string
  version: string
  description: string
  entryPoint: string
  schema: Record<string, unknown>
  installPath: string
  checksum: string
  remoteUrl: string | null
  downloadedAt: string
  updatedAt: string
  /** 从 manifest.json 提取的运行时权限声明 */
  permissions: PermissionSet
}

export interface TaskOutput {
  taskId: string
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
}

export interface TaskLogBatch {
  taskId: string
  logs: Array<{ level: TaskLogLevel; message: string; timestamp: string }>
}

export interface TaskProgressUpdate {
  taskId: string
  percent: number
  message: string
}
