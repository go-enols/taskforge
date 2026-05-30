import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Leaf, Minus, Square, Copy, X } from 'lucide-react'
import { windowApi } from '../api'
import ThemeToggle from './ThemeToggle'

const dragStyle = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

const TitleBar: React.FC = () => {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState<string>('')
  const [maximized, setMaximized] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    windowApi
      .platform()
      .then((p) => {
        if (!cancelled) setPlatform(p)
      })
      .catch(() => {})
    windowApi
      .isMaximized()
      .then((m) => {
        if (!cancelled) setMaximized(m)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const off = window.electronAPI?.on?.('window:maximizedChanged', (...args: unknown[]) => {
      setMaximized(Boolean(args[0]))
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  if (platform === 'darwin') {
    return (
      <header
        className="flex-shrink-0 flex items-center justify-end h-7 bg-bg-card border-b border-border-light px-2"
        style={dragStyle}
      >
        <div style={noDragStyle}>
          <ThemeToggle collapsed />
        </div>
      </header>
    )
  }

  const onMinimize = (): void => {
    void windowApi.minimize()
  }
  const onToggleMaximize = (): void => {
    void windowApi.toggleMaximize()
  }
  const onClose = (): void => {
    void windowApi.close()
  }

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between h-8 bg-bg-card border-b border-border-light select-none"
      style={dragStyle}
    >
      <div className="flex items-center gap-2 px-3">
        <Leaf size={14} className="text-primary" />
        <span className="text-xs font-semibold text-text-primary tracking-wide">Airdrop Farm</span>
      </div>
      <div className="flex items-center h-full" style={noDragStyle}>
        <div className="px-2" style={noDragStyle}>
          <ThemeToggle collapsed />
        </div>
        <button
          type="button"
          onClick={onMinimize}
          aria-label={t('window.minimize')}
          title={t('window.minimize')}
          className="flex items-center justify-center w-11 h-8 text-text-secondary hover:bg-bg-tertiary transition-colors"
          style={noDragStyle}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={onToggleMaximize}
          aria-label={maximized ? t('window.restore') : t('window.maximize')}
          title={maximized ? t('window.restore') : t('window.maximize')}
          className="flex items-center justify-center w-11 h-8 text-text-secondary hover:bg-bg-tertiary transition-colors"
          style={noDragStyle}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('window.close')}
          title={t('window.close')}
          className="flex items-center justify-center w-11 h-8 text-text-secondary hover:bg-danger hover:text-white transition-colors"
          style={noDragStyle}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}

export default TitleBar
