import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockCall = vi.hoisted(() => vi.fn())

vi.mock('../../src/renderer/src/transport', () => ({
  call: mockCall
}))

import { appApi, walletApi, settingApi, logApi } from '../../src/renderer/src/api'

describe('api', () => {
  beforeEach(() => {
    mockCall.mockReset()
  })

  describe('appApi', () => {
    it('appApi.getInfo calls call with app:getInfo', async () => {
      mockCall.mockResolvedValueOnce({} as unknown)
      await appApi.getInfo()
      expect(mockCall).toHaveBeenCalledWith('app:getInfo')
    })

    it('appApi.getStats calls call with app:getStats', async () => {
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
      mockCall.mockResolvedValueOnce({} as unknown)
      await walletApi.get('id1')
      expect(mockCall).toHaveBeenCalledWith('wallet:get', ['id1'])
    })

    it('walletApi.create calls call with wallet:create and data', async () => {
      const data = { name: 'test', type: 'evm' } as unknown
      mockCall.mockResolvedValueOnce({} as unknown)
      await walletApi.create(data)
      expect(mockCall).toHaveBeenCalledWith('wallet:create', [data])
    })

    it('walletApi.delete calls call with wallet:delete and id', async () => {
      mockCall.mockResolvedValueOnce({} as unknown)
      await walletApi.delete('id1')
      expect(mockCall).toHaveBeenCalledWith('wallet:delete', ['id1'])
    })

    it('walletApi.generateMnemonic calls call with wallet:generateMnemonic', async () => {
      mockCall.mockResolvedValueOnce('' as unknown)
      await walletApi.generateMnemonic()
      expect(mockCall).toHaveBeenCalledWith('wallet:generateMnemonic')
    })
  })

  describe('settingApi', () => {
    it('settingApi.get calls call with setting:get and key', async () => {
      mockCall.mockResolvedValueOnce(null as unknown)
      await settingApi.get('key1')
      expect(mockCall).toHaveBeenCalledWith('setting:get', ['key1'])
    })

    it('settingApi.set calls call with setting:set and key/value', async () => {
      mockCall.mockResolvedValueOnce(undefined as unknown)
      await settingApi.set('key1', 'value1')
      expect(mockCall).toHaveBeenCalledWith('setting:set', ['key1', 'value1'])
    })
  })

  describe('logApi', () => {
    it('logApi.query calls call with log:query and undefined args', async () => {
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
