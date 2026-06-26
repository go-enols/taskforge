/**
 * @file 共享 TypeScript 类型定义
 * @description 定义客户端与服务端共享的所有数据接口，包括钱包、脚本参数、代理、任务、空投项目等。
 * @module shared/types
 */

/** 钱包数据：支持 EVM、Solana、SUI 和 Bitcoin 链 */
export interface Wallet {
  /** 钱包 UUID */
  id: string
  /** 钱包地址（EVM: 0x... / Solana: base58 编码） */
  address: string
  /** 加密存储的私钥（可为空） */
  privateKey: string | null
  /** 助记词（可为空，用于 HD 钱包派生） */
  mnemonic: string | null
  /** 钱包类型 */
  walletType: 'evm' | 'solana' | 'sui' | 'bitcoin'
  /** 标签数组，用于分类筛选 */
  labels: string[]
  /** ISO 8601 创建时间 */
  createdAt: string
}

/** 脚本参数池中的条目（关联模板，由模板 schema 定义结构，作为任务脚本的输入参数） */
export interface ScriptParam {
  /** 脚本参数 UUID */
  id: string
  /** 关联的模板 ID */
  templateId: string
  /** 参数数据（由模板 schema 定义字段结构） */
  data: Record<string, unknown>
  /** 参数池名称（分组标识） */
  pool: string
  /** 标签数组 */
  labels: string[]
  /** 备注 */
  notes: string
  /** ISO 8601 创建时间 */
  createdAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

// ============================================================
// 通用数据需求系统 — 替代 requiredAccountTemplateIds
// ============================================================

/** 数据源类型：决定任务创建时从哪个表查询数据 */
export type DataSource = 'wallet' | 'proxy' | 'script_param'

/** 数据需求声明：开发者在 manifest 中声明脚本需要何种模板数据 */
export interface DataRequirement {
  /** 运行时注入的环境变量 key（如 wallets → TASK_DATA_WALLETS） */
  key: string
  /** 用户界面显示名称 */
  label: string
  /** 匹配 templates.type 字段，决定系统从哪个数据表查询 */
  templateType: string
  /** 最少需要选择几条数据 */
  min: number
  /** 最多可选几条数据（-1 表示无上限） */
  max: number
  /** 数据来源路由：wallet → wallets 表, proxy → proxies 表, script_param → script_params 表 */
  source: DataSource
  /** 用途说明，显示在选择面板中帮助用户理解 */
  description?: string
}

/** 代理格式类型 */
export type ProxyFormat = 'manual' | 'api' | 'ip' | 'ws'

/** 代理配置 */
export interface Proxy {
  /** 代理 UUID */
  id: string
  /** 代理协议 */
  protocol: 'http' | 'https' | 'socks5' | 'ws'
  /** 主机地址 */
  host: string
  /** 端口 */
  port: number
  /** 用户名（可为空） */
  username: string | null
  /** 密码（可为空） */
  password: string | null
  /** 代理状态 */
  status: 'active' | 'inactive' | 'expired'
  /** 代理格式类型 */
  format: ProxyFormat
  /** 标签数组 */
  labels: string[]
  /** ISO 8601 创建时间 */
  createdAt: string
}

/** 验证码 API 密钥配置 */
export interface CaptchaKey {
  /** UUID */
  id: string
  /** 验证码服务提供商名称 */
  provider: string
  /** API 密钥 */
  apiKey: string
  /** 账户余额 */
  balance: number
  /** ISO 8601 创建时间 */
  createdAt: string
}

/** 代理提供商配置（从 API 自动拉取代理） */
export interface ProxyProvider {
  /** UUID */
  id: string
  /** 提供商名称 */
  name: string
  /** API 地址 */
  apiUrl: string
  /** API 密钥 */
  apiKey: string
  /** 代理协议 */
  protocol: 'http' | 'https' | 'socks5'
  /** 刷新间隔（秒） */
  refreshInterval: number
  /** 最后同步时间 */
  lastSync: string | null
  /** 标签数组 */
  labels: string[]
  /** ISO 8601 创建时间 */
  createdAt: string
}

/** 任务状态枚举 */
export type TaskStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'complete' | 'error'

/** 任务实例（关联脚本文件夹，包含运行时状态） */
export interface Task {
  /** 任务 UUID */
  id: string
  /** 已安装脚本的文件夹路径 */
  scriptFolder: string
  /** 任务配置（由脚本 manifest 定义字段结构） */
  config: Record<string, unknown>
  /** 当前状态 */
  status: TaskStatus
  /** 子进程 worker ID（运行中时非空） */
  workerId: string | null
  /** 启动时间 */
  startedAt: string | null
  /** 结束时间 */
  endedAt: string | null
  /** 是否沙箱模式（权限受限） */
  isSandbox: boolean
}

/** 任务日志级别 */
export type TaskLogLevel = 'info' | 'warn' | 'error' | 'debug'

/** 任务日志条目 */
export interface TaskLog {
  /** 自增 ID */
  id: number
  /** 关联任务 ID */
  taskId: string
  /** ISO 8601 时间戳 */
  timestamp: string
  /** 日志级别 */
  level: TaskLogLevel
  /** 日志内容 */
  message: string
}

/** 账户模板（定义账户数据结构） */
export interface Template {
  /** 模板 UUID */
  id: string
  /** 模板类型（如 evm-wallet, solana-wallet） */
  type: string
  /** 模板名称 */
  name: string
  /** JSON Schema 定义的数据字段结构 */
  schema: Record<string, unknown>
  /** 版本号 */
  version: string
  /** 是否本地模板（false=远程下载, true=本地创建） */
  isLocal: boolean
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 已安装的任务脚本模板元数据 */
export interface TaskTemplate {
  /** 脚本 ID（与 InstalledScript.id 相同） */
  id: string
  /** 脚本名称 */
  name: string
  /** 版本号 */
  version: string
  /** 描述 */
  description: string
  /** 安装路径 */
  installPath: string
  /** 脚本 manifest.json 内容 */
  manifest: Record<string, unknown>
  /** 远程服务器 URL */
  remoteUrl: string | null
  /** 是否已安装 */
  isInstalled: boolean
  /** ISO 8601 下载时间 */
  downloadedAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 定时任务配置 */
export interface ScheduledTask {
  /** UUID */
  id: string
  /** 关联的任务脚本模板 ID */
  templateId: string
  /** 任务配置 */
  config: Record<string, unknown>
  /** Cron 表达式 */
  cronExpression: string
  /** 是否启用 */
  enabled: boolean
  /** 最后运行时间 */
  lastRun: string | null
  /** 下次运行时间 */
  nextRun: string | null
  /** ISO 8601 创建时间 */
  createdAt: string
}

/** 空投项目状态 */
export type AirdropStatus = 'ongoing' | 'completed' | 'cancelled' | 'claimed'
/** 空投项目类型 */
export type AirdropProjectType = 'testnet' | 'mainnet' | 'galxe' | 'quest' | 'social' | 'other'

/**
 * 项目模板字段定义 (JSON Schema 子集)
 *
 * 支持的属性 (简化版, 不依赖完整 JSON Schema 校验库):
 * - type: 'string' | 'number' | 'boolean' | 'select'
 * - title: 字段显示名
 * - required: 是否必填
 * - default: 默认值
 * - options: select 专用, 选项数组
 * - placeholder: 输入提示
 */
export interface ProjectTemplateField {
  /** 字段名 (英文, 作为 customFields 对象的 key) */
  name: string
  /** 字段显示名 (中文 / i18n key) */
  title: string
  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'select'
  /** 是否必填 */
  required?: boolean
  /** 默认值 */
  default?: string | number | boolean
  /** select 专用: 选项列表 */
  options?: Array<{ label: string; value: string }>
  /** 输入提示 */
  placeholder?: string
  /** 帮助说明 (悬浮提示) */
  description?: string
}

/** 空投链接（标签 + URL） */
export interface AirdropLink {
  /** 链接标签 */
  label: string
  /** 链接地址 */
  url: string
}

/** 资格条件 */
export interface EligibilityCriterion {
  /** UUID */
  id: string
  /** 条件描述 */
  description: string
  /** 要求类型 */
  requirementType: string
  /** 要求值 */
  requirementValue: string
  /** 是否必须满足 */
  required: boolean
  /** 是否已满足 */
  met: boolean
  /** 备注 */
  notes: string
}

/** 空投任务项状态 */
export type AirdropTaskStatus = 'pending' | 'inProgress' | 'completed' | 'skipped'

/** 空投任务项 */
export interface AirdropTaskItem {
  /** UUID */
  id: string
  /** 任务名称 */
  name: string
  /** 任务标题（兼容旧引用） */
  title?: string
  /** 任务类型 */
  type: string
  /** 任务描述 */
  description: string
  /** 任务链接 */
  link: string
  /** 当前状态 */
  status: AirdropTaskStatus
  /** 截止日期 */
  deadline: string | null
  /** 备注 */
  notes: string
}

/** 收益记录 */
export interface Earning {
  /** UUID */
  id: string
  /** 收益来源 */
  source: string
  /** 代币符号（如 ETH, USDT） */
  symbol: string
  /** 代币符号（兼容旧引用） */
  token?: string
  /** 代币数量 */
  amount: number
  /** 美元估值 */
  usdValue: number
  /** 美元估值（兼容旧引用） */
  valueUsd?: number
  /** 收益日期 */
  date: string
  /** 交易哈希 */
  txHash: string | null
  /** 备注 */
  notes: string
}

/** 空投项目完整数据 */
export interface AirdropProject {
  /** 项目 UUID */
  id: string
  /** 项目名称 */
  name: string
  /** 所属链（已废弃，保留仅向后兼容） */
  chain: string
  /** 当前状态 */
  status: AirdropStatus
  /** 项目类型 */
  projectType: AirdropProjectType
  /** 项目描述（支持 Markdown） */
  description: string
  /** 官网 URL */
  website: string
  /** 关联的任务脚本模板 ID（可空） */
  scriptTemplateId: string | null
  /** 关联的参数池名称（可空，字段名保留兼容历史数据） */
  accountPool: string | null
  /** 关联的项目模板 ID（可空） */
  templateId: string | null
  /** 项目模板驱动的自定义字段值（key=字段名，value=输入值） */
  customFields: Record<string, unknown>
  /** 链接数组 */
  links: AirdropLink[]
  /** 资格条件数组 */
  eligibilityCriteria: EligibilityCriterion[]
  /** 空投任务项数组 */
  tasks: AirdropTaskItem[]
  /** 收益数组 */
  earnings: Earning[]
  /** 标签数组 */
  tags: string[]
  /** 标签数组（冗余，用于 UI 筛选） */
  labels: string[]
  /** ISO 8601 创建时间 */
  createdAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/**
 * 项目模板 — 用户可自定义的"项目结构定义"
 *
 * 不同于账户模板（templates 表，由 JSON Schema 定义脚本参数的数据结构），
 * 项目模板定义空投项目的 metadata 表单字段。
 * 不含文件包，由 AirdropProject.templateId 和 customFields 消费。
 */
export interface ProjectTemplate {
  /** 模板 UUID（内置模板用 built-in:* 前缀） */
  id: string
  /** 模板名称（显示用） */
  name: string
  /** 模板描述 */
  description: string
  /** 图标（lucide-react icon name，默认 Folder） */
  icon: string
  /** 字段数组（按顺序渲染） */
  fields: ProjectTemplateField[]
  /** 是否内置模板（true=内置不可删，false=用户创建） */
  builtIn: boolean
  /** 是否启用 */
  enabled: boolean
  /** 排序权重（数字越小越靠前，默认 100） */
  sortOrder: number
  /** ISO 8601 创建时间 */
  createdAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 市场（服务端）返回的项目模板 */
export interface RemoteProjectTemplate {
  id: string
  name: string
  description: string
  icon: string
  fields: ProjectTemplateField[]
  builtIn: boolean
  enabled: boolean
  sortOrder: number
  visible: boolean
  reviewStatus: string
  reviewComment: string | null
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  downloadCount?: number
}

/** 代币收益汇总 */
export interface TokenEarnings {
  symbol: string
  /** 代币符号（兼容旧引用） */
  token?: string
  totalAmount: number
  totalUsdValue: number
  /** 美元总值（兼容旧引用） */
  totalValueUsd?: number
}

/** 即将到来的截止日期 */
export interface UpcomingDeadline {
  projectName: string
  taskName: string
  /** 任务标题（兼容旧引用） */
  taskTitle?: string
  deadline: string
  daysRemaining?: number
}

/** 空投分析统计数据 */
export interface AirdropAnalytics {
  totalAirdrops?: number
  ongoingCount?: number
  completedCount?: number
  claimedCount?: number
  cancelledCount?: number
  totalEarningsValueUsd?: number
  totalProjects?: number
  activeProjects?: number
  tokenEarnings?: TokenEarnings[]
  upcomingDeadlines?: UpcomingDeadline[]
  projectsByStatus?: Record<string, number>
  projectsByType?: Record<string, number>
  totalEarningsUsd?: number
}

/** 应用日志条目 */
export interface AppLog {
  id: number
  timestamp: string
  level: string
  category: string
  message: string
  fields: string | null
}

/** 分页响应数据结构 */
export interface ListResponse<T> {
  /** 当前页数据 */
  items: T[]
  /** 数据总数 */
  total: number
  /** 当前页码 */
  page: number
  /** 每页大小 */
  pageSize: number
  /** 总页数 */
  totalPages: number
}

/** 任务时间线条目 */
export interface TaskTimelineEntry {
  date?: string
  count?: number
  successRate?: number
  started?: number
  completed?: number
  failed?: number
}

/** 最近任务执行结果 */
export interface RecentTaskResult {
  taskId?: string
  taskName?: string
  templateId?: string
  status?: string
  exitCode?: number | null
  durationMs?: number
  startedAt?: string | null
  id?: string
  scriptFolder?: string
  durationSecs?: number | null
  endedAt?: string | null
}

/** 模板使用统计 */
export interface TemplateUsage {
  id?: string
  name?: string
  description?: string
  taskCount: number
  avgDurationMs?: number
  successRate?: number
}

/** 模板排名数据 */
export interface TemplateRanking {
  id?: string
  name?: string
  description?: string
  taskCount: number
  avgDurationMs?: number
  successRate?: number
  lastUsedAt?: string
  templateName?: string
  successCount?: number
  errorCount?: number
}

/** 周趋势数据 */
export interface WeeklyTrend {
  date?: string
  taskCount?: number
  successCount?: number
  failCount?: number
  avgDurationMs?: number
  weekStart?: string
  started?: number
  completed?: number
  failed?: number
}

/** Dashboard 统计聚合数据 */
export interface StatsAggregate {
  totalWallets?: number
  walletTotal?: number
  walletChainDistribution?: Record<string, number>
  totalProxies?: number
  proxyTotal?: number
  proxyProtocolDistribution?: Record<string, number>
  proxyStatusDistribution?: Record<string, number>
  totalScriptParams?: number
  scriptParamTotal?: number
  scriptParamPoolDistribution?: Record<string, number>
  totalTasks?: number
  taskTotal?: number
  taskStatusDistribution?: Record<string, number>
  taskSuccessRate?: number
  taskCompletedCount?: number
  taskErrorCount?: number
  totalFinishedTasks?: number
  averageTaskDurationSecs?: number
  avgTaskDurationMs?: number
  taskDurationDistribution?: Record<string, number>
  totalAirdrops?: number
  tasksByStatus?: Record<string, number>
  tasksByTemplate?: Record<string, number>
  recentTaskResults?: RecentTaskResult[]
  taskTimeline?: TaskTimelineEntry[]
  templateUsage?: TemplateUsage[]
  templateRanking?: TemplateRanking[]
  weeklyTrend?: WeeklyTrend[]
  runningTaskCount?: number
  totalLogs?: number
}

/** 应用信息 */
export interface AppInfo {
  version?: string
  dataDir?: string
  dbConnected?: boolean
  dbError?: string | null
  folders?: Record<string, string>
  walletCount: number
  scriptParamCount: number
  proxyCount: number
  taskCount: number
  appLogCount?: number
  totalLogs: number
  runningTaskCount?: number
}

/** 备份信息 */
export interface BackupInfo {
  filePath: string
  fileSize: number
  createdAt: string
}

/** 应用更新信息 */
export interface UpdateInfo {
  canUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseNotes: string
  downloadProgress: number
}

/** API 错误信息 */
export interface ApiError {
  code?: string
  message: string
  details?: unknown
}

/** 通用 API 响应包装 */
export interface ApiResult<T = unknown> {
  data?: T
  error?: ApiError
}

/** 服务端脚本元数据（从 Marketplace API 获取） */
export interface RemoteScript {
  id: string
  name: string
  version: string
  description: string
  schema: Record<string, unknown>
  entryPoint: string
  checksum: string
  filePath: string
  downloadUrl: string
  tags: string[]
  changelog: string
  downloads: number
  visible: boolean
  createdBy: string
  createdByName: string
  reviewStatus: string
  reviewComment: string | null
  avgRating: number
  reviewCount: number
  createdAt: string
  updatedAt: string
  downloadCount?: number
}

/** 脚本版本历史记录 */
export interface ScriptVersion {
  id: string
  scriptId: string
  version: string
  changelog: string
  checksum: string
  filePath: string
  schema: Record<string, unknown>
  createdBy: string
  createdAt: string
}

/** 脚本评分/评论 */
export interface ScriptReview {
  id: number
  scriptId: string
  userId: string
  username: string
  rating: number
  comment: string | null
  createdAt: string
}

/** 脚本评分统计 */
export interface RatingStats {
  avgRating: number
  totalReviews: number
  distribution: Record<number, number>
}

/** 服务端模板元数据（从 Marketplace API 获取） */
export interface RemoteTemplate {
  id: string
  type: string
  name: string
  schema: Record<string, unknown>
  version: string
  description: string | null
  checksum: string
  filePath: string
  downloadUrl: string
  visible: boolean
  createdBy: string
  createdByName: string
  reviewStatus: string
  reviewComment: string | null
  downloads: number
  tags: string[]
  createdAt: string
  updatedAt: string
  downloadCount?: number
}

/** 脚本运行时权限 */
export interface PermissionSet {
  network: boolean
  filesystem: boolean
}

/** 已安装到本地的脚本信息 */
export interface InstalledScript {
  id: string
  name: string
  version: string
  description: string
  installPath: string
  entryPoint: string
  remoteUrl: string | null
  manifest: Record<string, unknown>
  tags: string[]
  isInstalled: boolean
  permissions: PermissionSet
  missingAccountTemplates?: string[]
  schema?: Record<string, unknown>
  checksum?: string
  downloadedAt?: string
  updatedAt?: string
}

/** 数据快照 — 脚本发来的结构化数据（key 唯一，按 key 覆盖更新） */
export interface DataSnapshot {
  /** 唯一标识，同 key 后发覆盖前发 */
  key: string
  /** 可选 UI 展示名 */
  label?: string
  /** 视图建议：table / kv / json / card / auto（auto 由前端按数据形状自选） */
  view: 'table' | 'kv' | 'json' | 'card' | 'auto'
  /** 任意可序列化值 */
  data: unknown
  /** 毫秒时间戳 */
  updatedAt: number
}

/** 任务执行输出 */
export interface TaskOutput {
  /** 任务 UUID */
  taskId: string
  /** 退出码（null 表示未正常退出） */
  exitCode: number | null
  /** 标准输出内容 */
  stdout: string
  /** 标准错误内容 */
  stderr: string
  /** 执行时长（毫秒） */
  durationMs: number
  /** 任务运行期间累计的结构化数据快照集合（按 key 去重，最后一次写入为准） */
  dataSnapshots: DataSnapshot[]
}

/** 任务日志批量数据 */
export interface TaskLogBatch {
  /** 任务 UUID */
  taskId: string
  /** 日志条目数组 */
  logs: Array<{ level: TaskLogLevel; message: string; timestamp: string }>
}

/** 任务进度更新通知 */
export interface TaskProgressUpdate {
  /** 任务 UUID */
  taskId: string
  /** 进度百分比（0-100） */
  percent: number
  /** 进度描述信息 */
  message: string
}
