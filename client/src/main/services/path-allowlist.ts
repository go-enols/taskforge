/**
 * @file 会话级路径授权表
 * @description 主进程的特权文件操作（fs:* / zip:* / shell:openPath / server:upload 源文件）
 *              只允许访问「应用自有目录」与「用户本次会话通过原生对话框主动选择过的路径」。
 *
 *              安全背景：渲染层若被注入代码，原本可以调用 fs:readFile 读取任意文件、
 *              server:upload 把任意文件发到任意 URL、script:remove 删除任意目录。
 *              通过 path-allowlist 把这类能力收敛到用户显式选择过的路径。
 * @module main/services/path-allowlist
 */
import { app } from 'electron'
import { realpathSync, statSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { tmpdir } from 'os'

/** 用户通过对话框显式选择过的文件 / 目录（规范化绝对路径） */
const allowedPaths = new Set<string>()
const allowedDirs = new Set<string>()

/** 解析路径：存在则 realpath（消除符号链接），不存在则对父目录 realpath 后拼接 */
function normalizePath(input: unknown): string | null {
  if (typeof input !== 'string' || input.trim().length === 0) return null
  try {
    const abs = resolve(input)
    try {
      return realpathSync(abs)
    } catch {
      // 目标不存在（例如尚未创建的保存路径）：对存在的父目录做 realpath
      const parent = dirname(abs)
      const base = abs.slice(parent.length + 1)
      try {
        return join(realpathSync(parent), base)
      } catch {
        return abs
      }
    }
  } catch {
    return null
  }
}

/** 判断 target 是否等于 root 或位于 root 之下（都应是规范化后的绝对路径） */
function isUnder(root: string, target: string): boolean {
  if (!root) return false
  if (target === root) return true
  return target.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** 应用自有根目录：userData（含 scripts 子目录）与系统临时目录 */
function defaultRoots(): string[] {
  const roots: string[] = []
  try {
    roots.push(app.getPath('userData'))
    roots.push(join(app.getPath('userData'), 'scripts'))
  } catch {
    // app 尚未 ready（测试环境）时忽略
  }
  roots.push(tmpdir())
  return roots.map((r) => normalizePath(r)).filter((r): r is string => !!r)
}

/**
 * 授权一个用户通过原生对话框选择的文件/目录
 * @param p - 对话框返回的路径
 */
export function authorizePath(p: unknown): void {
  const norm = normalizePath(p)
  if (norm) allowedPaths.add(norm)
}

/**
 * 授权一个用户通过原生对话框选择的目录（其子路径均可访问）
 * @param p - 对话框返回的目录路径
 */
export function authorizeDir(p: unknown): void {
  const norm = normalizePath(p)
  if (norm) allowedDirs.add(norm)
}

/**
 * 判断路径是否允许被特权文件操作访问
 * @param p - 待校验路径
 * @returns 是否授权
 */
export function isPathAuthorized(p: unknown): boolean {
  const norm = normalizePath(p)
  if (!norm) return false
  if (defaultRoots().some((root) => isUnder(root, norm))) return true
  if (allowedPaths.has(norm)) return true
  for (const dir of allowedDirs) {
    if (isUnder(dir, norm)) return true
  }
  // 允许读取用户选择目录本身之外但通过 realpath 归一化的同目录文件
  return false
}

/**
 * 校验路径是否存在且为目录（供 zip:create 等使用，避免对文件当目录处理）
 * @param p - 待校验路径
 * @returns 是否存在且为目录
 */
export function isExistingDirectory(p: unknown): boolean {
  try {
    return typeof p === 'string' && statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 仅供测试使用：清空会话授权（生产代码不要调用） */
export function _resetPathAuthorizationsForTests(): void {
  allowedPaths.clear()
  allowedDirs.clear()
}
