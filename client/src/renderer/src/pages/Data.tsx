/**
 * @file Data — 数据管理父页面
 * @description 统一入口，整合账户、代理、验证码和导入中心四个模块。
 *              每个 Tab 使用 CSS `display: none` 保持子组件状态，
 *              避免切换 Tab 时重新挂载。
 * @module renderer/pages
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Users, Globe, Key, Upload } from 'lucide-react'

import Accounts from './Accounts'
import Proxies from './Proxies'
import CaptchaPage from './Captcha'

/* ═══════════════════════════════════════════
   Tab type
   ═══════════════════════════════════════════ */

type DataTab = 'accounts' | 'proxies' | 'captcha' | 'import'

interface TabItem {
  key: DataTab
  icon: typeof Users
  labelKey: string
}

const TAB_ITEMS: TabItem[] = [
  { key: 'accounts', icon: Users, labelKey: 'nav.dataAccounts' },
  { key: 'proxies', icon: Globe, labelKey: 'nav.dataProxies' },
  { key: 'captcha', icon: Key, labelKey: 'nav.dataCaptcha' },
  { key: 'import', icon: Upload, labelKey: 'nav.dataImport' }
]

/** URL pathname → DataTab 映射 */
const PATH_TAB_MAP: Record<string, DataTab> = {
  '/data/accounts': 'accounts',
  '/data/proxies': 'proxies',
  '/data/captcha': 'captcha',
  '/data': 'accounts'
}

/** DataTab → URL pathname 映射（用于导航同步） */
const TAB_PATH_MAP: Record<DataTab, string> = {
  accounts: '/data/accounts',
  proxies: '/data/proxies',
  captcha: '/data/captcha',
  import: '/data'
}

/**
 * Data — 数据管理父页面
 *
 * 顶部 Tab 栏切换 4 个子模块，使用 CSS hidden 保持各子组件状态。
 * URL 路径同步：/data/accounts → accounts tab，/data/proxies → proxies tab，etc.
 */
export default function Data(): React.ReactElement {
  const { t } = useTranslation()
  const location = useLocation()

  /* ── Tab 状态 ── */
  const [activeTab, setActiveTab] = useState<DataTab>(() => {
    return PATH_TAB_MAP[location.pathname] ?? 'accounts'
  })

  /* ── URL → activeTab 同步 ── */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const tab = PATH_TAB_MAP[location.pathname]
    if (tab) {
      setActiveTab(tab)
    }
  }, [location.pathname])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ── Tab 切换 ── */
  const handleTabChange = useCallback((tab: DataTab) => {
    setActiveTab(tab)
    // 同步 URL（不触发页面刷新，使用 history.pushState/replaceState）
    const path = TAB_PATH_MAP[tab]
    window.history.replaceState(null, '', `#${path}`)
  }, [])

  return (
    <div className="space-y-4">
      {/* ── 页面标题 ── */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('data.title')}</h1>
        <p className="text-sm text-text-muted mt-1">{t('data.subtitle')}</p>
      </div>

      {/* ── Tab 栏 ── */}
      <div className="flex gap-2 border-b border-border-light pb-0">
        {TAB_ITEMS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
                activeTab === tab.key
                  ? 'text-primary border-primary bg-primary/5'
                  : 'text-text-muted border-transparent hover:text-text-secondary'
              }`}
            >
              <Icon size={16} />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════
          Tab 1: 账户
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'accounts' ? '' : 'hidden'}>
        <Accounts />
      </div>

      {/* ══════════════════════════════════════════
          Tab 2: 代理
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'proxies' ? '' : 'hidden'}>
        <Proxies />
      </div>

      {/* ══════════════════════════════════════════
          Tab 3: 验证码
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'captcha' ? '' : 'hidden'}>
        <CaptchaPage />
      </div>

      {/* ══════════════════════════════════════════
          Tab 4: 导入中心
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'import' ? '' : 'hidden'}>
        <ImportCenter />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   Tab 4: 导入中心（占位）
   ═══════════════════════════════════════════ */

/** 导入中心 — P9+ 阶段实际实现，当前为占位页 */
function ImportCenter(): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div className="bg-bg-card border border-border-light rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('data.import.title')}</h2>
        <p className="text-sm text-text-muted mt-1">{t('data.import.subtitle')}</p>
      </div>

      <div className="p-4 bg-bg-page rounded-lg border border-border-light text-sm text-text-muted space-y-3">
        <p>
          P9 阶段实现：统一的 CSV/JSON 导入中心。当前请在 Accounts 或 Proxies Tab 内使用各自的导入按钮。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          disabled
          className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border-light bg-bg-page text-text-muted text-sm cursor-not-allowed"
          title={t('data.import.accountsHint')}
        >
          <Upload size={16} />
          导入账户 (CSV)
        </button>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border-light bg-bg-page text-text-muted text-sm cursor-not-allowed"
          title={t('data.import.proxiesHint')}
        >
          <Upload size={16} />
          导入代理 (CSV)
        </button>
        <button
          disabled
          className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border-light bg-bg-page text-text-muted text-sm cursor-not-allowed"
          title={t('data.import.accountsHint')}
        >
          <Upload size={16} />
          导入验证码密钥 (JSON)
        </button>
      </div>
    </div>
  )
}
