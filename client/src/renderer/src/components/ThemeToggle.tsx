import React from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme, type ThemePref } from '../hooks/useTheme'

interface Props {
  collapsed?: boolean
}

const ThemeToggle: React.FC<Props> = ({ collapsed = false }) => {
  const { t } = useTranslation()
  const { pref, setPref } = useTheme()

  const options: Array<{
    value: ThemePref
    icon: React.ComponentType<{ size?: number }>
    label: string
  }> = [
    { value: 'auto', icon: Monitor, label: t('settings.themeAuto') },
    { value: 'light', icon: Sun, label: t('settings.themeLight') },
    { value: 'dark', icon: Moon, label: t('settings.themeDark') }
  ]

  if (collapsed) {
    const current = options.find((o) => o.value === pref) ?? options[0]
    const CurrentIcon = current.icon
    const next = (): void => {
      const idx = options.findIndex((o) => o.value === pref)
      const nextPref = options[(idx + 1) % options.length].value
      setPref(nextPref)
    }
    return (
      <button
        onClick={next}
        aria-label={current.label}
        className="flex items-center justify-center w-full p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary transition-colors"
        title={`${t('settings.theme')}: ${current.label}`}
      >
        <CurrentIcon size={16} />
      </button>
    )
  }

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
            className={`flex items-center justify-center flex-1 px-2 py-1 rounded-md text-xs transition-all ${
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
