/**
 * @file Layout — 应用主布局组件
 * @description 应用的主框架布局，包含顶部自定义标题栏（TitleBar）、左侧可折叠导航侧边栏、
 *              以及右侧主内容区。导航项根据用户角色动态过滤，支持侧边栏折叠/展开状态持久化。
 * @module renderer/components
 */
import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Wallet,
  User,
  Globe,
  Zap,
  FileText,
  Gift,
  Clock,
  ScrollText,
  Settings,
  Menu,
  X,
  LogOut,
  Shield,
  Bug
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../contexts/AuthContext'
import TitleBar from './TitleBar'

interface NavItem {
  /** 路由路径 */
  path: string
  /** 导航图标组件 */
  icon: React.ElementType
  /** i18n 翻译 key */
  key: string
  /** 可见角色列表 */
  roles: UserRole[]
}

/** 完整导航项配置：定义所有可用页面及其对应的角色可见性 */
const ALL_NAV_ITEMS: NavItem[] = [
  // ---- 通用页面（所有角色可见） ----
  { path: '/', icon: LayoutDashboard, key: 'nav.dashboard', roles: ['admin', 'developer', 'user'] },

  // ---- 运营页面（developer + user） ----
  { path: '/wallets', icon: Wallet, key: 'nav.wallets', roles: ['developer', 'user'] },
  { path: '/accounts', icon: User, key: 'nav.accounts', roles: ['developer', 'user'] },
  { path: '/proxies', icon: Globe, key: 'nav.proxies', roles: ['developer', 'user'] },
  { path: '/airdrops', icon: Gift, key: 'nav.airdrops', roles: ['developer', 'user'] },
  { path: '/tasks', icon: Zap, key: 'nav.tasks', roles: ['developer', 'user'] },
  { path: '/scheduler', icon: Clock, key: 'nav.scheduler', roles: ['developer', 'user'] },

  // ---- 模板市场（所有角色可见） ----
  { path: '/templates', icon: FileText, key: 'nav.templates', roles: ['admin', 'developer', 'user'] },

  // ---- 开发者专用页面 ----
  { path: '/quick-dev', icon: Zap, key: 'nav.quickDev', roles: ['developer'] },
  { path: '/developer/pending', icon: Clock, key: 'nav.developerPending', roles: ['developer'] },
  { path: '/debug', icon: Bug, key: 'nav.debug', roles: ['admin', 'developer'] },

  // ---- 管理员专用页面 ----
  { path: '/admin/review', icon: Shield, key: 'nav.adminReview', roles: ['admin'] },
  { path: '/users', icon: User, key: 'nav.users', roles: ['admin'] },
  { path: '/logs', icon: ScrollText, key: 'nav.logs', roles: ['admin'] },

  // ---- 设置页面（所有角色可见） ----
  { path: '/settings', icon: Settings, key: 'nav.settings', roles: ['admin', 'developer', 'user'] },
]

/** 角色名到 i18n key 的映射 */
const roleLabelKeys: Record<UserRole, string> = {
  admin: 'roles.admin',
  developer: 'roles.developer',
  user: 'roles.user'
}

/** 角色徽章颜色映射 */
const roleColors: Record<UserRole, string> = {
  admin: 'bg-danger text-white',
  developer: 'bg-primary text-white',
  user: 'bg-success text-white'
}

/**
 * Layout — 应用主布局组件
 *
 * 提供应用的整体骨架结构，包含顶部标题栏、左侧导航侧边栏和右侧主内容区。
 * 导航项根据当前用户角色动态过滤显示，侧边栏折叠状态持久化到 localStorage。
 *
 * @param children - 路由页面内容，由 <KeepAliveOutlet /> 或 <Outlet /> 提供
 */
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  // 从 localStorage 恢复侧边栏折叠状态
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  )

  // 根据用户角色过滤导航项
  const userRole: UserRole = user?.role ?? 'user'
  const NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => item.roles.includes(userRole))

  return (
    // 整体布局：纵向排列 TitleBar 和主内容区
    <div className="flex flex-col h-screen bg-bg-page">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧导航侧边栏 */}
        <aside
          className={`${collapsed ? 'w-16' : 'w-52'} flex flex-col border-r border-border-light bg-bg-card transition-all duration-200`}
        >
          {/* 侧边栏顶栏：折叠/展开按钮 */}
          <div
            className={`relative flex items-center h-11 px-2.5 border-b border-border-light/60 ${
              collapsed ? 'justify-center' : 'justify-end'
            }`}
          >
            {/* 顶栏底部装饰线 */}
            <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            <button
              onClick={() => {
                const next = !collapsed
                setCollapsed(next)
                localStorage.setItem('sidebar-collapsed', String(next))
              }}
              className="group relative flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-primary hover:bg-primary/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all duration-150"
              aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
              title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            >
              {collapsed ? <Menu size={16} /> : <X size={16} />}
            </button>
          </div>

          {/* 导航菜单列表 */}
          <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
            {NAV_ITEMS.map(({ path, icon: Icon, key }) => {
              const active =
                location.pathname.startsWith(path) &&
                (path === '/' ? location.pathname === '/' : true)
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-colors focus-ring ${
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-bg-tertiary'
                  }`}
                  title={t(key)}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{t(key)}</span>}
                </button>
              )
            })}
          </nav>

          {/* 底部用户信息 + 登出按钮 */}
          <div className="border-t border-border-light p-3">
            {!collapsed && (
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-text-muted" />
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[userRole]}`}
                  >
                    {t(roleLabelKeys[userRole])}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1 truncate">{user?.displayName}</p>
              </div>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-text-muted hover:text-danger hover:bg-danger/10 transition-colors focus-ring"
              title={t('nav.logout')}
            >
              <LogOut size={14} />
              {!collapsed && <span>{t('nav.logout')}</span>}
            </button>
          </div>
        </aside>

        {/* 右侧主内容区 */}
        <main className="flex-1 overflow-auto p-6 bg-bg-page">
          {/*
            这里不使用 key={pathname} 的原因是页面切换由 <KeepAliveOutlet /> 在 App.tsx 中处理，
            页面组件被缓存而非卸载/重新挂载。因此整个 <main> 不应因 URL 变化而重新挂载。
            每个页面的淡入动画由 KeepAliveOutlet 内部的活跃页面包装器控制。
          */}
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
