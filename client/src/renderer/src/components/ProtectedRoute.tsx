/**
 * @file ProtectedRoute — 路由权限保护组件
 * @description 基于用户角色控制页面访问权限。未登录时重定向到首页，无权限时展示"无访问权限"提示。
 *              加载中时显示 spinner 动画。
 * @module renderer/components
 */
import React from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, type UserRole } from '../contexts/AuthContext'
import { Shield } from 'lucide-react'

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
 * 3. 角色不匹配 → 显示"无访问权限"页面，列出所需角色
 * 4. 通过验证 → 渲染子组件
 *
 * @param children - 受保护的路由内容
 * @param roles    - 允许访问的角色列表（可选）
 */
export default function ProtectedRoute({ children, roles }: ProtectedRouteProps): React.ReactElement {
  const { t } = useTranslation()
  const { user, loading } = useAuth()

  // 认证状态加载中，显示 spinner
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // 未登录，重定向到首页
  if (!user) {
    return <Navigate to="/" replace />
  }

  // 角色权限不足，显示无权限提示页
  if (roles && !roles.includes(user.role)) {
    const roleLabels: Record<string, string> = {
      admin: t('layout.roleAdmin'),
      developer: t('layout.roleDeveloper'),
      user: t('layout.roleUser')
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
        <Shield className="w-16 h-16" />
        <p className="text-lg">{t('auth.noAccess')}</p>
        <p className="text-sm">{t('auth.requiredRole', { roles: roles.map((r) => roleLabels[r] || r).join(' / ') })}</p>
      </div>
    )
  }

  // 权限验证通过，渲染子组件
  return <>{children}</>
}
