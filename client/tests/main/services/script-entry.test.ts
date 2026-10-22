/**
 * @file 脚本入口解析测试
 * @description 验证 resolveScriptEntryPoint / assertNodeEntryExtension 的安全约束：
 *              入口必须位于脚本目录内，且只能是 Node 脚本扩展名。
 *              回归背景：远端 manifest 的 entryPoint 曾可写 `../../x.exe` 或
 *              `payload.exe`，导致主进程直接 spawn 任意可执行文件、绕过沙箱。
 * @module tests/main/services
 */

import { describe, it, expect } from 'vitest'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import {
  assertNodeEntryExtension,
  DEFAULT_ENTRY_POINT,
  NODE_ENTRY_EXTENSIONS,
  resolveScriptEntryPoint
} from '../../../src/main/services/script-entry'

/** 模拟的脚本安装目录 */
const SCRIPT_ROOT = resolve(tmpdir(), 'taskforge-test-script-root')

describe('resolveScriptEntryPoint', () => {
  it('falls back to index.js when entryPoint is missing or empty', () => {
    const expected = join(SCRIPT_ROOT, DEFAULT_ENTRY_POINT)
    expect(resolveScriptEntryPoint(SCRIPT_ROOT, undefined)).toBe(expected)
    expect(resolveScriptEntryPoint(SCRIPT_ROOT, '')).toBe(expected)
    expect(resolveScriptEntryPoint(SCRIPT_ROOT, '   ')).toBe(expected)
    expect(resolveScriptEntryPoint(SCRIPT_ROOT, 42)).toBe(expected)
  })

  it('resolves nested relative entry points inside the script directory', () => {
    expect(resolveScriptEntryPoint(SCRIPT_ROOT, 'dist/main.js')).toBe(
      join(SCRIPT_ROOT, 'dist', 'main.js')
    )
    expect(resolveScriptEntryPoint(SCRIPT_ROOT, 'run.cjs')).toBe(join(SCRIPT_ROOT, 'run.cjs'))
    expect(resolveScriptEntryPoint(SCRIPT_ROOT, 'esm.mjs')).toBe(join(SCRIPT_ROOT, 'esm.mjs'))
  })

  it('rejects path traversal escaping the script directory', () => {
    expect(() => resolveScriptEntryPoint(SCRIPT_ROOT, '../../evil.js')).toThrow(/outside/)
    expect(() => resolveScriptEntryPoint(SCRIPT_ROOT, '..\\..\\evil.js')).toThrow(/outside/)
  })

  it('rejects absolute paths outside the script directory', () => {
    // POSIX /etc/evil.js 与 Windows C:\etc\evil.js 都会解析到 SCRIPT_ROOT 之外
    expect(() => resolveScriptEntryPoint(SCRIPT_ROOT, '/etc/evil.js')).toThrow(/outside/)
  })

  it('rejects non-Node extensions (executable payloads)', () => {
    expect(() => resolveScriptEntryPoint(SCRIPT_ROOT, 'payload.exe')).toThrow(/extension/)
    expect(() => resolveScriptEntryPoint(SCRIPT_ROOT, 'run.bat')).toThrow(/extension/)
    expect(() => resolveScriptEntryPoint(SCRIPT_ROOT, 'index.ts')).toThrow(/extension/)
    expect(() => resolveScriptEntryPoint(SCRIPT_ROOT, 'noext')).toThrow(/extension/)
  })
})

describe('assertNodeEntryExtension', () => {
  it('accepts .js / .cjs / .mjs', () => {
    for (const ext of NODE_ENTRY_EXTENSIONS) {
      expect(() => assertNodeEntryExtension(`/tmp/index${ext}`)).not.toThrow()
    }
  })

  it('rejects executables and unknown extensions', () => {
    expect(() => assertNodeEntryExtension('/tmp/payload.exe')).toThrow(/extension/)
    expect(() => assertNodeEntryExtension('/tmp/payload.ps1')).toThrow(/extension/)
  })
})
