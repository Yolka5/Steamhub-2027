import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

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
    ? NOT_LISTED
    : err
}

const NOT_LISTED = "That Google account isn't on Steamhub's list yet. Ask to join below, then sign in again once you're approved."

/**
 * For someone who isn't on the list yet: their name and Google email go to the admin as a
 * request (request_join in the database). The answer is the same whether or not the email is
 * already listed, so this can't be used to find out who is on the team.
 */
function AskToJoin({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (name.trim().length < 2) return setMsg('Write your full name first.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg('Write the Google email you sign in with.')
    setBusy(true)
    const { data, error } = await supabase.rpc('request_join', { p_email: email.trim(), p_name: name.trim(), p_note: note.trim() || null })
    setBusy(false)
    if (error) return setMsg(navigator.onLine ? "The request didn't go through. Try again." : 'No connection. Try again when you are online.')
    if (data === 'bad_email') return setMsg('Write the Google email you sign in with.')
    if (data === 'bad_name') return setMsg('Write your full name first.')
    if (data === 'busy') return setMsg('Lots of requests right now. Try again in an hour, or tell Yoni.')
    setMsg(null)
    setSent(true)
  }

  if (sent)
    return (
      <div className="gate__ask">
        <p className="gate__sent">Request sent. Yoni gets a notification.</p>
        <p className="soft small">Once you're approved, come back here and sign in with {email.trim()}.</p>
        <button type="button" className="q-btn q-btn--wide" onClick={onCancel}>
          Back to sign in
        </button>
      </div>
    )

  return (
    <form className="form gate__ask" onSubmit={send}>
      <label className="ctl">
        <span className="ctl__name">Your name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Noa Levi" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Google email you'll sign in with</span>
        <input className="field" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@gmail.com" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Anything Yoni should know (optional)</span>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="New on the CAD team" />
      </label>
      {msg && <p className="error small">{msg}</p>}
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Sending' : 'Ask to join'}
      </button>
      <button type="button" className="q-btn q-btn--wide" onClick={onCancel}>
        Back to sign in
      </button>
    </form>
  )
}

export function SignIn() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(refusedSignIn)
  // Someone who was just refused lands straight on the request form.
  const [asking, setAsking] = useState(() => error === NOT_LISTED)
  return (
    <main className="gate">
      <div className="shell gate__box">
        <span className="logo gate__logo" style={{ width: 72, height: 72 }} aria-hidden="true" />
        <h1 className="gate__title">Steamhub</h1>
        <p className="soft gate__sub">FRC 1577 Steampunk's stock, tools and manufacturing. Sign in with Google to come in.</p>
        {error && <p className="error small">{error}</p>}
        {asking ? (
          <AskToJoin onCancel={() => setAsking(false)} />
        ) : (
          <>
            <button type="button" className="q-btn q-btn--big q-btn--wide" onClick={async () => setError(await signIn())}>
              <GoogleMark /> Sign in with Google
            </button>
            <p className="soft small gate__new">
              New on the team?{' '}
              <button type="button" className="text-btn" onClick={() => setAsking(true)}>
                Ask to join
              </button>
            </p>
          </>
        )}
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
