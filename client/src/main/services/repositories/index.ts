/**
 * @file 数据仓库模块统一导出
 * @description 聚合所有 Repository 类，提供单一导入入口。
 *              import { WalletRepository, ProxyRepository, TaskRepository } from './repositories'
 * @module main/services/repositories
 */
export { BaseRepository } from './base'
export { WalletRepository } from './wallet'
export { ProxyRepository } from './proxy'
export { TaskRepository } from './task'
export { ScriptParamRepository } from './script-param'
export { TemplateRepository } from './template'
export { TaskTemplateRepository } from './task-template'
export { ScheduledTaskRepository } from './scheduled-task'
export { AirdropProjectRepository } from './airdrop-project'
export { CaptchaKeyRepository } from './captcha-key'
export { ProxyProviderRepository } from './proxy-provider'
export { AppLogRepository } from './app-log'
export { SettingsRepository } from './settings'
export { ProjectTemplateRepository } from './project-template'
