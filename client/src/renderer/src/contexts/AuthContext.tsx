import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { marketplaceApi } from '../api'
import { setOnAuthFailure } from '../transport'

export type UserRole = 'admin' | 'developer' | 'user'

export interface User {
  id: string
  username: string
  displayName: string
  role: UserRole
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, displayName: string) => Promise<void>
  setup: (username: string, password: string, displayName: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
  role: UserRole | null
  isAdmin: boolean
  isDeveloper: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('marketplace_jwt')
      const savedUser = localStorage.getItem('marketplace_user')
      if (savedToken && savedUser) {
        try {
          // Verify the token is still valid on the server
          const userData = await marketplaceApi.getUser()
          if (userData) {
            setUser({
              id: userData.id,
              username: userData.username,
              displayName: userData.displayName,
              role: (userData.role as UserRole) || 'user'
            })
            setToken(savedToken)
          } else {
            localStorage.removeItem('marketplace_jwt')
            localStorage.removeItem('marketplace_user')
          }
        } catch {
          localStorage.removeItem('marketplace_jwt')
          localStorage.removeItem('marketplace_user')
        }
      }
      setLoading(false)
    }
    initAuth()
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const result = await marketplaceApi.login(username, password)
    if (!result?.token || !result?.user) {
      throw new Error('登录失败：服务器未返回有效凭证')
    }
    const userData: User = {
      id: result.user.id,
      username: result.user.username,
      displayName: result.user.displayName,
      role: (result.user.role as UserRole) || 'user'
    }
    setToken(result.token)
    setUser(userData)
    localStorage.setItem('marketplace_jwt', result.token)
    localStorage.setItem('marketplace_user', JSON.stringify(userData))
    // 登录成功：重置 URL 到首页，避免上一个会话残留的受限路由触发 ProtectedRoute 反弹
    if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#/login') {
      navigate('/', { replace: true })
    }
  }, [navigate])

  const register = useCallback(async (username: string, password: string, displayName: string) => {
    const result = await marketplaceApi.register(username, password, displayName)
    if (!result?.token || !result?.user) {
      throw new Error('注册失败：服务器未返回有效凭证')
    }
    const userData: User = {
      id: result.user.id,
      username: result.user.username,
      displayName: result.user.displayName,
      role: (result.user.role as UserRole) || 'user'
    }
    setToken(result.token)
    setUser(userData)
    localStorage.setItem('marketplace_jwt', result.token)
    localStorage.setItem('marketplace_user', JSON.stringify(userData))
    if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#/login') {
      navigate('/', { replace: true })
    }
  }, [navigate])

  const setup = useCallback(async (username: string, password: string, displayName: string) => {
    const result = await marketplaceApi.setup(username, password, displayName)
    if (!result?.token || !result?.user) {
      throw new Error('初始化失败：服务器未返回有效凭证')
    }
    const userData: User = {
      id: result.user.id,
      username: result.user.username,
      displayName: result.user.displayName,
      role: (result.user.role as UserRole) || 'admin'
    }
    setToken(result.token)
    setUser(userData)
    localStorage.setItem('marketplace_jwt', result.token)
    localStorage.setItem('marketplace_user', JSON.stringify(userData))
    if (window.location.hash && window.location.hash !== '#/' && window.location.hash !== '#/login') {
      navigate('/', { replace: true })
    }
  }, [navigate])

  const refresh = useCallback(async () => {
    const savedToken = localStorage.getItem('marketplace_jwt')
    if (!savedToken) return
    try {
      const userData = await marketplaceApi.getUser()
      if (userData) {
        const next: User = {
          id: userData.id,
          username: userData.username,
          displayName: userData.displayName,
          role: (userData.role as UserRole) || 'user'
        }
        setUser(next)
        setToken(savedToken)
        localStorage.setItem('marketplace_user', JSON.stringify(next))
      } else {
        setUser(null)
        setToken(null)
        localStorage.removeItem('marketplace_jwt')
        localStorage.removeItem('marketplace_user')
      }
    } catch (err: unknown) {
      // Transient failure: keep current state, log for diagnostics.
      console.warn('[auth] refresh failed:', err)
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('marketplace_jwt')
    localStorage.removeItem('marketplace_user')



    marketplaceApi.logout().catch((err: unknown) => {
      console.warn('[auth] server-side logout failed:', err)
    })
  }, [])

  /**
   * 当 transport 在 HTTP 401 或 IPC UNAUTHORIZED 时调用
   * 静默清空 user + token（不调 marketplaceApi.logout()，因 server 已经拒绝认证）
   * 然后跳转 /login（让用户看到登录页 + 重新登录）
   */
  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null)
      setToken(null)
      localStorage.removeItem('marketplace_jwt')
      localStorage.removeItem('marketplace_user')
      // 跳转登录页（如果当前不在登录页）
      if (window.location.hash !== '#/login' && !window.location.pathname.endsWith('/login')) {
        navigate('/login', { replace: true })
      }
    })
    return () => setOnAuthFailure(null)
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        setup,
        logout,
        refresh,
        role: user?.role ?? null,
        isAdmin: user?.role === 'admin',
        isDeveloper: user?.role === 'developer' || user?.role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
