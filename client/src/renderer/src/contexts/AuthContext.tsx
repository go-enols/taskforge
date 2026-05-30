import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { marketplaceApi } from '../api'

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
  isAdmin: boolean
  isDeveloper: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
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
    if (result?.token && result?.user) {
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
    }
  }, [])

  const register = useCallback(async (username: string, password: string, displayName: string) => {
    const result = await marketplaceApi.register(username, password, displayName)
    if (result?.token && result?.user) {
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
    }
  }, [])

  const setup = useCallback(async (username: string, password: string, displayName: string) => {
    const result = await marketplaceApi.setup(username, password, displayName)
    if (result?.token && result?.user) {
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
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('marketplace_jwt')
    localStorage.removeItem('marketplace_user')
    marketplaceApi.logout().catch(() => {})
  }, [])

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
