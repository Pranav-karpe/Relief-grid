import type { ReactNode } from 'react'

type SectionHeadingProps = {
  title: string
  description?: string
  supportingContent?: ReactNode
}

function SectionHeading({ title, description, supportingContent }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h2 className="type-dash-section text-content">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {supportingContent}
    </div>
  )
}

export default SectionHeading
