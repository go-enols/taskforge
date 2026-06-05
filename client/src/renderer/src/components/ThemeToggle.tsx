/**
 * @file ThemeToggle — 主题切换组件
 * @description 提供"自动 / 亮色 / 暗色"三种主题模式的切换 UI。
 *              折叠模式时只显示当前主题图标按钮，循环切换三种模式。
 *              展开模式时显示三按钮的 radio group 样式选择器。
 * @module renderer/components
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme, type ThemePref } from '../hooks/useTheme'

interface Props {
  /** 是否使用折叠模式（仅显示当前主题图标） */
  collapsed?: boolean
}

/**
 * ThemeToggle — 主题切换组件
 *
 * 根据 collapsed 参数渲染两种形态：
 * - collapsed=true：单一图标按钮，点击循环切换 auto → light → dark
 * - collapsed=false：三按钮 radio group 样式，直接选择目标主题
 *
 * @param collapsed - 是否折叠模式
 */
const ThemeToggle: React.FC<Props> = ({ collapsed = false }) => {
  const { t } = useTranslation()
  const { pref, setPref } = useTheme()

  // 三种主题选项配置
  const options: Array<{
    value: ThemePref
    icon: React.ComponentType<{ size?: number }>
    label: string
  }> = [
    { value: 'auto', icon: Monitor, label: t('settings.themeAuto') },
    { value: 'light', icon: Sun, label: t('settings.themeLight') },
    { value: 'dark', icon: Moon, label: t('settings.themeDark') }
  ]

  // 折叠模式：循环切换主题
  if (collapsed) {
    const current = options.find((o) => o.value === pref) ?? options[0]
    const CurrentIcon = current.icon
    /** 循环切换到下一个主题选项 */
    const next = (): void => {
      const idx = options.findIndex((o) => o.value === pref)
      const nextPref = options[(idx + 1) % options.length].value
      setPref(nextPref)
    }
    return (
      <button
        onClick={next}
        aria-label={current.label}
        className="flex items-center justify-center w-full p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary transition-colors focus-ring"
        title={`${t('settings.theme')}: ${current.label}`}
      >
        <CurrentIcon size={16} />
      </button>
    )
  }

  // 展开模式：三按钮 radio group
  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-tertiary border border-border-light"
      role="radiogroup"
      aria-label={t('settings.theme')}
    >
      {options.map(({ value, icon: Icon, label }) => {
        const active = pref === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setPref(value)}
            className={`flex items-center justify-center flex-1 px-2 py-1 rounded-md text-xs transition-all focus-ring ${
              active
                ? 'bg-bg-card text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            title={label}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}

export default ThemeToggle
