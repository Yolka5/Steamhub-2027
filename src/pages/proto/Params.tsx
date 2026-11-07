import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Sheet, useToast } from '../../components/ui'
import { addParam, COMMON_PARAMS, deleteParam, fmtValue, updateParam, type ParamDef, type ParamKind, type Prototype, type Value } from '../../lib/proto'

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
  const names = new Set(params.map((d) => d.name.toLowerCase()))
  const suggestions = COMMON_PARAMS.filter((c) => !names.has(c.name.toLowerCase())).slice(0, 6)
  const hasSub = proto.subsystem_number != null

  const quickAdd = async (c: (typeof COMMON_PARAMS)[number]) => {
    const res = await addParam(
      { season: proto.season, subsystem_number: proto.subsystem_number, prototype_id: hasSub ? null : proto.id, name: c.name, unit: c.unit, kind: c.kind, options: c.options ?? [], key: params.filter((d) => d.key).length < 3 },
      params,
    )
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
          <span className="soft small">{d.kind === 'choice' ? d.options.join(', ') : (KINDS.find((k) => k.value === d.kind)?.label ?? '') + (d.unit ? `, ${d.unit}` : '')}</span>
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
          {suggestions.map((c) => (
            <button key={c.name} type="button" className="chip" onClick={() => quickAdd(c)}>
              + {c.name}
            </button>
          ))}
        </div>
      )}
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
  const [confirm, setConfirm] = useState(false)

  const save = async () => {
    if (!name.trim()) return toast('Give it a name, like Compression')
    const opts = options
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    if (kind === 'choice' && opts.length < 2) return toast('List at least two choices, split by commas')
    const row = {
      name: name.trim(),
      unit: kind === 'number' ? unit.trim() : '',
      kind,
      options: kind === 'choice' ? opts : [],
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
          <input className="field" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Flex 30A, Flex 45A, Compliant" />
          <span className="soft small">Split by commas.</span>
        </label>
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
