/**
 * @file TitleBar — 自定义窗口标题栏
 * @description Electron 自定义标题栏，替换原生窗口标题栏。
 *              支持 macOS（仅显示主题切换）和 Windows/Linux（显示应用名 + 窗口控制按钮）。
 *              窗口控制按钮通过 windowApi 调用来最小化/最大化/关闭窗口。
 * @module renderer/components
 */
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Leaf, Minus, Square, Copy, X } from 'lucide-react'
import { windowApi } from '../api'
import { toastError } from '../utils/toast'
import ThemeToggle from './ThemeToggle'

/** 窗口可拖拽区域样式（macOS 标题栏可拖拽移动窗口） */
const dragStyle = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
/** 窗口不可拖拽区域样式（按钮点击区域） */
const noDragStyle = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

/**
 * TitleBar — 自定义窗口标题栏组件
 *
 * 根据操作系统平台渲染不同布局：
 * - macOS：仅显示右侧的主题切换按钮
 * - Windows/Linux：左侧显示应用图标和名称 + 右侧主题切换 + 最小化/最大化/关闭按钮
 *
 * 通过 windowApi 与 Electron 主进程通信执行窗口操作。
 *
 * Props:
 * - dark?: boolean — 启用深色透明样式，适用于全屏深色背景页面（如登录页）
 */
const TitleBar: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState<string>('')
  const [maximized, setMaximized] = useState<boolean>(false)

  // 加载平台信息和窗口最大化状态
  useEffect(() => {
    let cancelled = false
    windowApi
      .platform()
      .then((p) => {
        if (!cancelled) setPlatform(p)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // API 调用失败时默认为 win32 平台
          setPlatform('win32')
          toastError(err instanceof Error ? err.message : t('common.error'))
        }
      })
    windowApi
      .isMaximized()
      .then((m) => {
        if (!cancelled) setMaximized(m)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // API 调用失败时默认未最大化
          setMaximized(false)
          toastError(err instanceof Error ? err.message : t('common.error'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [t])

  // 监听窗口最大化状态变化事件
  useEffect(() => {
    const off = window.electronAPI?.on?.('window:maximizedChanged', (...args: unknown[]) => {
      setMaximized(Boolean(args[0]))
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  // macOS 平台：仅显示主题切换按钮
  if (platform === 'darwin') {
    return (
      <header
        className={`flex-shrink-0 flex items-center justify-end h-7 px-2 ${
          dark
            ? 'bg-[#0a0a14]/60 backdrop-blur-md border-b border-white/5'
            : 'bg-bg-card border-b border-border-light'
        }`}
        style={dragStyle}
      >
        <div style={noDragStyle}>
          <ThemeToggle collapsed />
        </div>
      </header>
    )
  }

  /** 最小化窗口 */
  const onMinimize = (): void => {
    void windowApi.minimize()
  }
  /** 切换窗口最大化/还原 */
  const onToggleMaximize = (): void => {
    void windowApi.toggleMaximize()
  }
  /** 关闭窗口 */
  const onClose = (): void => {
    void windowApi.close()
  }

  // Windows/Linux 平台：完整标题栏
  return (
    <header
      className={`flex-shrink-0 flex items-center justify-between h-8 select-none ${
        dark
          ? 'bg-[#0a0a14]/60 backdrop-blur-md border-b border-white/5'
          : 'bg-bg-card border-b border-border-light'
      }`}
      style={dragStyle}
    >
      {/* 左侧：应用图标和名称 */}
      <div className="flex items-center gap-2 px-3">
        {dark ? (
          <div className="w-3.5 h-3.5 rounded-md bg-gradient-to-br from-primary via-purple-500 to-pink-500 shadow-sm shadow-primary/30" />
        ) : (
          <Leaf size={14} className="text-primary" />
        )}
        <span
          className={`text-xs font-semibold tracking-wide ${
            dark ? 'text-white/80' : 'text-text-primary'
          }`}
        >
          TaskForge
        </span>
      </div>

      {/* 右侧：主题切换 + 窗口控制按钮 */}
      <div className="flex items-center h-full" style={noDragStyle}>
        <div className="px-2" style={noDragStyle}>
          <ThemeToggle collapsed />
        </div>
        {/* 最小化按钮 */}
        <button
          type="button"
          onClick={onMinimize}
          aria-label={t('window.minimize')}
          title={t('window.minimize')}
          className={`flex items-center justify-center w-11 h-8 transition-colors focus-ring ${
            dark
              ? 'text-white/60 hover:bg-white/10 hover:text-white'
              : 'text-text-secondary hover:bg-bg-tertiary'
          }`}
          style={noDragStyle}
        >
          <Minus size={14} />
        </button>
        {/* 最大化/还原按钮 */}
        <button
          type="button"
          onClick={onToggleMaximize}
          aria-label={maximized ? t('window.restore') : t('window.maximize')}
          title={maximized ? t('window.restore') : t('window.maximize')}
          className={`flex items-center justify-center w-11 h-8 transition-colors focus-ring ${
            dark
              ? 'text-white/60 hover:bg-white/10 hover:text-white'
              : 'text-text-secondary hover:bg-bg-tertiary'
          }`}
          style={noDragStyle}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('window.close')}
          title={t('window.close')}
          className={`flex items-center justify-center w-11 h-8 transition-colors focus-ring ${
            dark
              ? 'text-white/60 hover:bg-danger hover:text-white'
              : 'text-text-secondary hover:bg-danger hover:text-white'
          }`}
          style={noDragStyle}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}

export default TitleBar
