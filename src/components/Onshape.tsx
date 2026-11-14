// The Onshape pieces (ONSHAPE.md): the panel on a subsystem page, the robot's weight, and the
// sheet where a person connects their own Onshape key.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Sheet, useBusy, useToast } from './ui'
import { useAuth } from '../lib/auth'
import { ago, type Robot, type Subsystem } from '../lib/mfg'
import { kgText, os, OS_BUDGET, osUrl, stepFromOnshape, useOsAccounts, useOsLink, useOsLinks, weightLimitKg, type OsFlag, type OsLink, type SyncResult } from '../lib/onshape'
import { usePeople } from '../lib/useMfg'

const first = (name: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'someone'
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What a sync didn't count, in words. */
function notCounted(l: OsLink) {
  const prints = l.summary.prints ?? 0
  const none = l.summary.no_mass ?? 0
  return [prints && plural(prints, 'printed part', 'printed parts'), none && `${plural(none, 'part', 'parts')} with no material or mass`].filter(Boolean).join(' and ')
}

// ---------- Connect ----------

/** Paste your own Onshape API key once. Until then your syncs run on the lead's key. */
export function ConnectOnshape({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useAuth()
  const { has, used, reload } = useOsAccounts()
  const toast = useToast()
  const [busy, run] = useBusy()
  const [access, setAccess] = useState('')
  const [secret, setSecret] = useState('')
  const connected = has(userId)

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  const connect = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const res = await os<{ ok: true; name: string | null; can_write: boolean | null }>({ action: 'connect', access, secret })
      if (res.error) return toast(res.error)
      setAccess('')
      setSecret('')
      await reload()
      toast(res.data?.can_write ? 'Onshape connected. This key can also write; a read-only key is safer.' : 'Onshape connected')
    })
  }

  const disconnect = () =>
    run(async () => {
      const res = await os({ action: 'disconnect' })
      if (res.error) return toast(res.error)
      await reload()
      toast('Disconnected. Your key was deleted from Steamhub.')
    })

  const n = used(userId)
  return (
    <Sheet open={open} onClose={onClose} title={connected ? 'Onshape' : 'Connect Onshape'}>
      {connected ? (
        <div className="form">
          <div className="os-used">
            <span>
              <span className="strong num">{n.toLocaleString('en')}</span> <span className="soft">of {OS_BUDGET.toLocaleString('en')} calls used this year</span>
            </span>
            <span className="os-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (n / OS_BUDGET) * 100)}%` }} />
            </span>
            <span className="soft small">A sync uses 2 or 3. Steamhub warns you at 2,000 and stops using your key at 2,400.</span>
          </div>
          <p className="soft small">Steamhub only reads from Onshape. Only calls made through Steamhub are counted here.</p>
          <button type="button" className="q-btn q-btn--wide" onClick={disconnect}>
            {busy ? 'Disconnecting' : 'Disconnect Onshape'}
          </button>
        </div>
      ) : (
        <form className="form" onSubmit={connect}>
          <ol className="os-steps">
            <li>
              Open the{' '}
              <a href="https://dev-portal.onshape.com/keys" target="_blank" rel="noreferrer">
                Onshape developer portal
              </a>{' '}
              and sign in with your school account.
            </li>
            <li>
              Create an API key and tick only <span className="strong">read documents</span>.
            </li>
            <li>Paste both keys here. Onshape shows the secret key once.</li>
          </ol>
          <label className="ctl">
            <span className="ctl__name">Access key</span>
            <input className="field num" data-autofocus value={access} onChange={(e) => setAccess(e.target.value)} autoComplete="off" spellCheck={false} placeholder="on_mK2vQ8pLxR4tY7nB3cZ9w" />
          </label>
          <label className="ctl">
            <span className="ctl__name">Secret key</span>
            <input className="field num" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder="48 characters" />
          </label>
          <p className="soft small">The keys are stored on the server and never shown again, not even to you. Until you connect, your syncs run on the subsystem lead's key.</p>
          <button type="submit" className="q-btn q-btn--main q-btn--wide">
            {busy ? 'Testing' : 'Test and connect'}
          </button>
        </form>
      )}
    </Sheet>
  )
}

