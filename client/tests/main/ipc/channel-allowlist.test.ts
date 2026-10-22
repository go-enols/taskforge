/**
 * @file IPC channel 白名单一致性测试
 * @description 防止「新增 handler 忘记登记白名单」或「白名单残留已删除 channel」。
 *              做法：扫描 client/src/main 下所有注册语句，与 shared/ipc-channels.ts 对比。
 * @module tests/main/ipc
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  isAllowedEventChannel,
  isAllowedInvokeChannel
} from '../../../src/shared/ipc-channels'

const MAIN_DIR = join(__dirname, '../../../src/main')

/** 递归收集 .ts 文件 */
function collectTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

/** 从 main 源码中提取实际注册的 invoke channel 与发送的事件 channel */
function collectChannels(): { invoke: Set<string>; events: Set<string> } {
  const invoke = new Set<string>()
  const events = new Set<string>()
  for (const file of collectTsFiles(MAIN_DIR)) {
    const text = readFileSync(file, 'utf-8')
    for (const m of text.matchAll(/register\('([^']+)'/g)) invoke.add(m[1])
    for (const m of text.matchAll(/handlerMap\.set\('([^']+)'/g)) invoke.add(m[1])
    for (const m of text.matchAll(/ipcMain\.handle\('([^']+)'/g)) invoke.add(m[1])
    for (const m of text.matchAll(/\.send\('([^']+)'/g)) events.add(m[1])
  }
  return { invoke, events }
}

describe('IPC channel allowlist', () => {
  const { invoke, events } = collectChannels()

  it('every registered invoke handler is in IPC_INVOKE_CHANNELS', () => {
    const missing = [...invoke].filter((c) => !IPC_INVOKE_CHANNELS.includes(c))
    expect(missing, `add these channels to shared/ipc-channels.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('every event channel sent by main is in IPC_EVENT_CHANNELS', () => {
    const missing = [...events].filter((c) => !IPC_EVENT_CHANNELS.includes(c))
    expect(missing, `add these event channels to shared/ipc-channels.ts: ${missing.join(', ')}`).toEqual(
      []
    )
  })

  it('allowlist has no stale channels that are no longer registered', () => {
    const stale = IPC_INVOKE_CHANNELS.filter((c) => !invoke.has(c))
    expect(stale, `remove stale channels from shared/ipc-channels.ts: ${stale.join(', ')}`).toEqual([])
  })

  it('validators reject unknown and malformed channels', () => {
    expect(isAllowedInvokeChannel('wallet:list')).toBe(true)
    expect(isAllowedInvokeChannel('wallet:evil')).toBe(false)
    expect(isAllowedInvokeChannel('')).toBe(false)
    expect(isAllowedInvokeChannel(42)).toBe(false)
    expect(isAllowedEventChannel('task:log')).toBe(true)
    expect(isAllowedEventChannel('task:log:injected')).toBe(false)
  })
})
