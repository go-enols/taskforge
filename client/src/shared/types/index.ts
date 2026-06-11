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
  /** 任务标题 */
  title: string
  /** 任务描述 */
  description: string
  /** 截止日期 */
  deadline?: string
  /** 完成状态 */
  status: AirdropTaskStatus
  /** 备注 */
  notes: string
}

/** 收益记录 */
export interface Earning {
  /** UUID */
  id: string
  /** 代币名称 */
  token: string
  /** 数量 */
  amount: number
  /** 美元估值（可选） */
  valueUsd?: number
  /** 收益日期 */
  date: string
  /** 备注 */
  notes: string
}

/** 空投项目完整数据 */
export interface AirdropProject {
  /** UUID */
  id: string
  /** 项目名称 */
  name: string
  /**
   * 所属链 — 已废弃, 保留仅为向后兼容旧数据。
   * 未来如需链信息, 应通过项目模板的自定义字段表达。
   * @deprecated 自 696858f 之后已从 UI 移除, 改用 templateId + customFields
   */
  chain: string
  /** 项目状态 */
  status: AirdropStatus
  /** 项目类型 */
  projectType: AirdropProjectType
  /** 描述（支持 Markdown） */
  description: string
  /** 官网 URL */
  website: string
  /** 关联的任务脚本模板 ID（可选） */
  scriptTemplateId?: string
  /** 关联的脚本参数池名称（DB 字段保留 account_pool 兼容历史数据） */
  accountPool: string
  /** 相关链接列表 */
  links: AirdropLink[]
  /** 资格条件列表 */
  eligibilityCriteria: EligibilityCriterion[]
  /** 空投任务列表 */
  tasks: AirdropTaskItem[]
  /** 收益记录列表 */
  earnings: Earning[]
  /** 分类标签 */
  tags: string[]
  /** 系统标签 */
  labels: string[]
  /** 使用的项目模板 ID（关联 project_templates 表，可选） */
  templateId?: string
  /** 模板驱动的自定义字段值（key=字段名, value=用户填的值） */
  customFields?: Record<string, unknown>
  /** ISO 8601 创建时间 */
  createdAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/**
 * 项目模板 — 用户可自定义的"项目结构定义"
 *
 * 设计目标: 让用户从模板创建项目, 模板里定义该类项目需要填的字段
 * (通过 JSON Schema 风格的字段数组), 项目存储时把字段值存到 AirdropProject.customFields。
 *
 * 跟 "templates" (账户模板) 表不冲突 — 那是脚本 schema, 这是项目 metadata schema。
 */
export interface ProjectTemplate {
  /** UUID */
  id: string
  /** 模板名称 (显示用) */
  name: string
  /** 模板描述 */
  description: string
  /** 图标 (lucide-react icon name, e.g. "Folder", "Briefcase") */
  icon: string
  /** 模板驱动字段 (按顺序渲染) */
  fields: ProjectTemplateField[]
  /** 是否内置模板 (内置不可删, 只能禁用) */
  builtIn: boolean
  /** 是否启用 (用户可禁用某个模板) */
  enabled: boolean
  /** 排序权重, 数字越小越靠前 */
  sortOrder: number
  /** ISO 8601 创建时间 */
  createdAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 代币收益汇总 */
export interface TokenEarnings {
  /** 代币名称 */
  token: string
  /** 总数量 */
  totalAmount: number
  /** 总美元估值 */
  totalValueUsd: number
}

/** 即将到来的截止日期 */
export interface UpcomingDeadline {
  /** 任务 ID */
  taskId: string
  /** 项目名称 */
  projectName: string
  /** 任务标题 */
  taskTitle: string
  /** 截止日期 */
  deadline: string
}

/** 空投分析统计数据 */
export interface AirdropAnalytics {
  /** 空投项目总数 */
  totalAirdrops: number
  /** 进行中的数量 */
  ongoingCount: number
  /** 已完成的数量 */
  completedCount: number
  /** 已领取的数量 */
  claimedCount: number
  /** 已取消的数量 */
  cancelledCount: number
  /** 总收益美元估值 */
  totalEarningsValueUsd: number
  /** 代币收益明细 */
  tokenEarnings: TokenEarnings[]
  /** 即将到来的截止日期 */
  upcomingDeadlines: UpcomingDeadline[]
}

/** 应用日志条目 */
export interface AppLog {
  /** 自增 ID */
  id: number
  /** ISO 8601 时间戳 */
  timestamp: string
  /** 日志级别 */
  level: string
  /** 分类 */
  category: string
  /** 日志内容 */
  message: string
  /** 附加字段 */
  fields: unknown
}

/** 分页响应数据结构 */
export interface ListResponse<T> {
  /** 当前页数据项 */
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
  /** 日期 */
  date: string
  /** 启动数量 */
  started: number
  /** 完成数量 */
  completed: number
  /** 失败数量 */
  failed: number
}

/** 最近任务执行结果 */
export interface RecentTaskResult {
  /** 任务 ID */
  id: string
  /** 脚本文件夹路径 */
  scriptFolder: string
  /** 任务状态 */
  status: string
  /** 启动时间 */
  startedAt: string | null
  /** 结束时间 */
  endedAt: string | null
  /** 持续时长（秒） */
  durationSecs: number | null
}

/** 模板使用统计 */
export interface TemplateUsage {
  /** 模板名称 */
  templateName: string
  /** 关联任务数量 */
  taskCount: number
}

/** 模板排名数据 */
export interface TemplateRanking {
  /** 模板名称 */
  templateName: string
  /** 任务总数 */
  taskCount: number
  /** 成功数量 */
  successCount: number
  /** 错误数量 */
  errorCount: number
  /** 成功率（百分比），无任务时为 null */
  successRate: number | null
}

/** 周趋势数据 */
export interface WeeklyTrend {
  /** 周起始日期 */
  weekStart: string
  /** 启动数量 */
  started: number
  /** 完成数量 */
  completed: number
  /** 失败数量 */
  failed: number
}

/** Dashboard 统计聚合数据 */
export interface StatsAggregate {
  /** 钱包总数 */
  walletTotal: number
  /** 各链钱包数量分布 */
  walletChainDistribution: Record<string, number>
  /** 代理总数 */
  proxyTotal: number
  /** 各协议代理数量分布 */
  proxyProtocolDistribution: Record<string, number>
  /** 各状态代理数量分布 */
  proxyStatusDistribution: Record<string, number>
  /** 脚本参数总数 */
  scriptParamTotal: number
  /** 各参数池数量分布 */
  scriptParamPoolDistribution: Record<string, number>
  /** 任务总数 */
  taskTotal: number
  /** 各状态任务数量分布 */
  taskStatusDistribution: Record<string, number>
  /** 任务成功率（百分比） */
  taskSuccessRate: number | null
  /** 已完成任务数 */
  taskCompletedCount: number
  /** 错误任务数 */
  taskErrorCount: number
  /** 已结束任务总数 */
  totalFinishedTasks: number
  /** 平均任务时长（秒） */
  averageTaskDurationSecs: number | null
  /** 任务时长分布 */
  taskDurationDistribution: Record<string, number>
  /** 任务时间线 */
  taskTimeline: TaskTimelineEntry[]
  /** 最近任务结果 */
  recentTaskResults: RecentTaskResult[]
  /** 模板使用统计 */
  templateUsage: TemplateUsage[]
  /** 模板排名 */
  templateRanking: TemplateRanking[]
  /** 周趋势 */
  weeklyTrend: WeeklyTrend[]
  /** 总日志数 */
  totalLogs: number
}

/** 应用信息 */
export interface AppInfo {
  /** 应用版本号 */
  version: string
  /** 数据目录路径 */
  dataDir: string
  /** 数据库是否已连接 */
  dbConnected: boolean
  /** 数据库错误信息 */
  dbError: string | null
  /** 钱包数量 */
  walletCount: number
  /** 脚本参数数量 */
  scriptParamCount: number
  /** 代理数量 */
  proxyCount: number
  /** 任务数量 */
  taskCount: number
  /** 总日志数 */
  totalLogs: number
}

/** 备份信息 */
export interface BackupInfo {
  /** 备份文件名 */
  filename: string
  /** 文件大小（字节） */
  size: number
  /** ISO 8601 创建时间 */
  createdAt: string
}

/** 应用更新信息 */
export interface UpdateInfo {
  /** 版本号 */
  version: string
  /** 更新说明 */
  notes: string
  /** 发布日期 */
  pub_date: string
  /** 下载目标 URL */
  target: string
}

/** API 错误信息 */
export interface ApiError {
  /** 错误描述 */
  message: string
  /** 错误代码 */
  code?: string
  /** 错误分类 */
  category?: string
}

/** 通用 API 响应包装 */
export interface ApiResult<T = unknown> {
  /** 响应数据（成功时存在） */
  data?: T
  /** 错误信息（失败时存在） */
  error?: ApiError
}

export interface AppInfo {
  version: string
  dataDir: string
  dbConnected: boolean
  dbError: string | null
  walletCount: number
  scriptParamCount: number
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

/** 服务端脚本元数据（从 Marketplace API 获取） */
export interface RemoteScript {
  /** 脚本 UUID */
  id: string
  /** 脚本名称 */
  name: string
  /** 版本号 */
  version: string
  /** 描述 */
  description: string
  /** 参数配置的 JSON Schema */
  schema: Record<string, unknown>
  /** 入口文件名 */
  entryPoint?: string
  /** SHA256 校验和 */
  checksum: string
  /** 下载 URL */
  downloadUrl: string
  /** 更新日志 */
  changelog?: string
  /** 分类标签 */
  tags?: string[]
  /** 下载次数 */
  downloads?: number
  /** 是否可见 */
  visible: boolean
  /** 创建者用户 ID */
  createdBy?: string
  /** 创建者显示名称 */
  createdByName?: string
  /** 审核状态 */
  reviewStatus?: string
  /** 审核评论 */
  reviewComment?: string
  /** 平均评分 */
  avgRating?: number
  /** 评分总数 */
  reviewCount?: number
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 脚本评分/评论 */
export interface ScriptReview {
  /** 评分 UUID */
  id: string
  /** 关联的脚本 ID */
  scriptId: string
  /** 评分用户 ID */
  userId: string
  /** 用户名（展示用） */
  username?: string
  /** 评分（1-5星） */
  rating: number
  /** 评论内容（可选） */
  comment?: string
  /** ISO 8601 创建时间 */
  createdAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 脚本评分统计 */
export interface RatingStats {
  /** 平均评分 */
  avgRating: number
  /** 评分总数 */
  count: number
  /** 各星级分布 */
  distribution: {
    stars5: number
    stars4: number
    stars3: number
    stars2: number
    stars1: number
  }
}

/** 服务端模板元数据（从 Marketplace API 获取） */
export interface RemoteTemplate {
  /** 模板 UUID */
  id: string
  /** 模板名称 */
  name: string
  /** 模板类型 */
  type: string
  /** 版本号 */
  version: string
  /** 描述 */
  description: string
  /** JSON Schema 定义的数据结构 */
  schema: Record<string, unknown>
  /** SHA256 校验和 */
  checksum?: string
  /** 下载 URL */
  downloadUrl: string | null
  /** 下载次数 */
  downloads?: number
  /** 下载次数字段（兼容） */
  downloadCount?: number
  /** 是否可见 */
  visible: boolean
  /** 创建者用户 ID */
  createdBy?: string
  /** 创建者显示名称 */
  createdByName?: string
  /** 审核状态 */
  reviewStatus?: string
  /** 审核评论 */
  reviewComment?: string
  /** ISO 8601 更新时间 */
  updatedAt: string
}

/** 脚本运行时权限 */
export interface PermissionSet {
  /** 允许发起网络请求 */
  network: boolean
  /** 允许读写脚本目录外的文件系统 */
  filesystem: boolean
}

/** 已安装到本地的脚本信息 */
export interface InstalledScript {
  /** 脚本 UUID */
  id: string
  /** 脚本名称 */
  name: string
  /** 版本号 */
  version: string
  /** 描述 */
  description: string
  /** 入口文件名 */
  entryPoint: string
  /** 参数配置的 JSON Schema */
  schema: Record<string, unknown>
  /** 安装路径 */
  installPath: string
  /** SHA256 校验和 */
  checksum: string
  /** 远程服务器 URL */
  remoteUrl: string | null
  /** ISO 8601 下载时间 */
  downloadedAt: string
  /** ISO 8601 更新时间 */
  updatedAt: string
  /** 从 manifest.json 提取的运行时权限声明 */
  permissions: PermissionSet
  /**
   * manifest.json 声明的 requiredAccountTemplateIds 中, 本地尚未下载的账户模板 ID 列表
   * 仅在 downloadScript 后由 ScriptFetcher 软检查附加, 用于 UI 提示用户去 Marketplace 下载
   * 缺省 undefined 表示脚本不需要任何账户模板, 或所有依赖已就绪
   */
  missingAccountTemplates?: string[]
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
