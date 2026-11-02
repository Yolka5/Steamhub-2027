import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface Auth {
  session: Session | null
  ready: boolean
  /** First name for greetings and reservations. */
  name: string | null
  userId: string | null
  signIn: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const meta = session?.user.user_metadata ?? {}
  const fullName: string | null = meta.full_name ?? meta.name ?? session?.user.email?.split('@')[0] ?? null

  const value: Auth = {
    session,
    ready,
    name: fullName,
    userId: session?.user.id ?? null,
    async signIn() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href, queryParams: { prompt: 'select_account' } },
      })
      return error?.message ?? null
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
