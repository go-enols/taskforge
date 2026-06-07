/**
 * @file ProtectedRoute — 路由权限保护组件
 * @description 基于用户角色控制页面访问权限。未登录时重定向到首页，无权限时显示 toast 警告并跳转回首页。
 *              加载中时显示 spinner 动画。
 * @module renderer/components
 */
import React, { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuth, type UserRole } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  /** 受保护的路由内容 */
  children: React.ReactNode
  /** 允许访问的角色列表（不传则不限制角色） */
  roles?: UserRole[]
}

/**
 * ProtectedRoute — 路由权限保护组件
 *
 * 验证用户登录状态和角色权限：
 * 1. 加载中 → 显示 spinner
 * 2. 未登录 → 重定向到首页
 * 3. 角色不匹配 → toast 警告 + 跳回首页（**只跳一次**）
 * 4. 通过验证 → 渲染子组件
 *
 * 重要：denied 分支必须用 ref 锁定"只跑一次"，否则 KeepAlive 缓存 ProtectedRoute
 * 实例后，location 变化时 useNavigate() 返回新引用（react-router useCallback deps
 * 含 locationPathname），useEffect 重跑会再次调 navigate('/')，污染用户后续导航。
 * 见 commit 78a4825/导航污染修复的根因分析。
 *
 * @param children - 受保护的路由内容
 * @param roles    - 允许访问的角色列表（可选）
 */
export default function ProtectedRoute({ children, roles }: ProtectedRouteProps): React.ReactElement | null {
  const { t } = useTranslation()
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const denied = !loading && !!user && !!roles && !roles.includes(user.role)

  // 只在 denied 首次成立时跳一次；离开 denied 时重置 ref。
  // 不把 navigate 放进 deps：useNavigate() 引用随 location 变化，KeepAlive 缓存
  // ProtectedRoute 时会让 effect 重跑，引发"导航到任何页面都被拽回 /"的污染。
  const redirectedRef = useRef(false)
  useEffect(() => {
    if (denied && !redirectedRef.current) {
      redirectedRef.current = true
      toast.warning(t('auth.redirectingHome'))
      navigate('/', { replace: true })
    }
    if (!denied) {
      redirectedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, t])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (denied) {
    return null
  }

  return <>{children}</>
}
