import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { PROFILE_COLUMNS, type Profile } from './mfg'
import { savedSession, supabase } from './supabase'
import { clearSavedData } from './pwa'

interface Auth {
  session: Session | null
  ready: boolean
  /** First name for greetings and reservations. */
  name: string | null
  userId: string | null
  /** The signed-in person's row in profiles: admin and banned flags. */
  profile: Profile | null
  isAdmin: boolean
  /** The team captain: sees everything an admin sees (People, SteamLab). Fixed in the database. */
  isCaptain: boolean
  /** Admin or captain: may open the admin's pages to look. */
  seesAll: boolean
  /** Workshop leads and admins hand out parts (WORKSHOP_TASKS.md). */
  canAssign: boolean
  /** The shared workshop PC account. */
  shared: boolean
  /** The room a shared PC stands in: 'cnc' opens the CNC Home. */
  room: 'cnc' | null
  banned: boolean
  signIn: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

// The room is also kept in the browser, so the CNC PC opens on its own Home at once instead of
// flashing the usual one while the profile loads.
const ROOM_KEY = 'steamhub.room'
const savedRoom = (): 'cnc' | null => {
  try {
    return localStorage.getItem(ROOM_KEY) === 'cnc' ? 'cnc' : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // A saved session opens the app at once, without waiting for supabase-js to check or refresh it.
  const [session, setSession] = useState<Session | null>(() => savedSession())
  const [ready, setReady] = useState(() => savedSession() != null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      // No network: keep the saved session rather than sending people to the sign-in screen.
      if (data.session || !error || !isAuthRetryableFetchError(error)) setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // A failed refresh offline reports "no session" too; only a real sign-out clears it.
      if (s || event === 'SIGNED_OUT') setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? null
  useEffect(() => {
    if (!uid) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        const p = (data as Profile | null) ?? null
        setProfile(p)
        if (!p) return
        try {
          if (p.shared && p.room) localStorage.setItem(ROOM_KEY, p.room)
          else localStorage.removeItem(ROOM_KEY)
        } catch {
          // Private mode: the room comes from the profile alone.
        }
      })
  }, [uid])

  const meta = session?.user.user_metadata ?? {}
  const fullName: string | null = meta.full_name ?? meta.name ?? session?.user.email?.split('@')[0] ?? null

  const value: Auth = {
    session,
    ready,
    name: fullName,
    userId: uid,
    profile,
    isAdmin: !!profile?.is_admin,
    isCaptain: !!profile?.captain && !profile?.banned,
    seesAll: !!profile?.is_admin || (!!profile?.captain && !profile?.banned),
    canAssign: !!profile?.is_admin || !!profile?.workshop_lead,
    shared: !!profile?.shared,
    room: profile ? (profile.shared && profile.room ? profile.room : null) : uid ? savedRoom() : null,
    banned: !!profile?.banned,
    async signIn() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href, queryParams: { prompt: 'select_account' } },
      })
      return error?.message ?? null
    },
    async signOut() {
      clearSavedData()
      try {
        localStorage.removeItem(ROOM_KEY)
      } catch {
        // Nothing saved.
      }
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

/** The signed-in person as the actions want them. */
export function useWho() {
  const { userId, name } = useAuth()
  return userId && name ? { userId, name } : null
}
