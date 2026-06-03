import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import KeepAliveOutlet from './components/KeepAliveOutlet'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Wallets = lazy(() => import('./pages/Wallets'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Proxies = lazy(() => import('./pages/Proxies'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Templates = lazy(() => import('./pages/Templates'))
const Airdrops = lazy(() => import('./pages/Airdrops'))
const Stats = lazy(() => import('./pages/Stats'))
const Scheduler = lazy(() => import('./pages/Scheduler'))
const Logs = lazy(() => import('./pages/Logs'))
const Settings = lazy(() => import('./pages/Settings'))
const QuickDev = lazy(() => import('./pages/QuickDev'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const AdminReviewPage = lazy(() => import('./pages/AdminReviewPage'))
const DeveloperPendingPage = lazy(() => import('./pages/DeveloperPendingPage'))
const DebugPage = lazy(() => import('./pages/DebugPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

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
          {/*
            Layout-route pattern: every matched child route is rendered
            through <KeepAliveOutlet />, which caches each page's React
            element by pathname and keeps the previously visited pages
            mounted in the DOM (hidden). This preserves component state
            (form values, scroll position, query caches, animation
            playback) when the user navigates back and forth, instead of
            unmounting and remounting on every URL change.
          */}
          <Route element={<KeepAliveOutlet />}>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/wallets" element={<ProtectedRoute><Wallets /></ProtectedRoute>} />
            <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
            <Route path="/proxies" element={<ProtectedRoute><Proxies /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/airdrops" element={<ProtectedRoute><Airdrops /></ProtectedRoute>} />
            <Route path="/stats" element={<ProtectedRoute roles={['admin']}><Stats /></ProtectedRoute>} />
            <Route path="/scheduler" element={<ProtectedRoute><Scheduler /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute roles={['admin']}><Logs /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/debug" element={<ProtectedRoute roles={['admin', 'developer']}><DebugPage /></ProtectedRoute>} />
            <Route path="/quick-dev" element={<ProtectedRoute roles={['admin', 'developer']}><QuickDev /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute roles={['admin']}><UserManagement /></ProtectedRoute>} />
            <Route path="/admin/review" element={<ProtectedRoute roles={['admin']}><AdminReviewPage /></ProtectedRoute>} />
            <Route path="/developer/pending" element={<ProtectedRoute roles={['admin', 'developer']}><DeveloperPendingPage /></ProtectedRoute>} />
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
