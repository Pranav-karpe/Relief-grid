import { useState } from 'react'
import { AuthApiError } from '../../api/auth'
import { submitNgoVerification, type NgoVerification, type NgoProfile } from '../../api/ngo'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

type BadgeTone = 'neutral' | 'warning' | 'success' | 'error'

const STATUS_TONE: Record<string, BadgeTone> = {
  not_submitted: 'neutral',
  pending: 'warning',
  verified: 'success',
  rejected: 'error',
}

const STATUS_LABEL: Record<string, string> = {
  not_submitted: 'Not submitted',
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
}

type Props = {
  token: string
  profile: NgoProfile
  verification: NgoVerification | null
  onSubmitted: (v: NgoVerification) => void
}

export default function NgoVerificationSection({ token, profile, verification, onSubmitted }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileStatus = profile.organizationProfile?.verificationStatus ?? 'not_submitted'
  const verStatus = verification?.status ?? null
  const tone = STATUS_TONE[profileStatus] ?? 'neutral'
  const label = STATUS_LABEL[profileStatus] ?? profileStatus

  // Can submit if: no pending record exists and not already verified
  const canSubmit = verStatus !== 'pending' && profileStatus !== 'verified'
  const hasOrgName = Boolean(profile.organizationProfile?.name?.trim())

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const record = await submitNgoVerification(token)
      onSubmitted(record)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not submit verification. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <SectionHeading
        title="Verification status"
        description="Verification is required before accessing NGO coordination features."
        supportingContent={<Badge tone={tone}>{label}</Badge>}
      />

      <div className="mt-4 grid gap-3 text-sm">
        {verification && (
          <dl className="grid gap-2">
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Submitted</dt>
              <dd className="text-content">{new Date(verification.createdAt).toLocaleDateString()}</dd>
            </div>
            {verification.reviewedAt && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Reviewed</dt>
                <dd className="text-content">{new Date(verification.reviewedAt).toLocaleDateString()}</dd>
              </div>
            )}
            {verification.reason && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Feedback</dt>
                <dd className="text-content">{verification.reason}</dd>
              </div>
            )}
          </dl>
        )}

        {profileStatus === 'not_submitted' && !verification && (
          <p className="text-muted">Submit your organisation profile for review to begin the verification process.</p>
        )}
        {verStatus === 'pending' && (
          <p className="text-muted">Your verification request is under review. You will be notified when a decision is made.</p>
        )}
        {profileStatus === 'verified' && (
          <p className="text-muted">Your organisation is verified.</p>
        )}
        {profileStatus === 'rejected' && (
          <p className="text-muted">Your verification was not approved. Review the feedback above and resubmit.</p>
        )}

        {error && (
          <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
            {error}
          </p>
        )}

        {canSubmit && (
          <div className="mt-1">
            {!hasOrgName && (
              <p className="mb-2 text-xs text-warning">Set your organisation name in the profile section before submitting.</p>
            )}
            <Button onClick={handleSubmit} loading={loading} disabled={loading || !hasOrgName}>
              {verStatus === 'rejected' ? 'Resubmit for verification' : 'Submit for verification'}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted">
          Note: Verification approval is performed by platform administrators and is not available in this phase.
        </p>
      </div>
    </Card>
  )
}
