/**
 * @file 前端类型定义
 * @description 重新导出共享类型定义文件中的所有类型，供渲染进程使用。
 *              所有类型定义位于 client/src/shared/types/index.ts。
 * @module renderer/types
 */

export type {
  Wallet,
  Account,
  Proxy,
  ProxyFormat,
  CaptchaKey,
  ProxyProvider,
  Task,
  TaskLog,
  Template,
  TaskTemplate,
  ScheduledTask,
  AirdropProject,
  AirdropLink,
  EligibilityCriterion,
  AirdropTaskItem,
  Earning,
  TokenEarnings,
  UpcomingDeadline,
  AirdropAnalytics,
  AppLog,
  ListResponse,
  StatsAggregate,
  AppInfo,
  BackupInfo,
  UpdateInfo,
  AirdropStatus,
  AirdropProjectType,
  AirdropTaskStatus,
  RemoteScript,
  InstalledScript,
  RemoteTemplate,
  ScriptReview,
  RatingStats,
  TaskOutput,
  TaskLogBatch,
  TaskProgressUpdate,
  ProjectTemplate,
  ProjectTemplateField
} from '../../../shared/types'
