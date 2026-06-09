/**
 * @file useTheme — 主题状态 React Context
 * @description ThemePref + ResolvedTheme 类型 + ThemeProvider + useTheme() hook + applyTheme/initTheme 工具函数
 *              主题状态在 Context 内共享（不再每个 useTheme() 调用方持有独立 useState），
 *              确保 LoginPage / ThemeToggle / TitleBar / ParticlegroundBg 拿到同一份 theme。
 *
 *              仍保留 initTheme() 用于 main.tsx 启动前同步应用主题（防止 FOUC）。
 * @module renderer/hooks
 */
/* eslint-disable react-refresh/only-export-components */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'

/** 用户主题偏好：auto = 跟随系统；light/dark = 强制 */
export type ThemePref = 'auto' | 'light' | 'dark'
/** 实际生效的主题（resolve 后的 light/dark） */
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/** 读取系统主题（prefers-color-scheme） */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 从 localStorage 读取用户偏好 */
function readPref(): ThemePref {
  if (typeof localStorage === 'undefined') return 'auto'
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'auto') return v
  return 'auto'
}

/** pref → 实际主题（auto 时返回系统主题） */
function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === 'auto' ? getSystemTheme() : pref
}

/**
 * 同步将主题应用到 <html> class + meta color-scheme。
 * 在 main.tsx 启动前调用一次（initTheme）防止 FOUC，
 * ThemeProvider mount 时也会调用一次。
 */
export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(resolved)

  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'color-scheme'
    document.head.appendChild(meta)
  }
  meta.content = resolved
  return resolved
}

/** 启动时同步初始化（在 React render 之前调用） */
export function initTheme(): ResolvedTheme {
  return applyTheme(readPref())
}

/** Context 暴露的状态类型 */
interface ThemeContextValue {
  theme: ResolvedTheme
  pref: ThemePref
  setPref: (p: ThemePref) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * ThemeProvider — 顶层 Provider，包裹整个应用。
 * 内部持有 pref + systemTheme 状态（共享给所有 useTheme() 调用方）。
 */
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pref, setPrefState] = useState<ThemePref>(() => readPref())
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  const prefRef = useRef<ThemePref>(pref)

  // 同步 pref 到 ref（matchMedia 监听器用）
  useEffect(() => {
    prefRef.current = pref
  }, [pref])

  // pref 变化时同步到 DOM
  useEffect(() => {
    applyTheme(pref)
  }, [pref])

  // 监听系统主题变化（仅 pref === 'auto' 时同步）
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      setSystemTheme(mql.matches ? 'dark' : 'light')
      if (prefRef.current === 'auto') {
        applyTheme('auto')
      }
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const setPref = useCallback((p: ThemePref): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, p)
    }
    setPrefState(p)
  }, [])

  const value = useMemo<ThemeContextValue>(() => {
    const theme: ResolvedTheme = pref === 'auto' ? systemTheme : pref
    return { theme, pref, setPref }
  }, [pref, systemTheme, setPref])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * useTheme — 读取当前主题。
 * 必须在 <ThemeProvider> 子树内调用，否则抛错（开发期可见）。
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme() must be used within <ThemeProvider>')
  }
  return ctx
}
