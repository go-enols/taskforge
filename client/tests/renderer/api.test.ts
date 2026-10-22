/**
 * @file API 客户端测试
 * @description 验证渲染进程 API 客户端（appApi、walletApi、settingApi、logApi）
 *              是否正确调用底层 transport.call 方法，确保各 API 方法和 IPC channel 名称正确对应。
 * @module tests/renderer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

/** 模拟 transport 模块的 call 函数 */
const mockCall = vi.hoisted(() => vi.fn())

vi.mock('../../src/renderer/src/transport', () => ({
  call: mockCall
}))

import { appApi, walletApi, settingApi, logApi } from '../../src/renderer/src/api'

// describe: 渲染进程 API 客户端测试
describe('api', () => {
  // 每个测试前重置 mock
  beforeEach(() => {
    mockCall.mockReset()
  })

  // describe: appApi 应用信息 API
  describe('appApi', () => {
    it('appApi.getInfo calls call with app:getInfo', async () => {
      // 用例：appApi.getInfo 调用 transport.call('app:getInfo')
      mockCall.mockResolvedValueOnce({} as unknown)
      await appApi.getInfo()
      expect(mockCall).toHaveBeenCalledWith('app:getInfo')
    })

    it('appApi.getStats calls call with app:getStats', async () => {
      // 用例：appApi.getStats 调用 transport.call('app:getStats')
      mockCall.mockResolvedValueOnce({} as unknown)
      await appApi.getStats()
      expect(mockCall).toHaveBeenCalledWith('app:getStats')
    })
  })

  describe('walletApi', () => {
    it('walletApi.list calls call with wallet:list and default args', async () => {
      mockCall.mockResolvedValueOnce({} as unknown)
      await walletApi.list()
      expect(mockCall).toHaveBeenCalledWith('wallet:list', [1, 50, ''])
    })

    it('walletApi.get calls call with wallet:get and id', async () => {
      // 用例：walletApi.get 调用 transport.call('wallet:get', [id])
      mockCall.mockResolvedValueOnce({} as unknown)
      await walletApi.get('id1')
      expect(mockCall).toHaveBeenCalledWith('wallet:get', ['id1'])
    })

    it('walletApi.create calls call with wallet:create and data', async () => {
      // 用例：walletApi.create 调用 transport.call('wallet:create', [data])
      const data = {} as Parameters<typeof walletApi.create>[0]
      mockCall.mockResolvedValueOnce({} as unknown)
      await walletApi.create(data)
      expect(mockCall).toHaveBeenCalledWith('wallet:create', [data])
    })

    it('walletApi.delete calls call with wallet:delete and id', async () => {
      // 用例：walletApi.delete 调用 transport.call('wallet:delete', [id])
      mockCall.mockResolvedValueOnce({} as unknown)
      await walletApi.delete('id1')
      expect(mockCall).toHaveBeenCalledWith('wallet:delete', ['id1'])
    })
  })

  // describe: settingApi 设置 API
  describe('settingApi', () => {
    it('settingApi.get calls call with setting:get and key', async () => {
      // 用例：settingApi.get 调用 transport.call('setting:get', [key])
      mockCall.mockResolvedValueOnce(null as unknown)
      await settingApi.get('key1')
      expect(mockCall).toHaveBeenCalledWith('setting:get', ['key1'])
    })

    it('settingApi.set calls call with setting:set and key/value', async () => {
      // 用例：settingApi.set 调用 transport.call('setting:set', [key, value])
      mockCall.mockResolvedValueOnce(undefined as unknown)
      await settingApi.set('key1', 'value1')
      expect(mockCall).toHaveBeenCalledWith('setting:set', ['key1', 'value1'])
    })
  })

  // describe: logApi 日志 API
  describe('logApi', () => {
    it('logApi.query calls call with log:query and undefined args', async () => {
      // 用例：logApi.query 调用 transport.call('log:query', [undefined, ...])
      mockCall.mockResolvedValueOnce({} as unknown)
      await logApi.query()
      expect(mockCall).toHaveBeenCalledWith('log:query', [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      ])
    })
  })
})
