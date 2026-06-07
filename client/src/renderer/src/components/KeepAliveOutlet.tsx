import React from 'react'
import { useLocation, useOutlet, Navigate } from 'react-router-dom'
import { setKeepAliveElement, getKeepAliveEntries } from './keep-alive-cache'

/**
 * Drop-in replacement for `<Outlet />` that keeps every visited route
 * mounted in the React tree. Only the route matching the current
 * `location.pathname` is visible; the rest are hidden via the
 * `hidden` HTML attribute (i.e. `display: none`), which keeps the
 * component mounted, the DOM intact, and all React state preserved.
 *
 * The active page is wrapped in an `animate-fade-in` div so the
 * fade-in animation runs the first time a page is mounted. When the
 * user returns to a previously visited page, the DOM is still there
 * (just hidden) and the animation does not replay — which is what
 * you want for fast back-and-forth navigation.
 *
 * The cache itself lives in `./keep-alive-cache.ts` so this file
 * only exports a component (required by the
 * `react-refresh/only-export-components` ESLint rule for HMR).
 *
 * 重要：<Navigate> 元素（路由表 '*' 兜底）绝不能进 KeepAlive 缓存。
 * Navigate 组件在 useEffect 里调 navigate(to, { replace: true })，
 * 依赖 navigate 函数引用。KeepAlive 让它保留在 hidden div 里，
 * location 变化时 useNavigate 返回新引用 → effect 重跑 →
 * 在 hidden div 里再次 navigate 覆盖用户导航，导致点哪个页面都跳回 /。
 *
 * Usage:
 *   <Routes>
 *     <Route element={<KeepAliveOutlet />}>
 *       <Route path="/" element={<Dashboard />} />
 *       <Route path="/wallets" element={<Wallets />} />
 *       ...
 *     </Route>
 *   </Routes>
 */
export default function KeepAliveOutlet(): React.ReactElement {
  const location = useLocation()
  const currentOutlet = useOutlet()

  // 拒绝缓存 <Navigate> 元素（路由表 '*' 兜底）。
  // 它的 useEffect 在 hidden div 里仍会跑，依赖 navigate 函数引用，
  // locationPathname 变化时 effect 再跑，调用 navigate(to, { replace: true })
  // 把当前用户导航覆盖回 Navigate 的目标路径。
  const isNavigateElement =
    React.isValidElement(currentOutlet) && currentOutlet.type === Navigate

  if (currentOutlet && !isNavigateElement) {
    setKeepAliveElement(location.pathname, currentOutlet)
  }

  const entries = getKeepAliveEntries()

  return (
    <>
      {entries.map(([path, element]) => {
        const isActive = path === location.pathname
        return (
          <div
            key={path}
            data-keep-alive-path={path}
            data-active={isActive ? 'true' : 'false'}
            hidden={!isActive}
            className="h-full w-full"
          >
            <div
              className={
                isActive
                  ? 'h-full w-full animate-fade-in motion-reduce:animate-none'
                  : 'h-full w-full'
              }
            >
              {element}
            </div>
          </div>
        )
      })}
    </>
  )
}
