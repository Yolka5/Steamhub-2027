import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { JobLine, ResultTag, TestVideo } from '../../components/proto'
import { Select } from '../../components/Select'
import { LoadError, Sheet, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import { ago, saveFile } from '../../lib/mfg'
import {
  changedSince,
  deletePrototype,
  deleteTest,
  fmtValue,
  keyLines,
  RESULT_WORD,
  saveLayout,
  setProtoStatus,
  signedUrl,
  STATUS_WORD,
  STATUSES,
  subLabel,
  updatePrototype,
  usePrototype,
  usePrototypes,
  useSeasons,
  type ParamDef,
  type Prototype,
  type ProtoStatus,
  type Test,
} from '../../lib/proto'
import { supabase } from '../../lib/supabase'
import { usePeople } from '../../lib/useMfg'
import { Blocks } from './Blocks'
import { ParamsPanel } from './Params'

// One prototype: what it is, every test as video + parameters + result, and its blocks.

export default function PrototypePage() {
  const { id = '' } = useParams()
  const { proto, loading, error, tests, blocks, setBlocks, params, members, reloadMembers } = usePrototype(id)
  const { subsystemsOf } = useSeasons()
  const { nameOf, people } = usePeople()
  const { isAdmin, userId } = useAuth()
  const who = useWho()
  const toast = useToast()
  const navigate = useNavigate()
  const [statusAsk, setStatusAsk] = useState<ProtoStatus | null>(null)
  const [editing, setEditing] = useState(false)
  const siblings = usePrototypes(proto?.season ?? null)

  // Jump to a test from a notification link (#test-4) once the tests are in.
  useEffect(() => {
    const h = window.location.hash
    if (!h.startsWith('#test-') || !tests.length) return
    const t = window.setTimeout(() => document.getElementById(h.slice(1))?.scrollIntoView({ block: 'start' }), 80)
    return () => window.clearTimeout(t)
  }, [tests.length])

  if (!proto)
    return <div className="page">{error ? <LoadError /> : loading ? <p className="soft">Loading</p> : <p className="soft">This prototype doesn't exist anymore.</p>}</div>

  const subs = subsystemsOf(proto.season)
  const sub = subs.find((s) => s.number === proto.subsystem_number)
  const subName = proto.subsystem_number != null ? subLabel(proto.subsystem_number, subs) : null
  const newest = tests.slice().sort((a, b) => b.n - a.n)
  const current = newest[0]?.values ?? {}
  const others = siblings.prototypes.filter((p) => p.id !== proto.id && p.subsystem_number === proto.subsystem_number && proto.subsystem_number != null)
  const canDelete = isAdmin || proto.owner_id === userId || proto.created_by === userId
  const leads = [sub?.lead_id ?? null, ...subsystemsOf(proto.season).filter((s) => s.number === proto.subsystem_number).map((s) => s.lead_id)]

  const pickStatus = async (s: ProtoStatus) => {
    if (s === proto.status) return
    if (s === 'chosen' || s === 'dropped') return setStatusAsk(s)
    if (!who) return
    const res = await setProtoStatus(proto, s, '', who, leads)
    if (res.error) toast(res.error)
  }

  return (
    <div className="page">
      <div className="page__head pt-head">
        <div>
          <h1 className="page__title" dir="auto">
            {proto.name}
          </h1>
          <p className="soft sub-meta">
            {sub ? <Link to={`/prototypes?sub=${sub.number}`}>{subName}</Link> : subName ?? 'No subsystem yet'}
            {proto.concept ? <> · <span dir="auto">{proto.concept}</span></> : null}
            {nameOf(proto.owner_id) ? ` · ${nameOf(proto.owner_id)}` : ''}
            {' · '}
            <button type="button" className="text-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          </p>
          {proto.status_note && (proto.status === 'chosen' || proto.status === 'dropped') && (
            <p className={`pt-verdict ${proto.status === 'chosen' ? 'pt-verdict--ok' : ''}`} dir="auto">
              {STATUS_WORD[proto.status]}: {proto.status_note}
            </p>
          )}
        </div>
        <div className="page__actions">
          {others.some((o) => siblings.tests.some((t) => t.prototype_id === o.id)) && (
            <Link to={`/prototypes/compare?ids=${[proto.id, ...others.map((o) => o.id)].slice(0, 4).join(',')}`} className="q-btn">
              <Icon name="compare" size={18} /> Compare
            </Link>
          )}
          <Link to={`/prototypes/${proto.id}/test`} className="q-btn q-btn--main">
            <Icon name="video" size={18} /> New test
          </Link>
        </div>
      </div>

      <div className="picks picks--seg picks--wrap pt-status" role="radiogroup" aria-label="Status">
        {STATUSES.map((s) => (
          <button key={s} type="button" role="radio" className="pick" aria-checked={proto.status === s} onClick={() => pickStatus(s)}>
            {STATUS_WORD[s]}
          </button>
        ))}
      </div>

      <div className="pt-layout">
        <div className="pt-main">
          <section>
            <h2 className="section__title">Tests</h2>
            {newest.length === 0 ? (
              <div className="mfg-empty">
                <p>Film the prototype running. The parameters you set are saved with the video, so you can compare tries later.</p>
                <Link to={`/prototypes/${proto.id}/test`} className="q-btn">
                  <Icon name="video" size={18} /> Record the first test
                </Link>
              </div>
            ) : (
              <div className="pt-tests">
                {newest.map((t) => (
                  <TestCard key={t.id} proto={proto} test={t} tests={tests} params={params} canDelete={isAdmin || t.by_id === userId || proto.owner_id === userId} />
                ))}
              </div>
            )}
          </section>

          <Blocks proto={proto} blocks={blocks} setBlocks={setBlocks} tests={tests} params={params} />

          {proto.subsystem_number != null && blocks.length > 0 && (
            <p className="mfg-foot soft small">
              <button
                type="button"
                className="text-btn"
                onClick={async () => {
                  const res = await saveLayout(proto.season, proto.subsystem_number!, blocks)
                  toast(res.error ?? `New ${subName} prototypes start with these blocks`)
                }}
              >
                Use these blocks for new {subName} prototypes
              </button>
            </p>
          )}
        </div>

        <aside className="pt-aside">
          <ParamsPanel proto={proto} params={params} current={current} subName={subName} />
          <section className="pt-panel">
            <h2 className="section__title">People</h2>
            <ul className="pt-people">
              {members.map((m) => (
                <li key={m}>
                  <span>{nameOf(m) ?? 'Someone'}</span>
                  {m === proto.owner_id && <span className="soft small">Owner</span>}
                  {m !== proto.owner_id && (
                    <button
                      type="button"
                      className="icon-btn pt-x"
                      aria-label={`Remove ${nameOf(m)}`}
                      onClick={async () => {
                        await supabase.from('prototype_members').delete().eq('prototype_id', proto.id).eq('user_id', m)
                        reloadMembers()
                      }}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <Select
              value=""
              placeholder="Add someone"
              onChange={async (v) => {
                if (!v) return
                const { error } = await supabase.from('prototype_members').insert({ prototype_id: proto.id, user_id: v })
                if (error) toast(error.message)
                reloadMembers()
              }}
              options={people.filter((p) => !p.banned && !members.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))}
            />
            <p className="soft small">People here hear about every new test.</p>
          </section>
        </aside>
      </div>

      <Sheet open={statusAsk != null} onClose={() => setStatusAsk(null)} title={statusAsk === 'chosen' ? 'Choose this prototype' : 'Drop this prototype'}>
        {statusAsk && (
          <StatusReason
            status={statusAsk}
            onDone={async (note) => {
              if (!who) return
              const res = await setProtoStatus(proto, statusAsk, note, who, leads)
              setStatusAsk(null)
              if (res.error) toast(res.error)
              else toast(statusAsk === 'chosen' ? `Chosen. It shows first on the ${subName ?? 'subsystem'} page.` : 'Dropped. It stays in the list under Show dropped.')
            }}
          />
        )}
      </Sheet>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Prototype details">
        {editing && (
          <EditDetails
            proto={proto}
            subs={subs}
            canDelete={canDelete}
            onDone={() => setEditing(false)}
            onDelete={async () => {
              const res = await deletePrototype(proto, tests, blocks)
              if (res.error) return toast(res.error)
              toast(`${proto.name} deleted`)
              navigate('/prototypes')
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

function StatusReason({ status, onDone }: { status: ProtoStatus; onDone: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        onDone(note.trim())
      }}
    >
      <label className="ctl">
        <span className="ctl__name">Why, in one line</span>
        <input
          className="field"
          dir="auto"
          data-autofocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={status === 'chosen' ? 'Fastest intake, 9/10 from the side' : 'Jams on balls that come in at an angle'}
        />
        <span className="soft small">The most useful thing to read next season.</span>
      </label>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {status === 'chosen' ? 'Choose prototype' : 'Drop prototype'}
      </button>
    </form>
  )
}

function EditDetails({
  proto,
  subs,
  canDelete,
  onDone,
  onDelete,
}: {
  proto: Prototype
  subs: { number: number; name: string }[]
  canDelete: boolean
  onDone: () => void
  onDelete: () => void
}) {
  const toast = useToast()
  const { people } = usePeople()
  const [name, setName] = useState(proto.name)
  const [concept, setConcept] = useState(proto.concept)
  const [sub, setSub] = useState(proto.subsystem_number != null ? String(proto.subsystem_number) : '')
  const [owner, setOwner] = useState(proto.owner_id ?? '')
  const [note, setNote] = useState(proto.status_note)
  const [confirm, setConfirm] = useState(false)
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return toast('Give it a name')
        const res = await updatePrototype(proto.id, { name: name.trim(), concept: concept.trim(), subsystem_number: sub ? Number(sub) : null, owner_id: owner || null, status_note: note.trim() })
        if (res.error) return toast(res.error)
        onDone()
      }}
    >
      <label className="ctl">
        <span className="ctl__name">Name</span>
        <input className="field" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="ctl">
        <span className="ctl__name">Concept</span>
        <input className="field" dir="auto" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="2 rollers, over the bumper" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Subsystem</span>
        <Select value={sub} onChange={setSub} options={[{ value: '', label: 'No subsystem yet' }, ...subs.map((s) => ({ value: String(s.number), label: `${s.number} ${s.name}` }))]} />
        {String(proto.subsystem_number ?? '') !== sub && <span className="soft small">Shared parameters come from the new subsystem. Its own parameters stay.</span>}
      </label>
      <label className="ctl">
        <span className="ctl__name">Owner</span>
        <Select value={owner} onChange={setOwner} options={[{ value: '', label: 'No owner' }, ...people.filter((p) => !p.banned).map((p) => ({ value: p.id, label: p.name }))]} />
      </label>
      {(proto.status === 'chosen' || proto.status === 'dropped') && (
        <label className="ctl">
          <span className="ctl__name">Why {proto.status}</span>
          <input className="field" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        Save details
      </button>
      {canDelete && (
        <div className="pt-form-foot">
          {confirm ? (
            <>
              <span className="soft small">Its tests, videos and blocks go too. This can't be undone.</span>
              <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={onDelete}>
                Delete prototype
              </button>
            </>
          ) : (
            <button type="button" className="text-btn" onClick={() => setConfirm(true)}>
              Delete this prototype
            </button>
          )}
        </div>
      )}
    </form>
  )
}

function TestCard({ proto, test, tests, params, canDelete }: { proto: Prototype; test: Test; tests: Test[]; params: ParamDef[]; canDelete: boolean }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [sharing, setSharing] = useState<number | null>(null)
  const changes = changedSince(test, tests, params)
  const changedIds = new Set(changes.map((c) => c.def.id))
  const filled = params.filter((d) => test.values[d.id] !== undefined && test.values[d.id] !== null && test.values[d.id] !== '')
  const hasMedia = !!(test.video_path || test.video_link)

  /** The clip with the parameters burned in, through the phone's share sheet or as a download. */
  const share = async () => {
    if (!test.video_path || sharing != null) return
    try {
      setSharing(0)
      const url = await signedUrl(test.video_path)
      if (!url) throw new Error('The video link expired. Reload and try again.')
      const blob = await (await fetch(url)).blob()
      const lines = [...keyLines(params, test.values, true), test.result ? RESULT_WORD[test.result] : '', test.measure_value != null ? `${test.measure_name || 'Measured'} ${test.measure_value}` : ''].filter(Boolean)
      const { burnIn } = await import('../../lib/video')
      const out = await burnIn(blob, `${proto.name} · test ${test.n}`, lines, (p) => setSharing(p))
      const name = `${proto.name} test ${test.n}.mp4`.replace(/[^\w.\- ]+/g, '_')
      const file = new File([out], name, { type: 'video/mp4' })
      const text = `${proto.name}, test ${test.n}: ${lines.join(', ')}`
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text }).catch(() => {})
      else {
        saveFile(name, out)
        navigator.clipboard?.writeText(text)
        toast('Video saved. The parameters are copied too.')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setSharing(null)
    }
  }

  return (
    <article id={`test-${test.n}`} className="pt-test">
      {hasMedia && <TestVideo test={test} params={params} />}
      <JobLine testId={test.id} />
      <div className="pt-test__head">
        <span className="pt-test__n">Test {test.n}</span>
        <ResultTag result={test.result} />
        {test.score != null && <span className="tag num">{test.score}/5</span>}
        {test.measure_value != null && (
          <span className="tag num">
            {test.measure_name || 'Measured'}: {test.measure_value}
          </span>
        )}
        <span className="soft small pt-test__who">
          {test.by_name} · {ago(test.at)}
        </span>
      </div>
      {changes.length > 0 && (
        <p className="pt-test__changes small num">
          {changes.map((c) => (
            <span key={c.def.id}>
              {c.def.name} {fmtValue(c.def, c.from)} → <strong>{fmtValue(c.def, c.to)}</strong>
            </span>
          ))}
        </p>
      )}
      {test.note && (
        <p className="pt-test__note" dir="auto">
          {test.note}
        </p>
      )}
      {filled.length > 0 && (
        <dl className="pt-values num">
          {filled.map((d) => (
            <div key={d.id} data-changed={changedIds.has(d.id) || undefined}>
              <dt>{d.name}</dt>
              <dd>{fmtValue(d, test.values[d.id])}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="pt-test__actions">
        <Link to={`/prototypes/${proto.id}/test/${test.id}`} className="q-btn q-btn--small">
          <Icon name="edit" size={18} /> Edit
        </Link>
        {test.video_path && (
          <button type="button" className="q-btn q-btn--small" onClick={share}>
            <Icon name="share" size={18} /> {sharing != null ? `Making the video ${Math.round(sharing * 100)}%` : 'Share with parameters'}
          </button>
        )}
        {canDelete && (
          <button type="button" className="icon-btn" aria-label="More" aria-expanded={open} onClick={() => (setOpen(!open), setConfirm(false))}>
            <Icon name="more" />
          </button>
        )}
        {open &&
          (confirm ? (
            <button
              type="button"
              className="q-btn q-btn--small q-btn--danger"
              onClick={async () => {
                const res = await deleteTest(test)
                if (res.error) toast(res.error)
              }}
            >
              Delete test {test.n}
            </button>
          ) : (
            <button type="button" className="q-btn q-btn--small" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={18} /> Delete
            </button>
          ))}
      </div>
    </article>
  )
}
