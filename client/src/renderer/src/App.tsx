/**
 * @file 应用根组件
 * @description 应用入口组件，管理全局路由、认证状态、错误边界和页面缓存。
 *              未登录时显示 LoginPage，登录后根据角色显示对应的导航页面。
 *              使用 KeepAliveOutlet 保持页面状态，避免切换路由时重新挂载。
 * @module renderer/core
 */
import React, { Suspense, lazy } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./contexts/AuthContext"
import { ErrorBoundary } from "./components/ErrorBoundary"
import Layout from "./components/Layout"
import ProtectedRoute from "./components/ProtectedRoute"
import KeepAliveOutlet from "./components/KeepAliveOutlet"

/** 懒加载页面组件：仪表盘 */
const Dashboard = lazy(() => import("./pages/Dashboard"))
/** 懒加载页面组件：账户管理 */
const Accounts = lazy(() => import("./pages/Accounts"))
/** 懒加载页面组件：代理管理 */
const Proxies = lazy(() => import("./pages/Proxies"))
/** 懒加载页面组件：验证码密钥管理 */
const Captcha = lazy(() => import("./pages/Captcha"))
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
/** 懒加载页面组件：管理中心（审核 + 用户管理 + 日志） */
const AdminCenter = lazy(() => import("./pages/AdminCenter"))
/** 懒加载页面组件：脚本详情页 */
const ScriptDetail = lazy(() => import("./pages/ScriptDetail"))
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
          <Route element={<KeepAliveOutlet />}>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/marketplace" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/marketplace/scripts/:id" element={<ProtectedRoute><ScriptDetail /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
            <Route path="/data/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
            <Route path="/data/proxies" element={<ProtectedRoute><Proxies /></ProtectedRoute>} />
            <Route path="/data/captcha" element={<ProtectedRoute><Captcha /></ProtectedRoute>} />
            <Route path="/airdrops" element={<ProtectedRoute><Airdrops /></ProtectedRoute>} />
            <Route path="/scheduler" element={<ProtectedRoute><Scheduler /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/stats" element={<ProtectedRoute roles={["admin"]}><Stats /></ProtectedRoute>} />
            <Route path="/dev" element={<ProtectedRoute roles={["admin", "developer"]}><DeveloperCenter /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminCenter /></ProtectedRoute>} />
            <Route path="/debug" element={<ProtectedRoute roles={["admin", "developer"]}><DebugPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
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

export default App
