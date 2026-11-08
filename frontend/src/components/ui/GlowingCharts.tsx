import { useState } from 'react'

// ---------------------------------------------------------------------------
// 1. Glowing Metric Card
// ---------------------------------------------------------------------------

export type GlowingMetricCardProps = {
  title: string
  value: string | number
  subtitle?: string
  icon?: string
  trend?: {
    label: string
    positive?: boolean
  }
  tone?: 'orange' | 'emerald' | 'blue' | 'purple' | 'amber' | 'neutral' | 'warning'
  onClick?: () => void
}

const TONE_STYLES = {
  orange: {
    border: 'border-orange/30 hover:border-orange/70',
    glow: 'rgba(249, 115, 22, 0.22)',
    text: 'text-orange',
    bg: 'bg-orange/10',
  },
  emerald: {
    border: 'border-emerald-500/30 hover:border-emerald-500/70',
    glow: 'rgba(16, 185, 129, 0.22)',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  blue: {
    border: 'border-blue-500/30 hover:border-blue-500/70',
    glow: 'rgba(59, 130, 246, 0.22)',
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  purple: {
    border: 'border-purple-500/30 hover:border-purple-500/70',
    glow: 'rgba(168, 85, 247, 0.22)',
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  amber: {
    border: 'border-amber-500/30 hover:border-amber-500/70',
    glow: 'rgba(245, 158, 11, 0.22)',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  warning: {
    border: 'border-amber-500/30 hover:border-amber-500/70',
    glow: 'rgba(245, 158, 11, 0.22)',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  neutral: {
    border: 'border-line hover:border-line/90',
    glow: 'rgba(255, 255, 255, 0.05)',
    text: 'text-content',
    bg: 'bg-surface-raised',
  },
}

export function GlowingMetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  tone = 'orange',
  onClick,
}: GlowingMetricCardProps) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.orange

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border ${styles.border} bg-surface p-5 sm:p-6 transition-all duration-200 shadow-card ${
        onClick ? 'cursor-pointer hover:-translate-y-1' : ''
      }`}
      style={{
        boxShadow: `0 4px 20px -2px ${styles.glow}`,
      }}
    >
      {/* Top ambient radial glow */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full blur-2xl opacity-40 transition-opacity group-hover:opacity-75"
        style={{ background: styles.glow }}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <span className="type-card-heading text-muted">{title}</span>
        {icon && (
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${styles.bg} ${styles.text}`}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="relative z-10 mt-3 flex items-baseline gap-3">
        <span className="type-metric text-content font-mono">{value}</span>
        {trend && (
          <span
            className={`inline-flex items-center text-xs font-bold ${
              trend.positive ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {trend.positive ? '↑' : '↓'} {trend.label}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="relative z-10 mt-1.5 type-sm text-muted">{subtitle}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Glowing Bar Chart (Comparative Distributions)
// ---------------------------------------------------------------------------

export type BarChartItem = {
  label: string
  value: number
  color?: string
}

export function GlowingBarChart({
  data,
  maxValue,
  unit = '',
  height = 200,
}: {
  data: BarChartItem[]
  maxValue?: number
  unit?: string
  height?: number
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const calculatedMax = maxValue || Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="w-full space-y-3">
      {/* Chart Canvas */}
      <div
        className="flex items-end justify-between gap-3 sm:gap-6 pt-6 pb-2 px-2"
        style={{ height }}
      >
        {data.map((item, idx) => {
          const heightPercent = Math.min(Math.round((item.value / calculatedMax) * 100), 100)
          const isHovered = hoveredIdx === idx

          return (
            <div
              key={item.label}
              className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute -top-10 z-20 bg-surface-raised border border-orange/50 px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-lg pointer-events-none whitespace-nowrap animate-fade-up">
                  {item.value} {unit}
                </div>
              )}

              {/* Glowing Bar */}
              <div
                className="w-full max-w-[42px] rounded-t-lg transition-all duration-300 relative overflow-hidden"
                style={{
                  height: `${heightPercent}%`,
                  background:
                    item.color ||
                    'linear-gradient(to top, rgba(234, 88, 12, 0.8), rgba(249, 115, 22, 1))',
                  boxShadow: isHovered
                    ? '0 0 20px rgba(249, 115, 22, 0.6), inset 0 1px 0 rgba(255,255,255,0.4)'
                    : '0 0 12px rgba(249, 115, 22, 0.25)',
                }}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Bar Value on Top (static small) */}
              <span className="text-[12px] font-bold text-muted/90 mt-1.5 tabular-nums">
                {item.value}
              </span>
            </div>
          )
        })}
      </div>

      {/* X-Axis Labels */}
      <div className="flex justify-between gap-2 border-t border-line/60 pt-2 px-2 text-center">
        {data.map((item) => (
          <span
            key={item.label}
            className="flex-1 text-[13px] font-semibold text-muted truncate"
            title={item.label}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. Glowing Donut Chart (Segment Breakdown)
// ---------------------------------------------------------------------------

export type DonutSegment = {
  label: string
  value: number
  color: string
}

export function GlowingDonutChart({
  segments,
  centerTitle,
  centerLabel,
  centerValue,
  size = 190,
}: {
  segments: DonutSegment[]
  centerTitle?: string
  centerLabel?: string
  centerValue?: string | number
  size?: number
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  const strokeWidth = 24
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const titleText = centerTitle || centerLabel

  let accumulatedPercent = 0

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
      {/* SVG Donut */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={strokeWidth}
          />
          {segments.map((seg) => {
            const percent = total > 0 ? seg.value / total : 0
            const strokeDasharray = `${percent * circumference} ${circumference}`
            const strokeDashoffset = -accumulatedPercent * circumference
            accumulatedPercent += percent

            if (seg.value === 0) return null

            return (
              <circle
                key={seg.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500 hover:opacity-85"
                style={{
                  filter: `drop-shadow(0 0 6px ${seg.color}66)`,
                }}
              />
            )
          })}
        </svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-2xl sm:text-3xl font-extrabold text-content tabular-nums tracking-tight">
            {centerValue !== undefined ? centerValue : total}
          </span>
          {titleText && (
            <span className="text-xs font-semibold uppercase tracking-wider text-muted mt-0.5">
              {titleText}
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 w-full space-y-2.5">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
          return (
            <div
              key={seg.label}
              className="flex items-center justify-between gap-3 text-[14.5px] p-2 rounded-xl bg-surface-raised/40 border border-line/50"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs"
                  style={{
                    backgroundColor: seg.color,
                    boxShadow: `0 0 8px ${seg.color}`,
                  }}
                />
                <span className="truncate text-content font-medium">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-content font-mono">{seg.value}</span>
                <span className="text-xs text-muted/80">({pct}%)</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. Glowing Progress Meter
// ---------------------------------------------------------------------------

export function GlowingProgressMeter({
  label,
  value,
  current,
  total,
  unit = '',
  color = '#f97316',
}: {
  label: string
  value?: number
  current?: number
  total: number
  unit?: string
  color?: string
}) {
  const actualVal = value !== undefined ? value : current ?? 0
  const percentage = Math.min(Math.round(total > 0 ? (actualVal / total) * 100 : 0), 100)

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-[14.5px]">
        <span className="font-semibold text-content">{label}</span>
        <span className="font-mono text-sm text-muted">
          <strong className="text-content font-bold">{actualVal}</strong> / {total} {unit} ({percentage}%)
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-surface-raised overflow-hidden border border-line/60 p-0.5">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: color,
            boxShadow: `0 0 12px ${color}88`,
          }}
        />
      </div>
    </div>
  )
}
