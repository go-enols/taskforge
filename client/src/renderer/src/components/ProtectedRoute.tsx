/**
 * @file ProtectedRoute — 路由权限保护组件
 * @description 基于用户角色控制页面访问权限。未登录时重定向到首页，无权限时显示 toast 警告并跳转回首页。
 *              加载中时显示 spinner 动画。
 * @module renderer/components
 */
import React, { useEffect } from 'react'
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
 * 3. 角色不匹配 → toast 警告 + 跳回首页（使用 useEffect 导航，避免 render 中副作用）
 * 4. 通过验证 → 渲染子组件
 *
 * @param children - 受保护的路由内容
 * @param roles    - 允许访问的角色列表（可选）
 */
export default function ProtectedRoute({ children, roles }: ProtectedRouteProps): React.ReactElement | null {
  const { t } = useTranslation()
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()

  // 每次路由切换时刷新用户角色 确保 admin 改 role 后立即生效
  useEffect(() => {
    if (!loading && user) {
      refresh()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const denied = !loading && !!user && !!roles && !roles.includes(user.role)

  // 越权时跳转（hooks 调用必须在所有条件 return 之前）
  useEffect(() => {
    if (denied) {
      toast.warning(t('auth.redirectingHome'))
      navigate('/', { replace: true })
    }
  }, [denied, navigate, t])

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
