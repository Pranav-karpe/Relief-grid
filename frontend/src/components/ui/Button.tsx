import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  loading?: boolean
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'rounded-xl bg-orange text-white border border-transparent hover:border-orange/60 active:border-orange shadow-sm shadow-orange-500/25 interactive-popup',
  secondary:
    'rounded-xl bg-surface-raised text-content border border-line hover:border-orange/50 active:border-orange shadow-xs interactive-popup',
  outline:
    'rounded-xl border border-line bg-transparent text-content hover:border-orange/50 hover:text-orange active:border-orange interactive-popup',
  danger:
    'rounded-xl bg-error text-white border border-transparent hover:opacity-95 active:scale-[0.98] interactive-popup',
  ghost:
    'rounded-xl bg-transparent text-muted hover:text-content hover:bg-surface-raised active:scale-[0.98]',
}

function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const label = loading ? (
    <span className="flex items-center gap-2">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
      Loading…
    </span>
  ) : children

  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`inline-flex min-h-11 items-center justify-center px-4.5 py-2.5 text-[15px] font-semibold transition-all duration-[180ms] ease-out focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {label}
    </button>
  )
}

export default Button
