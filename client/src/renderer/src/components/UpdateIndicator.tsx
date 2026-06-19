/**
 * @file UpdateIndicator — 标题栏更新状态指示器
 * @description 在标题栏右侧显示更新状态 SVG 图标，点击触发更新检查并显示弹窗。
 *              支持 idle/checking/available/downloading/downloaded/error 六种状态。
 * @module renderer/components
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { updateApi, appApi } from '../api'
import UpdateProgressModal, {
  type UpdateStatus,
  type UpdateProgressData
} from './UpdateProgressModal'

/* ── SVG 元件 ── */

/** 下载箭头 SVG（idle / checking / not-available 共用） */
const DownloadArrowSvg: React.FC<{ spinning?: boolean }> = ({ spinning }) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
  >
    <path d="M3 15v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
    <path d="M10 3v8m0 0L7 8m3 3l3-3" />
  </svg>
)

/** 对勾 SVG（downloaded 态） */
const CheckSvg: React.FC = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4 text-green-500"
  >
    <path d="M5 10l3.5 3.5L15 7" />
  </svg>
)

/** 感叹号三角 SVG（error 态） */
const ErrorSvg: React.FC = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className="w-4 h-4 text-red-500"
  >
    <circle cx="10" cy="10" r="8" />
    <path d="M10 7v3M10 13.5v.01" strokeWidth="2" />
  </svg>
)

/** 环形进度 SVG（downloading 态） */
const ProgressSvg: React.FC<{ percent: number }> = ({ percent }) => {
  const r = 8
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(percent, 100) / 100)
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4">
      <circle
        cx="10" cy="10" r={r}
        fill="none" stroke="currentColor" strokeWidth="1.5"
        className="opacity-20"
      />
      <circle
        cx="10" cy="10" r={r}
        fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary"
        transform="rotate(-90 10 10)"
      />
    </svg>
  )
}

/* ── Badge 金点 ── */
const AvailableBadge: React.FC = () => (
  <circle cx="16" cy="6" r="3" fill="#fbbf24" className="drop-shadow-sm" />
)

/* ── 工具提示文案 ── */
const TOOLTIP_KEYS: Record<string, string> = {
  idle: 'updates.titleBar.idle',
  checking: 'updates.titleBar.checking',
  available: 'updates.titleBar.available',
  notAvailable: 'updates.titleBar.notAvailable',
  downloading: 'updates.titleBar.downloading',
  downloaded: 'updates.titleBar.downloaded',
  error: 'updates.titleBar.error'
}

/* ── 组件 ── */

const UpdateIndicator: React.FC = () => {
  const { t } = useTranslation()
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [updateError, setUpdateError] = useState('')
  const [progress, setProgress] = useState<UpdateProgressData>({
    percent: 0,
    transferred: 0,
    total: 0
  })
  const [currentAppVersion, setCurrentAppVersion] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  /* ── 订阅更新事件 ── */
  useEffect(() => {
    appApi
      .getInfo()
      .then((info) => {
        if (info?.version) setCurrentAppVersion(info.version)
      })
      .catch(() => {
        /* best-effort */
      })

    const unsub = updateApi.onStatus((event) => {
      setUpdateStatus(event.status)
      if (event.status === 'available' && 'data' in event) {
        setUpdateInfo(event.data as { version: string })
      }
      if (event.status === 'downloading' && 'data' in event) {
        setProgress(event.data as UpdateProgressData)
      }
      if (event.status === 'downloaded' && 'data' in event) {
        setUpdateInfo(event.data as { version: string })
      }
      if (event.status === 'error' && 'data' in event) {
        setUpdateError(event.data as string)
      }
      if (event.status === 'not-available') {
        setUpdateInfo(null)
        setProgress({ percent: 0, transferred: 0, total: 0 })
      }
    })
    return unsub
  }, [])

  /* ── 操作 ── */

  const checkUpdates = async (): Promise<void> => {
    setUpdateStatus('checking')
    setUpdateError('')
    setUpdateInfo(null)
    setProgress({ percent: 0, transferred: 0, total: 0 })
    setModalOpen(true)
    try {
      await updateApi.check()
    } catch {
      setUpdateStatus('error')
      setUpdateError(t('common.error'))
    }
  }

  const downloadUpdate = async (): Promise<void> => {
    setUpdateError('')
    try {
      await updateApi.download()
    } catch {
      setUpdateStatus('error')
      setUpdateError(t('common.error'))
    }
  }

  const installUpdate = async (): Promise<void> => {
    try {
      await updateApi.install()
    } catch (err: unknown) {
      console.warn('[UpdateIndicator] update:install failed:', err)
    }
  }

  const openModal = (): void => {
    setModalOpen(true)
  }

  const closeModal = (): void => {
    setModalOpen(false)
  }

  /* ── 点击行为 ── */
  const handleClick = (): void => {
    switch (updateStatus) {
      case 'idle':
      case 'not-available':
      case 'error':
        void checkUpdates()
        break
      case 'available':
      case 'downloading':
      case 'downloaded':
        openModal()
        break
      case 'checking':
        // checking 状态不响应点击
        break
      default:
        void checkUpdates()
    }
  }

  /* ── 渲染 SVG ── */
  const renderIcon = (): React.ReactNode => {
    switch (updateStatus) {
      case 'checking':
        return <DownloadArrowSvg spinning />
      case 'available':
        return (
          <span className="relative inline-flex">
            <DownloadArrowSvg />
            <AvailableBadge />
          </span>
        )
      case 'downloading':
        return <ProgressSvg percent={progress.percent} />
      case 'downloaded':
        return <CheckSvg />
      case 'error':
        return <ErrorSvg />
      case 'not-available':
        return <DownloadArrowSvg />
      default:
        return <DownloadArrowSvg />
    }
  }

  /* ── tooltip key ── */
  const tooltipKey = ((): string => {
    if (updateStatus === 'not-available') return TOOLTIP_KEYS.notAvailable
    return TOOLTIP_KEYS[updateStatus] || TOOLTIP_KEYS.idle
  })()

  const isDisabled = updateStatus === 'checking'

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        title={tooltipKey ? t(tooltipKey) : ''}
        aria-label={t(tooltipKey)}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors focus-ring ${
          isDisabled
            ? 'cursor-default opacity-60'
            : 'cursor-pointer hover:bg-bg-tertiary text-text-secondary hover:text-primary'
        }`}
      >
        {renderIcon()}
      </button>

      <UpdateProgressModal
        open={modalOpen}
        status={updateStatus}
        version={updateInfo?.version}
        currentVersion={currentAppVersion}
        progress={progress}
        errorMessage={updateError || undefined}
        onClose={closeModal}
        onDownload={downloadUpdate}
        onInstall={installUpdate}
        onRetry={checkUpdates}
      />
    </>
  )
}

export default UpdateIndicator
