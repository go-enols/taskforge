/**
 * @file 会话路径授权表测试
 * @description 校验 path-allowlist：应用目录（userData/scripts/temp）默认放行，
 *              任意路径拒绝，用户经对话框授权的文件/目录放行。
 * @module tests/main/services
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  _resetPathAuthorizationsForTests,
  authorizeDir,
  authorizePath,
  isPathAuthorized
} from '../../../src/main/services/path-allowlist'

describe('path-allowlist', () => {
  beforeEach(() => {
    _resetPathAuthorizationsForTests()
  })

  it('allows paths inside the system temp dir by default', () => {
    expect(isPathAuthorized(join(tmpdir(), 'some-file.txt'))).toBe(true)
  })

  it('rejects arbitrary absolute paths outside app-owned roots', () => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'
    expect(isPathAuthorized(outside)).toBe(false)
  })

  it('allows a file explicitly authorized via dialog', () => {
    const outside = process.platform === 'win32' ? 'C:\\Users\\Public\\a.json' : '/var/tmp/a.json'
    expect(isPathAuthorized(outside)).toBe(false)
    authorizePath(outside)
    expect(isPathAuthorized(outside)).toBe(true)
  })

  it('allows children of a directory authorized via dialog', () => {
    const dir = process.platform === 'win32' ? 'D:\\Projects\\my-script' : '/opt/my-script'
    authorizeDir(dir)
    expect(isPathAuthorized(join(dir, 'index.js'))).toBe(true)
    expect(isPathAuthorized(join(dir, 'dist', 'main.js'))).toBe(true)
    // 前缀相似但并非子目录的路径不应放行
    expect(isPathAuthorized(dir + '-evil/index.js')).toBe(false)
  })

  it('rejects non-string / empty paths', () => {
    expect(isPathAuthorized(null)).toBe(false)
    expect(isPathAuthorized('')).toBe(false)
    expect(isPathAuthorized(123)).toBe(false)
  })

  it('normalizes traversal segments before comparison', () => {
    const base = join(tmpdir(), 'allowlist-test')
    expect(isPathAuthorized(join(base, '..', '..', 'Windows'))).toBe(false)
  })
})
