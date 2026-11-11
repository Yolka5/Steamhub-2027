import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Sheet, useToast } from '../../components/ui'
import { Select } from '../../components/Select'
import { addLibItems, addParam, deleteParam, fmtValue, libSuggestions, updateParam, useLibrary, type ParamDef, type ParamKind, type Prototype, type Value } from '../../lib/proto'

// The parameters panel on a prototype. Shared ones belong to the subsystem, so every prototype of
// it shows the same names and lines up in Compare. Own ones belong to this prototype only.

const KINDS: { value: ParamKind; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'choice', label: 'Choice' },
  { value: 'text', label: 'Text' },
  { value: 'bool', label: 'Yes / no' },
]

export function ParamsPanel({ proto, params, current, subName }: { proto: Prototype; params: ParamDef[]; current: Record<string, Value>; subName: string | null }) {
  const toast = useToast()
  const [editing, setEditing] = useState<ParamDef | 'new' | null>(null)
  const shared = params.filter((d) => !d.prototype_id)
  const own = params.filter((d) => d.prototype_id)
  const library = useLibrary().items
  const suggestions = libSuggestions(library, params).slice(0, 6)
  const hasSub = proto.subsystem_number != null
  const nameOf = (id: string) => params.find((d) => d.id === id)?.name ?? 'another parameter'

  const quickAdd = async (item: (typeof library)[number]) => {
    const res = await addLibItems(proto, [item], params)
    if (res.error) toast(res.error)
  }

  const row = (d: ParamDef) => (
    <li key={d.id}>
      <button type="button" className="row pt-param" onClick={() => setEditing(d)}>
        <span className="row__main">
          <span className="pt-param__name">
            {d.name}
            {d.key && <span className="tag tag--reserved">Key</span>}
          </span>
          <span className="soft small">
            {d.kind === 'choice' ? d.options.join(', ') : (KINDS.find((k) => k.value === d.kind)?.label ?? '') + (d.unit ? `, ${d.unit}` : '')}
            {d.only_if ? ` · only when ${nameOf(d.only_if.def)} is ${d.only_if.is.join(' or ')}` : ''}
          </span>
        </span>
        <span className="row__end num">{fmtValue(d, current[d.id])}</span>
      </button>
    </li>
  )

  return (
    <section className="pt-panel">
      <div className="mfg-bar-head">
        <h2 className="section__title">Parameters</h2>
        <button type="button" className="q-btn q-btn--small" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> Add
        </button>
      </div>
      {params.length === 0 && <p className="soft small">What you change between tests: compression, roller size, wheels, speed. Values shown are from the last test.</p>}
      {shared.length > 0 && (
        <>
          {own.length > 0 && <p className="soft small pt-panel__label">Shared with every {subName ?? 'subsystem'} prototype</p>}
          <ul className="rows">{shared.map(row)}</ul>
        </>
      )}
      {own.length > 0 && (
        <>
          <p className="soft small pt-panel__label">Only this prototype</p>
          <ul className="rows">{own.map(row)}</ul>
        </>
      )}
      {suggestions.length > 0 && (
        <div className="chips pt-suggest">
          {suggestions.map((item) => (
            <button key={item.id} type="button" className="chip" onClick={() => quickAdd(item)} title={item.fields.map((f) => f.name).join(', ')}>
              + {item.name}
            </button>
          ))}
        </div>
      )}
      <p className="soft small">
        <Link to="/prototypes/library">Parameter library</Link>: what these buttons add and what new subsystems start with.
      </p>
      {hasSub && params.length > 0 && <p className="soft small">Parameters you add are shared with every {subName ?? 'subsystem'} prototype, so they line up in Compare.</p>}

      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New parameter' : 'Parameter'}>
        {editing && <ParamForm proto={proto} def={editing === 'new' ? null : editing} params={params} subName={subName} onDone={() => setEditing(null)} />}
      </Sheet>
    </section>
  )
}

