/**
 * @file zipExtractor — 纯 JS zip 解压器（无外部命令依赖）
 * @description 使用 adm-zip 纯 JS 库完成 zip 解压，跨平台一致行为。
 *              替代之前的 PowerShell Expand-Archive / 系统 unzip 命令调用。
 * @module main/utils
 */
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { isAbsolute, resolve, sep } from 'path'
import { createLogger } from './logger'

const logger = createLogger('zipExtractor')

/**
 * 检查 archivePath 是否位于 destDir 之内（含等于 destDir 本身的情形）。
 *
 * 用途：判断是否需要在解压前清空 destDir。如果源压缩包就在目标目录里，
 *       清空操作会误删源文件，导致 adm-zip 报 "Invalid filename"。
 *
 * @param archivePath zip 包路径（相对或绝对）
 * @param destDir 目标目录（相对或绝对）
 * @returns true 当 archivePath 位于 destDir 之内或等于 destDir
 */
function isArchiveInsideDestDir(archivePath: string, destDir: string): boolean {
  const resolvedArchive = isAbsolute(archivePath) ? archivePath : resolve(archivePath)
  const resolvedDest = isAbsolute(destDir) ? destDir : resolve(destDir)
  // Ensure dest ends with separator so that prefix matching is exact
  // (e.g. /a/bc must NOT be considered inside /a/b).
  const destWithSep = resolvedDest.endsWith(sep) ? resolvedDest : resolvedDest + sep
  if (resolvedArchive === resolvedDest) return true
  return resolvedArchive.startsWith(destWithSep)
}

/**
 * 解压 zip 到目标目录（纯 JS，无外部命令）。
 *
 * - 已存在目录会被清空后重建
 * - 解压失败时抛 Error，调用方决定是否清理
 *
 * 安全保证：当源压缩包路径位于目标目录之内时（典型场景：script-fetcher 先把
 * zip 下载到脚本目录内的 download.tmp，再调用 extractZip 解压到同一目录），
 * 跳过 destDir 的清空操作，避免误删源文件。
 *
 * @param archivePath zip 包绝对路径
 * @param destDir 目标目录（不存在会自动创建）
 * @throws 解压失败时抛 Error
 */
export function extractZip(archivePath: string, destDir: string): void {
  if (!existsSync(archivePath)) {
    throw new Error(`zip 文件不存在: ${archivePath}`)
  }

  const archiveInsideDest = isArchiveInsideDestDir(archivePath, destDir)

  if (!archiveInsideDest) {
    // 源文件在目标目录之外 → 正常清空目标目录（去除旧文件残留）
    try {
      rmSync(destDir, { recursive: true, force: true })
    } catch (err) {
      logger.warn('zipExtractor: 清空目标目录失败', { destDir, err: String(err) })
    }
  } else {
    // 源文件位于目标目录之内 → 不清空 destDir，避免误删源压缩包。
    logger.debug('zipExtractor: 源文件位于目标目录内，跳过清空', { archivePath, destDir })
  }
  mkdirSync(destDir, { recursive: true })

  // 防御性二次校验：源文件如果在目录操作过程中被外部因素删除（例如 AV 扫描、
  // 并发任务），给出明确错误信息，而不是误导性的 "ADM-ZIP: Invalid filename"。
  if (!existsSync(archivePath)) {
    throw new Error(
      `zip 文件在解压准备阶段丢失: ${archivePath} ` +
        `(archivePath 与 destDir=${destDir} 关系: ${archiveInsideDest ? 'archive inside dest' : 'archive outside dest'})`
    )
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(archivePath)
  } catch (err) {
    throw new Error(`读取 zip 失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    zip.extractAllTo(destDir, /* overwrite */ true)
  } catch (err) {
    throw new Error(`解压 zip 失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 解压成功后再清理源压缩包（仅当它位于 destDir 之内）。
  // 此时已经成功解压，删除是安全的。这避免 caller 留下垃圾 download.tmp。
  if (archiveInsideDest && archivePath !== destDir && existsSync(archivePath)) {
    try {
      rmSync(archivePath, { force: true })
      logger.debug('zipExtractor: 已清理源压缩包', { archivePath })
    } catch (err) {
      logger.warn('zipExtractor: 清理源压缩包失败', { archivePath, err: String(err) })
    }
  }
}

/**
 * 从 zip 中读取单个文件内容（不解压整个 zip）。
 *
 * 常用于从脚本 zip 中快速提取 manifest.json 以做预检。
 *
 * @param archivePath zip 包绝对路径
 * @param entryName zip 内的相对路径（如 "manifest.json"）
 * @returns 文件内容字符串，找不到返回 null
 */
export function readZipEntry(archivePath: string, entryName: string): string | null {
  if (!existsSync(archivePath)) {
    throw new Error(`zip 文件不存在: ${archivePath}`)
  }
  let zip: AdmZip
  try {
    zip = new AdmZip(archivePath)
  } catch (err) {
    throw new Error(`读取 zip 失败: ${err instanceof Error ? err.message : String(err)}`)
  }
  const entry = zip.getEntry(entryName)
  if (!entry) return null
  return entry.getData().toString('utf-8')
}