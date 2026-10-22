/**
 * @file 任务配置 → 子进程环境变量
 * @description 把 `task.config`（由脚本 manifest 的 JSON Schema 生成，属于不可信输入）
 *              转换为任务子进程的 `TASK_*` 环境变量，并过滤掉系统关键变量与主进程
 *              内部保留键。
 *
 *              安全背景：config 的键名完全由脚本作者控制。若不设黑名单，脚本可在
 *              manifest schema 里声明 `perm_bypass: {default: "1"}`，任务创建时该默认值
 *              自动进入 config，进而映射为 `TASK_PERM_BYPASS=1`，让 sandbox-enforcer
 *              跳过全部 patch；`cwd_resolved` 同理可把文件系统白名单放宽到全盘。
 * @module main/services/task-env
 */

/** 系统关键环境变量：只能由主进程从父进程继承，绝不可被 task.config 覆盖 */
export const SYSTEM_PROTECTED_KEYS: ReadonlySet<string> = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'TEMP',
  'TMP',
  'SHELL',
  'USER',
  'LOGNAME',
  'LANG',
  'TERM',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'DYLD_LIBRARY_PATH',
  'PYTHONPATH',
  'CLASSPATH'
])

/**
 * 主进程内部保留键：config 不得映射为对应的 TASK_* 变量。
 * 这些变量由 TaskService 在 config 映射之后以可信值写入（或完全不允许外部控制）。
 */
export const RESERVED_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'PERM_BYPASS',
  'CWD_RESOLVED',
  'PERM_NETWORK',
  'PERM_FILESYSTEM',
  'SANDBOX',
  'CONFIG',
  'ID',
  'ARGS',
  'COMMAND'
])

/**
 * 把可信度较低的 task.config 转换为 TASK_* 环境变量
 *
 * 规则：
 * - 跳过 `args` / `_command` / `_data_*`（内部字段）
 * - 跳过系统关键变量（PATH/HOME/...）
 * - 跳过主进程保留键（PERM_BYPASS/CWD_RESOLVED/...）
 * - 对象值序列化为 JSON，其余值转字符串
 *
 * @param config - 任务配置对象
 * @returns 可安全注入子进程的环境变量集合
 */
export function buildTaskConfigEnv(config: Record<string, unknown>): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) continue
    if (key === 'args' || key === '_command') continue
    if (key.startsWith('_data_')) continue

    const upperKey = key.toUpperCase()
    if (SYSTEM_PROTECTED_KEYS.has(upperKey)) continue
    if (RESERVED_CONFIG_KEYS.has(upperKey)) continue

    env[`TASK_${upperKey}`] = typeof value === 'object' ? JSON.stringify(value) : String(value)
  }

  return env
}
