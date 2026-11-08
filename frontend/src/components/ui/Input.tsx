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
    <div className="grid gap-2">
      <label className="text-[15.5px] font-semibold text-content tracking-tight" htmlFor={inputId}>
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={`min-h-11 w-full rounded-xl border border-line bg-surface-raised px-4 py-2.5 text-[15.5px] text-content placeholder:text-muted/80 transition-all duration-200 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30 focus:shadow-[0_0_14px_rgba(249,115,22,0.22)] ${error ? '!border-error' : ''} ${rightSlot ? 'pr-11' : ''} ${className}`}
        />
        {rightSlot && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
            {rightSlot}
          </div>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-error font-medium" role="alert">{error}</p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export default Input