// ---------- Shared bits ----------

function WeightTarget({ link, onDone, onClose }: { link: OsLink; onDone: () => void; onClose: () => void }) {
  const toast = useToast()
  const [busy, run] = useBusy()
  const [v, setV] = useState(link.target_g ? String(link.target_g / 1000) : '')
  const save = (kg: string | null) =>
    run(async () => {
      const res = await os({ action: 'target', link_id: link.id, kg })
      if (res.error) return toast(res.error)
      onDone()
      onClose()
      toast(kg ? 'Target saved' : 'Target removed')
    })
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim()) return toast('Give the target in kg, like 4.5')
        save(v.trim().replace(',', '.'))
      }}
    >
      <label className="ctl">
        <span className="ctl__name">Weight target, kg</span>
        <input className="field num" data-autofocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="4.5" />
        <span className="soft small">The lead hears about it when the CAD weight goes over.</span>
      </label>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Saving' : 'Save target'}
      </button>
      {link.target_g != null && (
        <button type="button" className="q-btn q-btn--wide" onClick={() => save(null)}>
          Remove the target
        </button>
      )}
    </form>
  )
}

function LinkForm({ what, hint, onLink }: { what: string; hint: string; onLink: (url: string) => Promise<void> }) {
  const toast = useToast()
  const [busy, run] = useBusy()
  const [url, setUrl] = useState('')
  return (
    <>
      <p className="soft">{hint}</p>
      <form
        className="os__link"
        onSubmit={(e) => {
          e.preventDefault()
          if (!url.trim()) return toast('Paste the assembly link first')
          run(() => onLink(url.trim()))
        }}
      >
        <input className="field" aria-label={`Onshape assembly link for ${what}`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="cad.onshape.com/documents/…/w/…/e/…" inputMode="url" autoComplete="off" />
        <button type="submit" className="q-btn q-btn--main">
          {busy ? 'Linking' : 'Link assembly'}
        </button>
      </form>
      <p className="soft small">Open the Assembly tab in Onshape and copy the address from the browser.</p>
    </>
  )
}

/** One sync, with the words the button shows while it runs. */
function useSync(link: OsLink | null, after: (r: SyncResult) => void | Promise<void>) {
  const toast = useToast()
  const [step, setStep] = useState<string | null>(null)
  const sync = async () => {
    if (!link || step) return
    setStep('Checking Onshape…')
    const t = setTimeout(() => setStep('Reading parts…'), 1400)
    const res = await os<SyncResult>({ action: 'sync', link_id: link.id })
    clearTimeout(t)
    setStep(null)
    if (res.error || !res.data) return toast(res.error ?? "The sync didn't finish. Try again.")
    if (!res.data.changed) toast('Nothing changed in Onshape since the last sync')
    await after(res.data)
  }
  return { step, sync }
}

function SyncedLine({ link, extra }: { link: OsLink; extra?: ReactNode }) {
  const { nameOf } = usePeople()
  if (!link.last_sync_at) return null
  const by = link.last_sync_by ? first(nameOf(link.last_sync_by)) : 'the nightly check'
  const key = link.last_key_user && link.last_key_user !== link.last_sync_by ? ` with ${first(nameOf(link.last_key_user))}'s key` : ''
  return (
    <p className="soft small num">
      Synced {ago(link.last_sync_at)} by {by}
      {key}
      {link.last_calls ? ` · ${plural(link.last_calls, 'call', 'calls')}` : ''}
      {extra}
    </p>
  )
}

// ---------- Flags ----------

function flagText(f: OsFlag): { text: ReactNode; sub?: ReactNode; partId?: string } {
  const list = (ps: OsFlag['parts'] = [], n = ps.length) =>
    ps
      .slice(0, 4)
      .map((p) => (p.part_no ? `${p.part_no}` : p.name))
      .join(', ') + (n > 4 ? ` and ${n - 4} more` : '')
  switch (f.kind) {
    case 'gain':
      return { text: <>Gained <span className="num strong">{f.kg?.toFixed(2)} kg</span> since the last sync.</>, sub: 'The lead got a push about it.' }
    case 'over':
      return { text: <>Over its weight target by <span className="num strong">{f.kg?.toFixed(2)} kg</span>.</> }
    case 'limit':
      return { text: <>Over the season's weight limit by <span className="num strong">{f.kg?.toFixed(2)} kg</span> in CAD.</> }
    case 'heavy':
      return {
        text: <>{plural(f.parts?.length ?? 0, 'part weighs', 'parts weigh')} more than seems right.</>,
        sub: (f.parts ?? []).map((p) => `${p.name}: ${p.kg} kg${(p.qty ?? 1) > 1 ? ` ×${p.qty}` : ''}`).join(' · ') + '. Check the material or mass set in Onshape.',
      }
    case 'nomat':
      return {
        text: <>{plural(f.n ?? 0, 'made part has', 'made parts have')} no material in Onshape: <span className="num">{list(f.parts, f.n)}</span>.</>,
        sub: "They aren't counted in the weight, and their drawings still show Steamhub's guess.",
        partId: f.parts?.length === 1 ? f.parts[0].id : undefined,
      }
    case 'stock':
      return { text: <><span className="strong num">{f.part?.part_no}</span> is {f.part?.t} mm aluminum, and there's no {f.part?.t} mm plate in stock.</>, partId: f.part?.id }
    case 'names':
      return { text: <>{plural(f.n ?? 0, 'part is', 'parts are')} still called “Part N”: <span className="num">{list(f.parts, f.n)}</span>.</>, sub: 'Name them in Onshape, so the workshop knows what they are.' }
    case 'dup':
      return {
        text: <>Some parts share a name, so they can't be matched with Onshape.</>,
        sub: (f.names ?? []).map((x) => `“${x.name}” ×${x.n}`).join(' · '),
      }
  }
}

function Flags({ link, onChange }: { link: OsLink; onChange: () => void }) {
  const toast = useToast()
  const flags = link.flags.filter((f) => !link.dismissed.includes(f.id))
  if (!flags.length) return null
  const dismiss = async (id: string) => {
    const res = await os({ action: 'dismiss', link_id: link.id, flag: id })
    if (res.error) return toast(res.error)
    onChange()
  }
  return (
    <ul className="os-flags" aria-label="Worth a look">
      {flags.map((f) => {
        const t = flagText(f)
        return (
          <li key={f.id}>
            <span className="os-flags__text">
              {t.text}
              {t.sub && (
                <>
                  <br />
                  <span className="soft small">{t.sub}</span>
                </>
              )}
            </span>
            <span className="os-flags__acts">
              {t.partId && (
                <Link to={`/manufacturing/p/${t.partId}`} className="text-btn">
                  Open the part
                </Link>
              )}
              <button type="button" className="text-btn" onClick={() => dismiss(f.id)}>
                Dismiss
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Unmatched({ link }: { link: OsLink }) {
  const a = link.unmatched.onshape ?? []
  const b = link.unmatched.steamhub ?? []
  const na = link.unmatched.onshape_n ?? a.length
  const nb = link.unmatched.steamhub_n ?? b.length
  if (!na && !nb) return null
  return (
    <details className="more">
      <summary>
        {[na && `${plural(na, 'Onshape part', 'Onshape parts')} not matched`, nb && `${plural(nb, 'Steamhub part', 'Steamhub parts')} not matched`].filter(Boolean).join(', ')}
      </summary>
      {na > 0 && (
        <>
          <p className="soft small os-un__head">In Onshape, not paired with a Steamhub part</p>
          <ul className="rows">
            {a.map((r, i) => (
              <li key={i}>
                <span className="row">
                  <span>
                    <span className="strong">{r.name}</span> <span className="soft num">×{r.qty}{r.material ? ` · ${r.material}` : ''}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {nb > 0 && (
        <>
          <p className="soft small os-un__head">In Steamhub, not found in Onshape</p>
          <ul className="rows">
            {b.map((p) => (
              <li key={p.id}>
                <Link to={`/manufacturing/p/${p.id}`} className="row">
                  <span>
                    <span className="num strong">{p.part_no}</span> <span className="soft">{p.name} ×{p.qty}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="soft small os-un__foot">A part with its own name pairs by itself. A new STEP adds parts that were drawn after the last upload.</p>
    </details>
  )
}

// ---------- Subsystem ----------

/**
 * The Onshape block on a subsystem page: link the assembly, sync, see the CAD weight and what's
 * worth a look. `onSynced` lets the page reload its parts; `onStep` hands over a STEP from Onshape.
 */
export function OnshapePanel({ sub, onSynced, onStep }: { sub: Subsystem; onSynced: () => void | Promise<void>; onStep: (file: File, progress: (t: string) => void) => Promise<void> }) {
  const { userId, isAdmin, isCaptain } = useAuth()
  const { nameOf } = usePeople()
  const { link, loaded, reload } = useOsLink({ subsystemId: sub.id })
  const { has, reload: reloadAccounts } = useOsAccounts()
  const toast = useToast()
  const [busy, run] = useBusy()
  const [targeting, setTargeting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [stepping, setStepping] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const canLink = isAdmin || isCaptain || (!!userId && sub.lead_id === userId)
  const lead = sub.lead_id ? first(nameOf(sub.lead_id)) : null

  const { step, sync } = useSync(link, async (r) => {
    await Promise.all([reload(), reloadAccounts(), onSynced()])
    setNote(r.changed ? (r.note ?? null) : null)
  })

  if (!loaded) return null

  const head = (right?: ReactNode) => (
    <div className="os__head">
      <span className="os__title">
        <Icon name="link" size={18} /> Onshape
      </span>
      {right && <span className="os__acts">{right}</span>}
    </div>
  )

  if (!link)
    return (
      <section className="os" aria-label="Onshape">
        {head()}
        {canLink ? (
          <LinkForm
            what={sub.name}
            hint="Link this subsystem to its assembly tab in Onshape. Steamhub then reads each part's material and weight, and which parts are bought."
            onLink={async (url) => {
              const res = await os({ action: 'link', subsystem_id: sub.id, url })
              if (res.error) return toast(res.error)
              await reload()
              toast('Linked')
            }}
          />
        ) : (
          <p className="soft">Not linked to Onshape yet. {lead ? `${lead}, the lead,` : 'The lead'} can link this subsystem to its assembly.</p>
        )}
      </section>
    )

  const unlink = () =>
    run(async () => {
      const res = await os({ action: 'unlink', link_id: link.id })
      if (res.error) return toast(res.error)
      setNote(null)
      await reload()
    })

  const getStep = async () => {
    if (stepping) return toast('Still getting the STEP from Onshape')
    setStepping('Starting')
    const res = await stepFromOnshape(link.id, setStepping)
    if (res.error || !res.data) {
      setStepping(null)
      return toast(res.error ?? "The STEP didn't arrive. Try again.")
    }
    await onStep(res.data, setStepping)
    setStepping(null)
    reloadAccounts()
  }

  const acts = (
    <>
      {canLink && (
        <button type="button" className="text-btn" onClick={unlink}>
          {busy ? 'Unlinking' : 'Change link'}
        </button>
      )}
      <a className="q-btn q-btn--small" href={osUrl(link)} target="_blank" rel="noreferrer">
        <Icon name="external" size={16} /> Open in Onshape
      </a>
      <button type="button" className="q-btn q-btn--main" onClick={step ? () => toast('Still reading from Onshape') : sync}>
        {step ? <span className="num">{step}</span> : link.last_sync_at ? 'Sync again' : 'Sync from Onshape'}
      </button>
    </>
  )

  const mine = has(userId)
  if (!link.last_sync_at)
    return (
      <section className="os" aria-label="Onshape">
        {head(acts)}
        <p className="soft small">
          A sync reads material, weight and where each part comes from. {mine ? 'It uses 2 of your 2,500 Onshape calls for the year, plus one for each new source document the first time.' : `You haven't connected Onshape, so it runs on ${lead && has(sub.lead_id) ? `${lead}'s` : "an admin's"} key.`}
        </p>
      </section>
    )

  const w = link.mass_g ?? 0
  const target = link.target_g
  const over = target != null && w > target
  const not = notCounted(link)
  return (
    <>
      <section className="os" aria-label="Onshape">
        {head(acts)}
        <div className="os-weight">
          <div className="os-weight__row">
            <span className="os-weight__v">
              {kgText(w)} <small>kg</small>
            </span>
            <span className={over ? undefined : 'soft'}>
              {target != null ? (
                <>
                  {over && <span className="tag tag--bad">{kgText(w - target)} kg over</span>} of {kgText(target)} kg target
                </>
              ) : (
                'No weight target yet'
              )}
              {canLink && (
                <>
                  {' · '}
                  <button type="button" className="text-btn" onClick={() => setTargeting(true)}>
                    {target != null ? 'Change' : 'Set a target'}
                  </button>
                </>
              )}
            </span>
          </div>
          {target != null && (
            <span className="os-bar" data-over={over || undefined} aria-hidden="true">
              <span style={{ width: `${Math.min(100, (w / target) * 100)}%` }} />
            </span>
          )}
          <p className="soft small">
            CAD weight{link.doc_name ? ` of “${link.doc_name}”` : ''}
            {not ? ` · ${not} not counted` : ''}.
          </p>
        </div>
        <Flags link={link} onChange={reload} />
        <Unmatched link={link} />
        <SyncedLine
          link={link}
          extra={
            <>
              {' · '}
              <button type="button" className="text-btn" onClick={getStep}>
                {stepping ?? 'Get the STEP from Onshape'}
              </button>
              {!mine && (
                <>
                  {' · '}
                  <button type="button" className="text-btn" onClick={() => setConnecting(true)}>
                    Connect your own Onshape
                  </button>
                </>
              )}
            </>
          }
        />
      </section>
      {note && <p className="mfg-note num os-note">{note}</p>}
      <Sheet open={targeting} onClose={() => setTargeting(false)} title="Weight target">
        <WeightTarget link={link} onDone={reload} onClose={() => setTargeting(false)} />
      </Sheet>
      <ConnectOnshape open={connecting} onClose={() => setConnecting(false)} />
    </>
  )
}

// ---------- Robot ----------

/** The robot's CAD weight from its full assembly: total, one bar per group, and the heaviest parts. */
export function RobotWeight({ robot, subs }: { robot: Robot; subs: Subsystem[] }) {
  const { isAdmin, isCaptain, userId } = useAuth()
  const { link, loaded, reload } = useOsLink({ robotId: robot.id })
  const { links: subLinks, reload: reloadSubs } = useOsLinks(subs.map((s) => s.id))
  const { reload: reloadAccounts } = useOsAccounts()
  const toast = useToast()
  const [busy, run] = useBusy()
  const [limit, setLimit] = useState(52.2)
  useEffect(() => {
    weightLimitKg().then(setLimit)
  }, [])
  const canLink = isAdmin || isCaptain || subs.some((s) => s.lead_id === userId)
  const { step, sync } = useSync(link, async () => {
    await Promise.all([reload(), reloadSubs(), reloadAccounts()])
  })

  if (!loaded) return null
  // A robot with nothing from Onshape yet shows the block only to someone who can link it.
  if (!link && !canLink && !subLinks.some((l) => l.mass_g != null)) return null

  const title = (right?: ReactNode) => (
    <div className="mfg-bar-head">
      <h2 className="section__title">Weight</h2>
      {right && <span className="os__acts">{right}</span>}
    </div>
  )

  if (!link) {
    const known = subLinks.filter((l) => l.mass_g != null)
    const sum = known.reduce((a, l) => a + (l.mass_g ?? 0), 0)
    return (
      <section className="section os-section">
        {title()}
        <div className="rw">
          {known.length > 0 && (
            <div className="rw__top">
              <span className="rw__v">
                {kgText(sum)} <small>kg</small>
              </span>
              <span className="soft">in {plural(known.length, 'synced subsystem', 'synced subsystems')}, not the whole robot</span>
            </div>
          )}
          {canLink ? (
            <LinkForm
              what={robot.name}
              hint="Link the full robot assembly to see the whole robot's CAD weight and centre of mass, with what belongs to no subsystem."
              onLink={async (url) => {
                const res = await os({ action: 'link', robot_id: robot.id, url })
                if (res.error) return toast(res.error)
                await reload()
                toast('Linked')
              }}
            />
          ) : (
            <p className="soft">The full robot assembly isn't linked to Onshape yet.</p>
          )}
        </div>
      </section>
    )
  }

  const unlink = () =>
    run(async () => {
      const res = await os({ action: 'unlink', link_id: link.id })
      if (res.error) return toast(res.error)
      await reload()
    })
  const acts = (
    <>
      {canLink && (
        <button type="button" className="text-btn" onClick={unlink}>
          {busy ? 'Unlinking' : 'Change link'}
        </button>
      )}
      <a className="q-btn q-btn--small" href={osUrl(link)} target="_blank" rel="noreferrer">
        <Icon name="external" size={16} /> Open in Onshape
      </a>
      <button type="button" className="q-btn q-btn--main" onClick={step ? () => toast('Still reading from Onshape') : sync}>
        {step ? <span className="num">{step}</span> : link.last_sync_at ? 'Sync again' : 'Sync robot'}
      </button>
    </>
  )

  if (!link.last_sync_at)
    return (
      <section className="section os-section">
        {title(acts)}
        <div className="rw">
          <p className="soft">Linked. A sync reads the whole robot's weight in 3 Onshape calls.</p>
        </div>
      </section>
    )

  const w = (link.mass_g ?? 0) / 1000
  const groups = link.summary.groups ?? []
  const max = Math.max(1, ...groups.map((g) => g.mass_g))
  const over = w > limit
  const c = link.centroid
  const not = notCounted(link)
  return (
    <section className="section os-section">
      {title(acts)}
      <div className="rw">
        <div className="rw__top">
          <span className="rw__v">
            {w.toFixed(2)} <small>kg</small>
          </span>
          <span className={over ? undefined : 'soft'}>
            of {limit.toFixed(1)} kg season limit ·{' '}
            {over ? <span className="tag tag--bad">{(w - limit).toFixed(2)} kg over</span> : <span className="num">{(limit - w).toFixed(2)} kg to spare</span>}
          </span>
        </div>
        <span className="os-bar" data-over={over || undefined} aria-hidden="true">
          <span style={{ width: `${Math.min(100, (w / limit) * 100)}%` }} />
        </span>
        <ul className="rw__rows">
          {groups.map((g, i) => {
            const s = subs.find((x) => x.id === g.subsystem_id)
            const inner = (
              <>
                <span>
                  <span className="strong">{s ? `${s.number} ${s.name}` : g.name}</span>
                  {s && <span className="soft small"> {g.name}</span>}
                </span>
                <span className="os-bar" aria-hidden="true">
                  <span style={{ width: `${(g.mass_g / max) * 100}%` }} />
                </span>
                <span className="rw__kg">{kgText(g.mass_g)} kg</span>
              </>
            )
            return (
              <li key={i}>
                {s ? (
                  <Link to={`/manufacturing/s/${s.id}`} className="rw__row">
                    {inner}
                  </Link>
                ) : (
                  <span className="rw__row">{inner}</span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="soft small">
          CAD weight of “{link.doc_name ?? 'the robot assembly'}”, one row per top-level assembly{not ? ` · ${not} not counted` : ''}. A row pairs with a subsystem once that subsystem is linked to the same Onshape tab.
        </p>
        <Flags link={link} onChange={reload} />
        {(link.summary.heavy?.length ?? 0) > 0 && (
          <details className="more">
            <summary>Heaviest parts</summary>
            <ul className="rows">
              {link.summary.heavy!.map((h, i) => (
                <li key={i}>
                  <span className="row">
                    <span>
                      <span className="strong">{h.name}</span> <span className="soft">{h.qty > 1 ? `×${h.qty} · ` : ''}{h.group}</span>
                    </span>
                    <span className="num strong">{h.kg.toFixed(2)} kg</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {c && c.length === 3 && (
          <>
            <div className="stats">
              {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                <div key={axis}>
                  <span className="stat__l">Centre of mass, {axis}</span>
                  <span className="stat__v">{Math.round(c[i] * 1000)} mm</span>
                </div>
              ))}
            </div>
            <p className="soft small">From the assembly's origin, in Onshape's axes. Approximate: Onshape counts printed parts as solid.</p>
          </>
        )}
        <SyncedLine link={link} />
      </div>
    </section>
  )
}
