/**
 * TaskForge 移动端 Service Worker
 *
 * 策略：
 * - 应用壳（/app/ 下的 HTML/JS/CSS/图标）预缓存，离线可打开
 * - 导航请求：network-first，失败回退缓存的 index.html
 * - /api 请求：不做缓存（避免缓存登录态/列表数据）
 */
const CACHE_VERSION = 'taskforge-mobile-v1'
const APP_SHELL = [
  '/app/',
  '/app/index.html',
  '/app/manifest.json',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png',
  '/app/icons/apple-touch-icon.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // API 不缓存
  if (url.pathname.startsWith('/api/')) return

  // 导航请求：network-first，离线回退 index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put('/app/index.html', copy))
          return response
        })
        .catch(() => caches.match('/app/index.html').then((cached) => cached || caches.match('/app/')))
    )
    return
  }

  // 静态资源：cache-first + 后台更新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
