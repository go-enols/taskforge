/**
 * @file 任务配置环境变量构建测试
 * @description 验证 buildTaskConfigEnv 会过滤主进程保留键与系统关键变量。
 *              回归背景：脚本作者可在 manifest schema 中声明
 *              `perm_bypass: { default: "1" }`，该默认值自动进入 task.config，
 *              曾可映射为 TASK_PERM_BYPASS=1 解除沙箱。
 * @module tests/main/services
 */

import { describe, it, expect } from 'vitest'
import { buildTaskConfigEnv } from '../../../src/main/services/task-env'

describe('buildTaskConfigEnv', () => {
  it('maps user config keys to TASK_* env vars', () => {
    expect(
      buildTaskConfigEnv({
        targetUrl: 'https://example.com',
        threadCount: 3,
        proxy_mode: 'per_account'
      })
    ).toEqual({
      TASK_TARGETURL: 'https://example.com',
      TASK_THREADCOUNT: '3',
      TASK_PROXY_MODE: 'per_account'
    })
  })

  it('rejects sandbox bypass keys regardless of case', () => {
    expect(
      buildTaskConfigEnv({
        perm_bypass: '1',
        PERM_BYPASS: '1',
        cwd_resolved: 'C:\\',
        CWD_RESOLVED: '/'
      })
    ).toEqual({})
  })

  it('rejects other main-process reserved keys', () => {
    expect(
      buildTaskConfigEnv({
        perm_network: '1',
        perm_filesystem: '1',
        sandbox: '0',
        config: '{}',
        id: 'fake',
        args: ['--evil'],
        command: 'cmd.exe'
      })
    ).toEqual({})
  })

  it('rejects system-critical environment keys', () => {
    expect(
      buildTaskConfigEnv({
        path: 'C:\\evil',
        HOME: '/evil',
        TEMP: 'C:\\evil-temp',
        LD_PRELOAD: '/evil.so'
      })
    ).toEqual({})
  })

  it('skips internal fields prefixed with _data_', () => {
    expect(
      buildTaskConfigEnv({
        _data_wallet: [{ address: '0xabc' }],
        _command: 'node',
        keepMe: 'yes'
      })
    ).toEqual({ TASK_KEEPME: 'yes' })
  })

  it('serializes object and array values as JSON', () => {
    const env = buildTaskConfigEnv({
      options: { a: 1 },
      list: [1, 2]
    })
    expect(env.TASK_OPTIONS).toBe('{"a":1}')
    expect(env.TASK_LIST).toBe('[1,2]')
  })

  it('skips null and undefined values', () => {
    expect(buildTaskConfigEnv({ a: null, b: undefined, c: 'x' })).toEqual({ TASK_C: 'x' })
  })
})
