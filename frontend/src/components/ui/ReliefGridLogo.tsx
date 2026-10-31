import { useId, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

type LogoSize = 'sm' | 'md' | 'lg' | 'xl'

type Props = {
  size?: LogoSize
  iconOnly?: boolean
  className?: string
  /** Disable animations (e.g. mobile drawer during nav) */
  static?: boolean
  /** Wrap in a link — pass the destination path */
  linkTo?: string
}

const sizes: Record<LogoSize, { icon: number; textClass: string; gap: string }> = {
  sm: { icon: 26, textClass: 'text-[15px] font-bold tracking-tight', gap: 'gap-2' },
  md: { icon: 34, textClass: 'text-[19px] font-extrabold tracking-tight', gap: 'gap-2.5' },
  lg: { icon: 40, textClass: 'text-xl sm:text-2xl font-extrabold tracking-tight', gap: 'gap-2.5 sm:gap-3' },
  xl: { icon: 48, textClass: 'text-2xl sm:text-3xl font-extrabold tracking-tight', gap: 'gap-3.5' },
}

const RELIEF = 'Relief'.split('')
const GRID   = 'Grid'.split('')

function WordmarkLetters({ isStatic }: { isStatic: boolean }) {
  const [settled, setSettled] = useState(isStatic)

  useEffect(() => {
    if (isStatic || settled) return
    const timer = setTimeout(() => {
      setSettled(true)
    }, 600)
    return () => clearTimeout(timer)
  }, [isStatic, settled])

  if (isStatic || settled) {
    return (
      <span
        className="font-extrabold tracking-tight logo-wordmark logo-continuous-glow inline-block select-none"
        style={{ color: 'var(--color-text)' }}
      >
        Relief<span className="font-extrabold" style={{ color: 'var(--color-orange)' }}>Grid</span>
      </span>
    )
  }

  return (
    <span
      className="font-extrabold tracking-tight logo-wordmark logo-continuous-glow inline-flex items-center select-none"
      aria-label="ReliefGrid"
      role="text"
    >
      {RELIEF.map((ch, i) => (
        <span
          key={`r${i}`}
          className="logo-letter"
          style={{
            color: 'var(--color-text)',
            animationDelay: `${(0.04 + i * 0.03).toFixed(3)}s`,
          }}
          aria-hidden="true"
        >
          {ch}
        </span>
      ))}
      {GRID.map((ch, i) => (
        <span
          key={`g${i}`}
          className="logo-letter"
          style={{
            color: 'var(--color-orange)',
            animationDelay: `${(0.04 + (RELIEF.length + i) * 0.03).toFixed(3)}s`,
          }}
          aria-hidden="true"
        >
          {ch}
        </span>
      ))}
    </span>
  )
}

function LogoIcon({ size, isStatic, filterId }: { size: number; isStatic: boolean; filterId: string }) {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${
        isStatic ? 'logo-icon-static' : 'logo-icon-animated logo-continuous-glow'
      }`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
        className="relative z-10"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect width="32" height="32" rx="7" fill="var(--color-surface)" />
        <rect width="32" height="32" rx="7" fill="var(--color-page)" fillOpacity="0.5" />
        <line x1="10" y1="4"  x2="10" y2="28" stroke="#F97316" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="16" y1="4"  x2="16" y2="28" stroke="#F97316" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="22" y1="4"  x2="22" y2="28" stroke="#F97316" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="4"  y1="10" x2="28" y2="10" stroke="#F97316" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="4"  y1="16" x2="28" y2="16" stroke="#F97316" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="4"  y1="22" x2="28" y2="22" stroke="#F97316" strokeWidth="0.6" strokeOpacity="0.2" />
        <line x1="10" y1="10" x2="16" y2="16" stroke="#F97316" strokeWidth="1.5" strokeOpacity="0.65" />
        <line x1="22" y1="10" x2="16" y2="16" stroke="#F97316" strokeWidth="1.5" strokeOpacity="0.65" />
        <line x1="10" y1="22" x2="16" y2="16" stroke="#F97316" strokeWidth="1.5" strokeOpacity="0.65" />
        <line x1="22" y1="22" x2="16" y2="16" stroke="#F97316" strokeWidth="1.5" strokeOpacity="0.65" />
        <circle cx="10" cy="10" r="2.2" fill="#60A5FA" />
        <circle cx="22" cy="10" r="2.2" fill="#60A5FA" />
        <circle cx="10" cy="22" r="2.2" fill="#60A5FA" />
        <circle cx="22" cy="22" r="2.2" fill="#60A5FA" />
        <circle cx="16" cy="16" r="5.5" fill="#F97316" fillOpacity="0.1" />
        <circle cx="16" cy="16" r="2.8" fill="#F97316" />
      </svg>
    </div>
  )
}

export default function ReliefGridLogo({
  size = 'md',
  iconOnly = false,
  className = '',
  static: isStatic = false,
  linkTo,
}: Props) {
  const s = sizes[size]
  const filterId = useId().replace(/:/g, '')

  const content = (
    <>
      <LogoIcon size={s.icon} isStatic={isStatic} filterId={filterId} />
      {!iconOnly && (
        <span className={`${s.textClass} transition-colors duration-150`}>
          <WordmarkLetters isStatic={isStatic} />
        </span>
      )}
    </>
  )

  if (linkTo) {
    return (
      <Link
        to={linkTo}
        aria-label="ReliefGrid home"
        className={`group inline-flex items-center ${s.gap} ${className} rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {content}
      </Link>
    )
  }

  return (
    <span
      className={`group inline-flex items-center ${s.gap} ${className}`}
      aria-label={iconOnly ? 'ReliefGrid' : undefined}
    >
      {content}
    </span>
  )
}