function ParamForm({ proto, def, params, subName, onDone }: { proto: Prototype; def: ParamDef | null; params: ParamDef[]; subName: string | null; onDone: () => void }) {
  const toast = useToast()
  const hasSub = proto.subsystem_number != null
  const [name, setName] = useState(def?.name ?? '')
  const [unit, setUnit] = useState(def?.unit ?? '')
  const [kind, setKind] = useState<ParamKind>(def?.kind ?? 'number')
  const [options, setOptions] = useState(def?.options.join(', ') ?? '')
  const [key, setKey] = useState(def?.key ?? params.filter((d) => d.key).length < 3)
  const [shared, setShared] = useState(def ? !def.prototype_id : hasSub)
  const [whenDef, setWhenDef] = useState(def?.only_if?.def ?? '')
  const [whenIs, setWhenIs] = useState(def?.only_if?.is[0] ?? '')
  const choices = params.filter((d) => d.kind === 'choice' && d.id !== def?.id)
  const whenOptions = choices.find((d) => d.id === whenDef)?.options ?? []
  const [confirm, setConfirm] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast('Give it a name, like Compression')
    const opts = options
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    if (kind === 'choice' && opts.length < 2) return toast('List at least two choices, split by commas')
    if (kind === 'number' && opts.some((o) => !Number.isFinite(Number(o)))) return toast('Sizes are numbers, split by commas: 2, 2.25, 3')
    const row = {
      name: name.trim(),
      unit: kind === 'number' ? unit.trim() : '',
      kind,
      options: kind === 'choice' || kind === 'number' ? opts : [],
      only_if: whenDef && whenIs ? { def: whenDef, is: [whenIs] } : null,
      key,
      prototype_id: shared && hasSub ? null : proto.id,
      season: proto.season,
      subsystem_number: proto.subsystem_number,
    }
    const res = def ? await updateParam(def.id, row) : await addParam(row, params)
    if (res.error) return toast(res.error)
    onDone()
  }

  const move = async (dir: -1 | 1) => {
    if (!def) return
    const group = params.filter((d) => !!d.prototype_id === !!def.prototype_id)
    const i = group.findIndex((d) => d.id === def.id)
    const other = group[i + dir]
    if (!other) return
    await Promise.all([updateParam(def.id, { position: other.position }), updateParam(other.id, { position: def.position })])
    onDone()
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="dims">
        <label className="ctl">
          <span className="ctl__name">Name</span>
          <input className="field" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Compression" />
        </label>
        {kind === 'number' && (
          <label className="ctl">
            <span className="ctl__name">Unit</span>
            <input className="field" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mm" />
          </label>
        )}
      </div>
      <div className="ctl">
        <span className="ctl__name">Kind</span>
        <div className="picks picks--seg" role="radiogroup" aria-label="Kind">
          {KINDS.map((k) => (
            <button key={k.value} type="button" role="radio" className="pick" aria-checked={kind === k.value} onClick={() => setKind(k.value)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {kind === 'choice' && (
        <label className="ctl">
          <span className="ctl__name">Choices</span>
          <input className="field" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Green 35A, Orange 40A, Blue 50A" />
          <span className="soft small">Split by commas. A test can type a new one, and it joins this list.</span>
        </label>
      )}
      {kind === 'number' && (
        <label className="ctl">
          <span className="ctl__name">Sizes to tap (optional)</span>
          <input className="field num" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="2, 2.25, 2.5, 3, 4" />
          <span className="soft small">Shown as buttons on a test. Any other number can still be typed.</span>
        </label>
      )}
      {choices.length > 0 && (
        <div className="ctl">
          <span className="ctl__name">Show only when (optional)</span>
          <div className="dims">
            <Select
              value={whenDef}
              onChange={(v) => {
                setWhenDef(v)
                setWhenIs('')
              }}
              options={[{ value: '', label: 'Always shown' }, ...choices.map((d) => ({ value: d.id, label: d.name }))]}
            />
            {whenDef && <Select value={whenIs} onChange={setWhenIs} placeholder="is…" options={whenOptions.map((o) => ({ value: o, label: `is ${o}` }))} />}
          </div>
          <span className="soft small">Like Compliant color, shown only when Wheel type is Compliant.</span>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} />
        Key parameter: shown on cards and on the video
      </label>
      {hasSub && (
        <label className="check">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Shared with every {subName ?? 'subsystem'} prototype
        </label>
      )}
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {def ? 'Save parameter' : 'Add parameter'}
      </button>
      {def && (
        <div className="pt-form-foot">
          <button type="button" className="q-btn q-btn--small" onClick={() => move(-1)}>
            <Icon name="up" size={18} /> Move up
          </button>
          <button type="button" className="q-btn q-btn--small" onClick={() => move(1)}>
            <Icon name="down" size={18} /> Move down
          </button>
          {confirm ? (
            <button
              type="button"
              className="q-btn q-btn--small q-btn--danger"
              onClick={async () => {
                const res = await deleteParam(def.id)
                if (res.error) return toast(res.error)
                onDone()
              }}
            >
              Delete parameter
            </button>
          ) : (
            <button type="button" className="text-btn" onClick={() => setConfirm(true)}>
              Delete
            </button>
          )}
        </div>
      )}
      {def && confirm && !def.prototype_id && <p className="soft small">It goes from every {subName ?? 'subsystem'} prototype, and tests stop showing its values.</p>}
    </form>
  )
}
