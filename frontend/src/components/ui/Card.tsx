import type { HTMLAttributes, ReactNode } from 'react'

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  /** Enable the 3px hover-lift effect. Default: false. */
  hover?: boolean
  /** Use compact padding (18px) for dense layouts. Default: false. */
  compact?: boolean
}

function Card({ children, className = '', hover = false, compact = false, ...props }: CardProps) {
  const padding = compact ? 'p-[var(--card-padding-sm)]' : 'p-[var(--card-padding)]'
  const hoverClass = hover ? 'card-hover' : ''

  return (
    <article
      {...props}
      className={`rounded-[var(--card-radius)] border border-line bg-surface ${padding} ${hoverClass} ${className}`}
      style={{ boxShadow: 'var(--shadow-card)', ...(props.style ?? {}) }}
    >
      {children}
    </article>
  )
}

export default Card
