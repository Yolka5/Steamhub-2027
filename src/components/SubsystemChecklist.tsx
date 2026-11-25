import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SUBSYSTEM_CHECKLIST } from '../content/subsystemChecklist'
import { useAuth } from '../lib/auth'
import { firstName } from '../lib/cal'
import { supabase } from '../lib/supabase'
import { usePeople } from '../lib/useMfg'
import { useToast } from './ui'

// The Handbook's approval checklist on a subsystem page. Each person ticks their own copy for this
// subsystem, saved in the database so it follows them to any device. Everyone sees how far the
// others got, so the lead and the mentor know who is ready to ask for approval.

interface Check {
  user_id: string
  item: number
}

const ITEMS = SUBSYSTEM_CHECKLIST
const N = ITEMS.length

export function SubsystemChecklist({ subId }: { subId: string }) {
  const { userId } = useAuth()
  const { people } = usePeople()
  const toast = useToast()
  const [checks, setChecks] = useState<Check[] | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('subsystem_checks').select('user_id, item').eq('subsystem_id', subId)
    if (!error) setChecks((data as Check[]) ?? [])
  }, [subId])
  useEffect(() => {
    load()
  }, [load])

  if (!checks) return null
  const mine = new Set(checks.filter((c) => c.user_id === userId).map((c) => c.item))
  const done = ITEMS.filter((_, i) => mine.has(i)).length

  const tick = async (i: number, on: boolean) => {
    if (!userId) return
    // Shown at once; put back if the save fails.
    const before = checks
    setChecks(on ? [...checks, { user_id: userId, item: i }] : checks.filter((c) => !(c.user_id === userId && c.item === i)))
    const { error } = on
      ? await supabase.from('subsystem_checks').insert({ subsystem_id: subId, user_id: userId, item: i })
      : await supabase.from('subsystem_checks').delete().eq('subsystem_id', subId).eq('user_id', userId).eq('item', i)
    if (error && error.code !== '23505') {
      setChecks(before)
      toast(error.message)
    }
  }
  const clear = async () => {
    if (!userId) return
    const before = checks
    setChecks(checks.filter((c) => c.user_id !== userId))
    const { error } = await supabase.from('subsystem_checks').delete().eq('subsystem_id', subId).eq('user_id', userId)
    if (error) {
      setChecks(before)
      toast(error.message)
    }
  }

  // Everyone else who has started, furthest first.
  const others = [...new Set(checks.map((c) => c.user_id))]
    .filter((u) => u !== userId)
    .map((u) => ({ u, n: new Set(checks.filter((c) => c.user_id === u && c.item < N).map((c) => c.item)).size }))
    .sort((a, b) => b.n - a.n)
  const nameOf = (id: string) => firstName(people.find((p) => p.id === id)?.name) || 'Someone'

  return (
    <details className="sub-check section">
      <summary className="sub-check__sum">
        <span className="section__title">Approval checklist</span>
        <span className="soft small num">
          You: {done} of {N}
          {others.length > 0 && ` · ${others.length} more ${others.length === 1 ? 'person' : 'people'}`}
        </span>
      </summary>
      <p className="soft small">
        From the <Link to="/handbook/design#s9">Handbook</Link>. Go through it before asking a mentor to approve the subsystem. Your ticks are yours and stay on this subsystem.
      </p>
      <div className={`hb-check ${done === N ? 'is-complete' : ''}`} dir="rtl">
        <div className="hb-check__head" dir="ltr">
          <span className="hb-check__count num">
            {done}
            <span className="soft"> / {N}</span>
          </span>
          <span className="hb-check__bar" aria-hidden="true">
            <span style={{ width: `${(done / N) * 100}%` }} />
          </span>
          {done > 0 && (
            <button type="button" className="text-btn" onClick={clear}>
              Clear mine
            </button>
          )}
        </div>
        {done === N && (
          <p className="hb-check__done" dir="ltr">
            All checked. Ready to ask a mentor for approval.
          </p>
        )}
        <ul className="hb-check__list">
          {ITEMS.map((html, i) => (
            <li key={i}>
              <label className={mine.has(i) ? 'is-done' : ''}>
                <input type="checkbox" checked={mine.has(i)} onChange={(e) => tick(i, e.target.checked)} />
                <span dangerouslySetInnerHTML={{ __html: html }} />
              </label>
            </li>
          ))}
        </ul>
      </div>
      {others.length > 0 && (
        <ul className="sub-check__others small">
          {others.map(({ u, n }) => (
            <li key={u}>
              <span>{nameOf(u)}</span>
              <span className="hb-check__bar" aria-hidden="true">
                <span style={{ width: `${(n / N) * 100}%`, background: n === N ? 'var(--meaning-b)' : undefined }} />
              </span>
              <span className="soft num">
                {n} of {N}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
