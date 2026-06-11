/**
 * @file 应用根组件
 * @description 应用入口组件，管理全局路由、认证状态和错误边界。
 *              未登录时显示 LoginPage，登录后根据角色显示对应的导航页面。
 * @module renderer/core
 */
import React, { Suspense, lazy } from "react"
import { Routes, Route, useNavigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { ErrorBoundary } from "./components/ErrorBoundary"
import Layout from "./components/Layout"
import ProtectedRoute from "./components/ProtectedRoute"

/** 懒加载页面组件：仪表盘 */
const Dashboard = lazy(() => import("./pages/Dashboard"))
/** 懒加载页面组件：数据管理（脚本参数/代理/验证码/导入） */
const Data = lazy(() => import("./pages/Data"))
/** 懒加载页面组件：任务管理 */
const Tasks = lazy(() => import("./pages/Tasks"))
/** 懒加载页面组件：市场（模板/脚本浏览安装） */
const Templates = lazy(() => import("./pages/Templates"))
/** 懒加载页面组件：空投追踪 */
const Airdrops = lazy(() => import("./pages/Airdrops"))
/** 懒加载页面组件：统计 */
const Stats = lazy(() => import("./pages/Stats"))
/** 懒加载页面组件：定时任务 */
const Scheduler = lazy(() => import("./pages/Scheduler"))
/** 懒加载页面组件：设置 */
const Settings = lazy(() => import("./pages/Settings"))
/** 懒加载页面组件：开发者中心（项目脚手架 + 待审核 + 我的脚本 + SDK 文档） */
const DeveloperCenter = lazy(() => import("./pages/DeveloperCenter"))
/** 懒加载页面组件：管理中心（审核 + 用户管理） */
const AdminCenter = lazy(() => import("./pages/AdminCenter"))
const ScriptReview = lazy(() => import("./pages/ScriptReview"))
const TemplateReview = lazy(() => import("./pages/TemplateReview"))
/** 懒加载页面组件：脚本详情页 */
const ScriptDetail = lazy(() => import("./pages/ScriptDetail"))
/** 懒加载页面组件：日志（应用日志查看） */
const Logs = lazy(() => import("./pages/Logs"))
/** 懒加载页面组件：调试页 */
const DebugPage = lazy(() => import("./pages/DebugPage"))
/** 懒加载页面组件：登录页 */
const LoginPage = lazy(() => import("./pages/LoginPage"))

/** 通用加载旋转指示器，用于 Suspense fallback */
const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
)

function AppContent(): React.ReactElement {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-page">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-text-muted">加载中...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LoginPage />
      </Suspense>
    )
  }

  return (
    <Layout>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/marketplace" element={<ProtectedRoute roles={["admin", "developer", "user"]}><Templates /></ProtectedRoute>} />
          <Route path="/marketplace/scripts/:id" element={<ProtectedRoute roles={["admin", "developer", "user"]}><ScriptDetail /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute roles={["developer", "user"]}><Tasks /></ProtectedRoute>} />
          <Route path="/data" element={<ProtectedRoute roles={["developer", "user"]}><Data /></ProtectedRoute>} />
          <Route path="/data/params" element={<ProtectedRoute roles={["developer", "user"]}><Data /></ProtectedRoute>} />
          <Route path="/data/proxies" element={<ProtectedRoute roles={["developer", "user"]}><Data /></ProtectedRoute>} />
          <Route path="/data/captcha" element={<ProtectedRoute roles={["developer", "user"]}><Data /></ProtectedRoute>} />
          <Route path="/airdrops" element={<ProtectedRoute roles={["developer", "user"]}><Airdrops /></ProtectedRoute>} />
          <Route path="/scheduler" element={<ProtectedRoute roles={["developer", "user"]}><Scheduler /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/stats" element={<ProtectedRoute roles={["admin"]}><Stats /></ProtectedRoute>} />
          <Route path="/dev" element={<ProtectedRoute roles={["admin", "developer"]}><DeveloperCenter /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminCenter /></ProtectedRoute>} />
          <Route path="/admin/script-review" element={<ProtectedRoute roles={["admin"]}><ScriptReview /></ProtectedRoute>} />
          <Route path="/admin/templates" element={<ProtectedRoute roles={["admin"]}><TemplateReview /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute roles={["admin"]}><Logs /></ProtectedRoute>} />
          <Route path="/debug" element={<ProtectedRoute roles={["admin", "developer"]}><DebugPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </ErrorBoundary>
)

/**
 * 404 兜底页 — 当 pathname 不匹配任何 Route 时显示。
 *
 * 关键：必须用普通 JSX（按钮 onClick 调 navigate），不能用 <Navigate to="/" replace />。
 * react-router v6/v7 的 <Navigate> 内部 useEffect 调 navigate()，依赖 navigate 函数引用；
 * KeepAlive 会把它缓存在 module-level Map 里的 hidden div 保留，location 变化时 effect 重跑，
 * 在 hidden div 里再次 navigate('/') 覆盖用户刚点的任何导航，污染整个应用的导航。
 */
const NotFoundPage: React.FC = () => {
  const navigate = useNavigate()
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-text-secondary">
      <div className="text-6xl font-bold text-text-muted">404</div>
      <p className="text-sm">页面不存在</p>
      <button
        onClick={() => navigate('/')}
        className="px-4 py-1.5 text-sm border border-border-light rounded-lg hover:bg-bg-tertiary transition-colors"
      >
        返回首页
      </button>
    </div>
  )
}

export default App
