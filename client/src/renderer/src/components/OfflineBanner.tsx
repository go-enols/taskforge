import { useState, useEffect, useRef } from 'react'
import { WifiOff } from 'lucide-react'
import { checkMarketplaceReachable, resetMarketplaceCheck } from '../api'

const CHECK_INTERVAL = 30_000 // 30 秒轮询

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const check = async () => {
      const reachable = await checkMarketplaceReachable()
      setOffline(!reachable)
    }

    check()
    timerRef.current = setInterval(check, CHECK_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-warning/15 border-b border-warning/30 text-sm text-warning">
      <WifiOff size={14} />
      <span>Marketplace 服务器不可用 — 已安装脚本和本地数据仍可正常使用</span>
      <button
        onClick={() => {
          resetMarketplaceCheck()
          checkMarketplaceReachable().then((ok) => setOffline(!ok))
        }}
        className="ml-2 text-xs underline hover:no-underline"
      >
        重试
      </button>
    </div>
  )
}
