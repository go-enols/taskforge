import React from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, type UserRole } from '../contexts/AuthContext'
import { Shield } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: UserRole[]
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps): React.ReactElement {
  const { t } = useTranslation()
  const { user, loading } = useAuth()

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

  return <>{children}</>
}
