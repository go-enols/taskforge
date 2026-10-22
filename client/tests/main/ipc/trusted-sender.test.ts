/**
 * @file IPC 发送方信任校验测试
 * @description 校验 isTrustedSenderUrl：只接受应用自身 renderer 页面（打包 file:// / dev server）。
 * @module tests/main/ipc
 */
import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { isTrustedSenderUrl } from '../../../src/main/ipc/registry'

/** 与测试环境 electron mock 的 app.getAppPath() 保持一致（进程 cwd = client/） */
const APP_PATH = process.cwd()
const RENDERER_BASE = pathToFileURL(join(APP_PATH, 'out', 'renderer')).href

describe('isTrustedSenderUrl', () => {
  it('accepts packaged renderer file:// pages', () => {
    expect(isTrustedSenderUrl(`${RENDERER_BASE}/index.html`, undefined)).toBe(true)
    expect(isTrustedSenderUrl(`${RENDERER_BASE}/index.html#/tasks`, undefined)).toBe(true)
  })

  it('rejects file:// pages outside the renderer output', () => {
    expect(isTrustedSenderUrl('file:///C:/Windows/System32/drivers/etc/hosts', undefined)).toBe(
      false
    )
    expect(isTrustedSenderUrl('file:///tmp/evil.html', undefined)).toBe(false)
  })

  it('accepts the electron-vite dev server origin', () => {
    const devUrl = 'http://localhost:5173'
    expect(isTrustedSenderUrl('http://localhost:5173/index.html', devUrl)).toBe(true)
    expect(isTrustedSenderUrl('http://localhost:5173/', devUrl)).toBe(true)
  })

  it('rejects remote http(s) pages and missing urls', () => {
    expect(isTrustedSenderUrl('https://evil.example.com/phish', 'http://localhost:5173')).toBe(false)
    expect(isTrustedSenderUrl(undefined, 'http://localhost:5173')).toBe(false)
    expect(isTrustedSenderUrl('', 'http://localhost:5173')).toBe(false)
  })
})
