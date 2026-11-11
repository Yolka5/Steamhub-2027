import { createClient } from '@supabase/supabase-js'

// The publishable key is meant to ship to the browser. Row level security guards the data.
const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

/** Where supabase-js keeps the session, so the app can read it before the library is ready. */
export const AUTH_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`

/**
 * With no signal, a session older than an hour can't be refreshed, and supabase-js then retries
 * for about 25 s and reports no session at all: a phone opened in the workshop showed the sign-in
 * screen. While offline, the saved session is reported as still fresh, so the app opens and reads
 * go out at once (the offline worker answers them from the saved copy). Back online, the real
 * expiry is read again and the token refreshes as usual.
 */
const storage = {
  getItem(k: string) {
    try {
      const v = localStorage.getItem(k)
      if (!v || k !== AUTH_KEY || navigator.onLine) return v
      return JSON.stringify({ ...JSON.parse(v), expires_at: Math.floor(Date.now() / 1000) + 3600 })
    } catch {
      return null
    }
  },
  setItem(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode: the session lives for this visit only */
    }
  },
  removeItem(k: string) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* nothing saved */
    }
  },
}

/** The saved session, read straight from storage, so the app can open before supabase-js is ready. */
export function savedSession() {
  try {
    const v = localStorage.getItem(AUTH_KEY)
    const s = v ? JSON.parse(v) : null
    return s?.access_token && s?.user?.id ? s : null
  } catch {
    return null
  }
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage },
})

/** Supabase answers at most 1000 rows per request. */
const PAGE = 1000

type Pageable = { range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }> }

/**
 * Every row of a query, a page at a time. Lists that grow past 1000 rows (two robots' parts,
 * stock after the backlog is entered) would otherwise lose their last rows without a word.
 * `make` builds the query fresh for each page.
 */
export async function selectAll<T>(make: () => Pageable): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1)
    if (error) return { data: null, error }
    const rows = (data as T[] | null) ?? []
    out.push(...rows)
    if (rows.length < PAGE) return { data: out, error: null }
  }
}
