import { useState } from 'react'
import { useAuth } from '../lib/auth'

// Steamhub is for the team, so everything sits behind a Google sign-in.

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

/**
 * A Google account that isn't on the list comes back from sign-in with an error in the address
 * (Supabase can't make the account). Read it once and tidy the address.
 */
function refusedSignIn() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const err = url.searchParams.get('error_description') ?? hash.get('error_description')
  if (!err) return null
  for (const k of ['error', 'error_code', 'error_description']) url.searchParams.delete(k)
  window.history.replaceState(null, '', url.pathname + url.search)
  return /database error saving new user|not on the steamhub list/i.test(err)
    ? "That Google account isn't on Steamhub's list yet. Ask Yoni to add your email, then sign in again."
    : err
}

export function SignIn() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(refusedSignIn)
  return (
    <main className="gate">
      <div className="shell gate__box">
        <span className="logo gate__logo" style={{ width: 72, height: 72 }} aria-hidden="true" />
        <h1 className="gate__title">Steamhub</h1>
        <p className="soft gate__sub">FRC 1577 Steampunk's stock, tools and manufacturing. Sign in with Google to come in.</p>
        <button type="button" className="q-btn q-btn--big q-btn--wide" onClick={async () => setError(await signIn())}>
          <GoogleMark /> Sign in with Google
        </button>
        {error && <p className="error small">{error}</p>}
      </div>
    </main>
  )
}

export function NoAccess() {
  const { signOut } = useAuth()
  return (
    <main className="gate">
      <div className="shell gate__box">
        <h1 className="gate__title">No access</h1>
        <p className="soft gate__sub">This account can't use Steamhub. If that's a mistake, ask Yoni to let you back in.</p>
        <button type="button" className="q-btn q-btn--wide" onClick={() => signOut()}>
          Use another account
        </button>
      </div>
    </main>
  )
}
