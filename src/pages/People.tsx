import { useState } from 'react'
import { useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ago, type Profile } from '../lib/mfg'
import { supabase } from '../lib/supabase'
import { usePeople } from '../lib/useMfg'

// Everyone who has signed in. Anyone with a Google account can, so the admin can ban accounts
// that don't belong. A ban takes effect on their next page load.

export default function People() {
  const { people, reload } = usePeople()
  const { isAdmin, userId } = useAuth()
  const toast = useToast()
  const [armed, setArmed] = useState<string | null>(null)

  const setBan = async (p: Profile, banned: boolean) => {
    const { error } = await supabase.from('profiles').update({ banned }).eq('id', p.id)
    setArmed(null)
    if (error) return toast(error.message)
    await reload()
    toast(banned ? `${p.name} is banned` : `${p.name} can sign in again`)
  }

  const sorted = people.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">People</h1>
      </div>
      <p className="soft">{people.length} accounts. Newest first.</p>
      <ul className="rows">
        {sorted.map((p) => (
          <li key={p.id} className="row">
            <span className="avatar avatar--soft">{p.name[0]?.toUpperCase()}</span>
            <span className="row__main">
              <span className="strong">
                {p.name}
                {p.is_admin ? <span className="soft"> · admin</span> : null}
              </span>
              <span className="soft small">
                {p.email} · joined {ago(p.created_at)}
              </span>
            </span>
            {p.banned && <span className="tag tag--bad">Banned</span>}
            {isAdmin && p.id !== userId && (
              <span className="row__end">
                {p.banned ? (
                  <button type="button" className="q-btn q-btn--small" onClick={() => setBan(p, false)}>
                    Unban
                  </button>
                ) : armed === p.id ? (
                  <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={() => setBan(p, true)}>
                    Ban {p.name.split(' ')[0]}
                  </button>
                ) : (
                  <button type="button" className="q-btn q-btn--small" onClick={() => setArmed(p.id)}>
                    Ban
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
