import { useState } from 'react'
import { AuthApiError } from '../../api/auth'
import { getNgoProfile, patchNgoProfile, type NgoProfile } from '../../api/ngo'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Input from '../ui/Input'
import Button from '../ui/Button'

type Props = {
  token: string
  profile: NgoProfile
  onUpdated: (profile: NgoProfile) => void
}

export default function NgoProfileSection({ token, profile, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [orgName, setOrgName] = useState(profile.organizationProfile?.name ?? '')
  const [regNumber, setRegNumber] = useState(profile.organizationProfile?.registrationNumber ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function startEdit() {
    setDisplayName(profile.displayName)
    setOrgName(profile.organizationProfile?.name ?? '')
    setRegNumber(profile.organizationProfile?.registrationNumber ?? '')
    setError(null)
    setFieldErrors({})
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setError(null)
    setFieldErrors({})
  }

  async function handleSave() {
    const errs: Record<string, string> = {}
    if (displayName.trim().length < 2) errs.displayName = 'Display name must be at least 2 characters.'
    if (orgName.trim().length === 0) errs.orgName = 'Organisation name is required.'
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setLoading(true)
    setError(null)
    setFieldErrors({})
    try {
      const updated = await patchNgoProfile(token, {
        displayName: displayName.trim(),
        organizationProfile: {
          name: orgName.trim(),
          ...(regNumber.trim() ? { registrationNumber: regNumber.trim() } : {}),
        },
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    try {
      const fresh = await getNgoProfile(token)
      onUpdated(fresh)
    } catch { /* silently ignore */ }
  }

  return (
    <Card>
      <SectionHeading
        title="Organisation profile"
        description="Keep your organisation details up to date before submitting for verification."
        supportingContent={!editing ? <Button variant="secondary" onClick={startEdit}>Edit profile</Button> : null}
      />

      {!editing ? (
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Display name</dt>
            <dd className="font-medium text-content">{profile.displayName}</dd>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Email</dt>
            <dd className="text-content">{profile.email}</dd>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Organisation name</dt>
            <dd className="text-content">{profile.organizationProfile?.name ?? <span className="italic text-muted">Not set</span>}</dd>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Registration no.</dt>
            <dd className="text-content">{profile.organizationProfile?.registrationNumber ?? <span className="italic text-muted">Not set</span>}</dd>
          </div>
        </dl>
      ) : (
        <div className="mt-4 grid max-w-2xl gap-4">
          {error && (
            <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
              {error}
            </p>
          )}
          <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={fieldErrors.displayName} maxLength={120} />
          <Input label="Organisation name" value={orgName} onChange={(e) => setOrgName(e.target.value)} error={fieldErrors.orgName} maxLength={160} />
          <Input label="Registration number" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} hint="Optional. Your official registration or charity number." maxLength={100} />
          <div className="flex gap-2">
            <Button onClick={handleSave} loading={loading} disabled={loading}>Save changes</Button>
            <Button variant="ghost" onClick={cancelEdit} disabled={loading}>Cancel</Button>
          </div>
        </div>
      )}

      {!editing && (
        <button type="button" onClick={handleRefresh} className="mt-3 text-xs text-muted transition-colors hover:text-content">
          Refresh
        </button>
      )}
    </Card>
  )
}
