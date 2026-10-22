/**
 * @file 脚本入口解析与校验
 * @description 把远端 manifest / 本地 meta.json 中的 `entryPoint` 解析为脚本目录内的
 *              绝对路径，并强制限制为 Node 脚本扩展名。
 *
 *              安全背景：脚本包来自市场（可被任意 developer 上传），若直接
 *              `join(scriptRoot, manifest.entryPoint)`，`../../x.exe` 或绝对路径可以
 *              让主进程 spawn 任意可执行文件，绕过 NODE_OPTIONS 载入的 sandbox-enforcer。
 *              因此入口必须同时满足：
 *              1. 解析后位于脚本目录内（前缀 + 分隔符校验）；
 *              2. 扩展名只能是 .js / .cjs / .mjs（始终用 `node` 解释，禁止直接执行二进制）。
 * @module main/services/script-entry
 */
import { extname, resolve, sep } from 'path'

/** 允许作为脚本入口的 Node 脚本扩展名（小写，含点） */
export const NODE_ENTRY_EXTENSIONS: ReadonlySet<string> = new Set(['.js', '.cjs', '.mjs'])

/** manifest/meta 未声明 entryPoint 时的默认入口文件名 */
export const DEFAULT_ENTRY_POINT = 'index.js'

/**
 * 断言给定文件路径是允许的 Node 脚本扩展名
 * @param filePath - 待校验的文件路径
 * @throws 当扩展名不在白名单内时抛出异常
 */
export function assertNodeEntryExtension(filePath: string): void {
  const ext = extname(filePath).toLowerCase()
  if (!NODE_ENTRY_EXTENSIONS.has(ext)) {
    throw new Error(
      `Invalid script entryPoint extension "${ext || '(none)'}": only ${[...NODE_ENTRY_EXTENSIONS].join(' / ')} are allowed (got: ${filePath})`
    )
  }
}

/**
 * 将 manifest/meta 中的 entryPoint 解析为脚本目录内的绝对路径
 *
 * @param scriptRoot - 脚本安装目录的绝对路径
 * @param rawEntry   - manifest.entryPoint 原始值（不可信输入，任意类型）
 * @returns 位于脚本目录内、扩展名受白名单约束的绝对路径
 * @throws 当入口越出脚本目录或扩展名非法时抛出异常
 */
export function resolveScriptEntryPoint(scriptRoot: string, rawEntry: unknown): string {
  const root = resolve(scriptRoot)
  const relativeEntry =
    typeof rawEntry === 'string' && rawEntry.trim().length > 0
      ? rawEntry.trim()
      : DEFAULT_ENTRY_POINT

  const entry = resolve(root, relativeEntry)

  // 包含性校验：entry 必须等于 root 或位于 root 之下。注意必须带 path.sep，
  // 否则 /scripts/foo 会错误放行 /scripts/foobar/evil.js。
  if (entry !== root && !entry.startsWith(root + sep)) {
    throw new Error(
      `Invalid script entryPoint "${relativeEntry}": resolves outside the script directory (${entry})`
    )
  }

  assertNodeEntryExtension(entry)
  return entry
}
