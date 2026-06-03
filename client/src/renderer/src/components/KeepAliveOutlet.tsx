import React from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
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

  // Cache the element for the current pathname so it survives the
  // next navigation. `useOutlet()` returns the matched child route's
  // element (or `null` if nothing matches, e.g. on the catch-all).
  if (currentOutlet) {
    setKeepAliveElement(location.pathname, currentOutlet)
  }

  // Stable iteration order: Map preserves insertion order, and we
  // only ever *overwrite* existing keys in place, never reorder
  // them. So React's reconciliation is stable across renders.
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
