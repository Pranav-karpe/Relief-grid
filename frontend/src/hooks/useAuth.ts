import { useState, useEffect, useCallback, useRef } from 'react'
import { getMe, AuthApiError, type SafeUser } from '../api/auth'

const TOKEN_KEY = 'rg_token'

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: SafeUser; token: string }
  | { status: 'restore_failed'; error: string }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  // Guard against state updates after unmount
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Session restoration: runs once on mount
  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY)

    if (!token) {
      setState({ status: 'unauthenticated' })
      return
    }

    let cancelled = false

    getMe(token)
      .then((user) => {
        if (!cancelled && mounted.current) {
          setState({ status: 'authenticated', user, token })
        }
      })
      .catch((err: unknown) => {
        if (cancelled || !mounted.current) return

        if (err instanceof AuthApiError && (err.status === 401 || err.status === 403)) {
          // Token is invalid or expired — clear it and go unauthenticated
          sessionStorage.removeItem(TOKEN_KEY)
          setState({ status: 'unauthenticated' })
        } else {
          // Network error or server unavailable — preserve the token, let user retry
          const message =
            err instanceof AuthApiError
              ? err.message
              : err instanceof Error
              ? err.message
              : 'Could not reach the server. Please check your connection and try again.'
          setState({ status: 'restore_failed', error: message })
        }
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = useCallback((user: SafeUser, token: string) => {
    sessionStorage.setItem(TOKEN_KEY, token)
    setState({ status: 'authenticated', user, token })
  }, [])

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    setState({ status: 'unauthenticated' })
  }, [])

  const retryRestore = useCallback(() => {
    setState({ status: 'loading' })
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (!token) {
      setState({ status: 'unauthenticated' })
      return
    }
    getMe(token)
      .then((user) => {
        if (mounted.current) setState({ status: 'authenticated', user, token })
      })
      .catch((err: unknown) => {
        if (!mounted.current) return
        if (err instanceof AuthApiError && (err.status === 401 || err.status === 403)) {
          sessionStorage.removeItem(TOKEN_KEY)
          setState({ status: 'unauthenticated' })
        } else {
          const message =
            err instanceof AuthApiError
              ? err.message
              : err instanceof Error
              ? err.message
              : 'Could not reach the server. Please check your connection and try again.'
          setState({ status: 'restore_failed', error: message })
        }
      })
  }, [])

  return { state, signIn, signOut, retryRestore }
}
