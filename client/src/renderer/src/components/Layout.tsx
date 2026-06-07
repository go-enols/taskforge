/**
 * @file Layout — 应用主布局组件
 * @description 应用的主框架布局，包含顶部自定义标题栏、左侧可折叠导航侧边栏、
 *              以及右侧主内容区。导航项根据用户角色动态过滤，支持侧边栏折叠/展开
 *              状态持久化。父级菜单项（如"数据"）可展开/折叠其子项。
 * @module renderer/components
 */
import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Store,
  User,
  Globe,
  Key,
  Zap,
  Clock,
  Tag,
  Settings,
  Menu,
  X,
  LogOut,
  Shield,
  Bug,
  Database,
  Code,
  ShieldCheck,
  BarChart3,
  ChevronDown
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../contexts/AuthContext'
import TitleBar from './TitleBar'

interface NavItem {
  /** 路由路径。父级项的 path 也是子项路径的前缀（如 /data），点击父级只切换展开状态 */
  path: string
  /** 导航图标组件 */
  icon: React.ElementType
  /** i18n 翻译 key */
  key: string
  /** 可见角色列表 */
  roles: UserRole[]
  /** 子项列表（用于折叠菜单）；若存在则该项为父级菜单，点击只展开/折叠 */
  children?: NavItem[]
}

/**
 * 完整导航项配置：定义所有可用页面及其对应的角色可见性
 *
 * 新结构（TaskForge 重构后）：
 *  - 第 1 位：Dashboard
 *  - 第 2 位：Marketplace（脚本/模板市场，提升为核心入口）
 *  - 第 3 位：Tasks
 *  - 第 4 位：Data（折叠菜单：Accounts/Proxies/Captcha）
 *  - 第 5 位：Scheduler
 *  - 第 6 位：Airdrops（项目追踪，降级）
 *  - Settings
 *  - Developer Center（合并 QuickDev + DeveloperPending）
 *  - Admin Center（合并 AdminReview + Users）
 *  - Stats / Logs / Debug（按角色）
 */
const ALL_NAV_ITEMS: NavItem[] = [
  { path: '/', icon: LayoutDashboard, key: 'nav.dashboard', roles: ['admin', 'developer', 'user'] },

  { path: '/marketplace', icon: Store, key: 'nav.marketplace', roles: ['admin', 'developer', 'user'] },

  { path: '/tasks', icon: Zap, key: 'nav.tasks', roles: ['developer', 'user'] },

  {
    path: '/data',
    icon: Database,
    key: 'nav.data',
    roles: ['developer', 'user'],
    children: [
      { path: '/data/accounts', icon: User, key: 'nav.dataAccounts', roles: ['developer', 'user'] },
      { path: '/data/proxies', icon: Globe, key: 'nav.dataProxies', roles: ['developer', 'user'] },
      { path: '/data/captcha', icon: Key, key: 'nav.dataCaptcha', roles: ['developer', 'user'] }
    ]
  },

  { path: '/scheduler', icon: Clock, key: 'nav.scheduler', roles: ['developer', 'user'] },
  { path: '/airdrops', icon: Tag, key: 'nav.airdrops', roles: ['developer', 'user'] },

  { path: '/settings', icon: Settings, key: 'nav.settings', roles: ['admin', 'developer', 'user'] },

  { path: '/dev', icon: Code, key: 'nav.developerCenter', roles: ['admin', 'developer'] },
  { path: '/admin', icon: ShieldCheck, key: 'nav.adminCenter', roles: ['admin'] },

  { path: '/stats', icon: BarChart3, key: 'nav.stats', roles: ['admin'] },
  { path: '/debug', icon: Bug, key: 'nav.debug', roles: ['admin', 'developer'] }
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
 * 判断当前路径是否"激活"于给定项
 *  - 父级项：path 是当前路径前缀即视为激活（如 /data 父级在 /data/accounts 时激活）
 *  - 子项：完全匹配
 *  - / 根项：仅当 location.pathname === '/' 才视为激活
 */
function isItemActive(path: string, locationPath: string): boolean {
  if (path === '/') return locationPath === '/'
  return locationPath === path || locationPath.startsWith(`${path}/`)
}

/**
 * Layout — 应用主布局组件
 *
 * 提供应用的整体骨架结构，包含顶部标题栏、左侧导航侧边栏和右侧主内容区。
 * 导航项根据当前用户角色动态过滤显示，侧边栏折叠状态持久化到 localStorage。
 * 带子项的父级菜单（如"数据"）可独立展开/折叠，展开状态在内存中维护。
 *
 * @param children - 路由页面内容，由 <KeepAliveOutlet /> 或 <Outlet /> 提供
 */
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  )

  /**
   * 父级菜单展开状态：以父级 path 为 key
   *  - 默认根据当前路径自动展开（如当前在 /data/accounts 时 Data 父级展开）
   *  - 用户点击父级时手动切换
   */
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const item of ALL_NAV_ITEMS) {
      if (item.children && isItemActive(item.path, location.pathname)) {
        init[item.path] = true
      }
    }
    return init
  })

  const userRole: UserRole = user?.role ?? 'user'
  const NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => item.roles.includes(userRole))

  const toggleGroup = (path: string): void => {
    setExpandedGroups((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  return (
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
            {NAV_ITEMS.map((item) => {
              const hasChildren = !!item.children
              const active = isItemActive(item.path, location.pathname)
              const expanded = expandedGroups[item.path] ?? false
              const Icon = item.icon

              if (!hasChildren) {
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-colors focus-ring ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-tertiary'
                    }`}
                    title={t(item.key)}
                  >
                    <Icon size={18} />
                    {!collapsed && <span>{t(item.key)}</span>}
                  </button>
                )
              }

              // 父级菜单项（带子项）：点击切换展开/折叠，不导航
              const childItems = item.children!.filter((c) => c.roles.includes(userRole))
              return (
                <div key={item.path} className="space-y-0.5">
                  <button
                    onClick={() => toggleGroup(item.path)}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-colors focus-ring ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-tertiary'
                    }`}
                    title={t(item.key)}
                    aria-expanded={expanded}
                  >
                    <Icon size={18} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{t(item.key)}</span>
                        <ChevronDown
                          size={14}
                          className={`transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
                        />
                      </>
                    )}
                  </button>
                  {/* 子项列表：仅在展开时渲染 */}
                  {!collapsed && expanded && (
                    <div className="ml-4 pl-2 border-l border-border-light/60 space-y-0.5">
                      {childItems.map((child) => {
                        const childActive = location.pathname === child.path
                        const ChildIcon = child.icon
                        return (
                          <button
                            key={child.path}
                            onClick={() => navigate(child.path)}
                            className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors focus-ring ${
                              childActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-text-secondary hover:bg-bg-tertiary'
                            }`}
                            title={t(child.key)}
                          >
                            <ChildIcon size={14} />
                            <span>{t(child.key)}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
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
