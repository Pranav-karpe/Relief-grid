import type { HTMLAttributes, ReactNode } from 'react'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
  children: ReactNode
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-raised text-muted',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  error:   'border-error/30 bg-error/10 text-error',
  info:    'border-info/30 bg-info/10 text-info',
}

function Badge({ tone = 'neutral', children, className = '', ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-semibold tracking-wide ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export default Badge
