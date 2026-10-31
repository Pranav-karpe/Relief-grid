import type { InputHTMLAttributes, ReactNode } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  rightSlot?: ReactNode
}

function Input({ label, hint, error, id, className = '', rightSlot, ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium text-content" htmlFor={inputId}>
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={`min-h-10 w-full rounded-xl border border-line bg-surface-raised px-3.5 text-content placeholder:text-muted transition-all duration-200 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30 focus:shadow-[0_0_12px_rgba(249,115,22,0.18)] ${error ? '!border-error' : ''} ${rightSlot ? 'pr-10' : ''} ${className}`}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {rightSlot}
          </div>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-error" role="alert">{error}</p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export default Input
