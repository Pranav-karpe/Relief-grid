import { createContext } from 'react'
import type { SafeUser } from '../api/auth'
import type { AuthState } from '../hooks/useAuth'

export type AuthContextValue = {
  state: AuthState
  signIn: (user: SafeUser, token: string) => void
  signOut: () => void
  retryRestore: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
