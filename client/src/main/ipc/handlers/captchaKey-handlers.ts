/**
 * @file 验证码密钥 IPC 处理器
 */
import { register, Services } from '../registry'

export function registerCaptchaKeyHandlers(services: Services): void {
  const { store } = services

  register('captchaKey:list', (_page?, _pageSize?, _search?) =>
    store.listCaptchaKeys(
      _page as number | undefined,
      _pageSize as number | undefined,
      _search as string | undefined
    )
  )
  register('captchaKey:get', (id) => store.getCaptchaKey(id as string))
  register('captchaKey:create', (data) =>
    store.createCaptchaKey(data as Parameters<typeof store.createCaptchaKey>[0])
  )
  register('captchaKey:update', (id, data) =>
    store.updateCaptchaKey(id as string, data as Parameters<typeof store.updateCaptchaKey>[1])
  )
  register('captchaKey:delete', (id) => store.deleteCaptchaKey(id as string))
}
