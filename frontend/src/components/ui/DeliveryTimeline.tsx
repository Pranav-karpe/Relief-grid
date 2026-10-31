import type { TimelineEvent } from '../../api/reports'

export type DeliveryTimelineProps = {
  status: string
  timeline?: TimelineEvent[]
  className?: string
}

const STAGES = [
  { key: 'submitted', label: 'Report Submitted', desc: 'Disaster need registered' },
  { key: 'verified', label: 'Verified by Network', desc: 'Authenticated by operations' },
  { key: 'in_transit', label: 'Dispatched & Transit', desc: 'Field volunteer en route' },
  { key: 'delivered', label: 'Delivered & Confirmed', desc: 'Aid confirmed by NGO' },
]

export default function DeliveryTimeline({ status, timeline = [], className = '' }: DeliveryTimelineProps) {
  // Determine current active step index (0 to 3)
  let currentStepIndex = 0
  const hasInTransit = timeline.some((e) => e.stage === 'in_transit' || e.stage === 'assigned')
  const hasDelivered = status === 'resolved' || timeline.some((e) => e.stage === 'delivered')
  const isRejected = status === 'rejected'
  const isDisputed = timeline.some((e) => e.stage === 'disputed')

  if (hasDelivered) {
    currentStepIndex = 3
  } else if (hasInTransit) {
    currentStepIndex = 2
  } else if (status === 'verified' || status === 'under_review') {
    currentStepIndex = 1
  } else if (status === 'submitted') {
    currentStepIndex = 0
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Visual Stepper Bar */}
      <div className="relative">
        <div className="absolute top-4 left-6 right-6 h-0.5 bg-line -z-0" />
        <div
          className="absolute top-4 left-6 h-0.5 bg-accent transition-all duration-500 -z-0"
          style={{ width: `${Math.min(100, (currentStepIndex / (STAGES.length - 1)) * 100)}%` }}
        />

        <div className="relative z-10 flex justify-between">
          {STAGES.map((step, idx) => {
            const isCompleted = idx < currentStepIndex || (idx === currentStepIndex && currentStepIndex === 3)
            const isCurrent = idx === currentStepIndex && currentStepIndex < 3

            return (
              <div key={step.key} className="flex flex-col items-center text-center max-w-[100px]">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    isCompleted
                      ? 'bg-success text-white ring-4 ring-success/20'
                      : isCurrent
                        ? 'bg-accent text-white ring-4 ring-accent/30 animate-pulse'
                        : 'bg-surface-raised text-muted border border-line'
                  }`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span className={`mt-2 text-xs font-semibold ${isCompleted || isCurrent ? 'text-content' : 'text-muted'}`}>
                  {step.label}
                </span>
                <span className="hidden sm:inline mt-0.5 text-[10px] text-muted/70 leading-tight">
                  {step.desc}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Disputed or Rejected Banner if applicable */}
      {isRejected && (
        <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
          ⚠️ This relief report was rejected during review or flagged as invalid.
        </div>
      )}
      {isDisputed && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          ⚠️ NGO reported an issue or dispute during delivery confirmation. Support staff is investigating.
        </div>
      )}

      {/* Detailed Chronological Event Log */}
      {timeline.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Tracking History</h4>
          <ol className="relative border-l border-line ml-3 space-y-4">
            {timeline.map((event, idx) => (
              <li key={idx} className="ml-4">
                <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-surface bg-accent" />
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <span className="text-xs font-semibold text-content">{event.title}</span>
                  <time className="text-[10px] text-muted">{new Date(event.timestamp).toLocaleString()}</time>
                </div>
                {event.description && <p className="mt-1 text-xs text-muted leading-relaxed">{event.description}</p>}
                {event.actorRole && (
                  <span className="inline-block mt-1 text-[10px] uppercase font-bold text-accent/80 tracking-wider">
                    By {event.actorRole}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

