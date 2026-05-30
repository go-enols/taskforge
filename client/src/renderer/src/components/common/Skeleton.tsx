import React from 'react'

interface SkeletonProps {
  className?: string
  lines?: number
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', lines = 1 }) => {
  if (lines === 1) {
    return (
      <div
        className={`animate-pulse-skeleton rounded bg-bg-tertiary ${className}`}
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse-skeleton rounded bg-bg-tertiary ${className}`}
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

export default Skeleton
