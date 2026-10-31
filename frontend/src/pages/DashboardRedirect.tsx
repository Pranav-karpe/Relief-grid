import { Navigate } from 'react-router-dom'
import { useAuthContext } from '../lib/useAuthContext'
import { ROLE_DASHBOARD } from '../lib/roles'

export default function DashboardRedirect() {
  const { state } = useAuthContext()

  // ProtectedRoute handles loading/unauthenticated — by the time we render,
  // state must be 'authenticated'
  if (state.status !== 'authenticated') return null

  return <Navigate to={ROLE_DASHBOARD[state.user.role]} replace />
}
