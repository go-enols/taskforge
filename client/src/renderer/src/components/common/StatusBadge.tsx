import React from 'react'

interface StatusBadgeProps {
  status: string
  colorMap: Record<string, string>
  defaultColor?: string
  label?: React.ReactNode
  children?: React.ReactNode
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  colorMap,
  defaultColor = 'bg-status-idle-bg text-status-idle-text',
  label,
  children
}) => {
  const hasChildren = !!children
  return (
    <span
      className={`${hasChildren ? 'inline-flex items-center gap-1.5' : 'inline-block'} px-2 py-0.5 text-xs rounded-full font-medium ${colorMap[status] || defaultColor}`}
    >
      {children}
      {label ?? status}
    </span>
  )
}

export default StatusBadge
