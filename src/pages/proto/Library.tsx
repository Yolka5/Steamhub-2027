import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { LoadError, Sheet, useBusy, useToast } from '../../components/ui'
import { deleteLibItem, saveLibItem, useLibrary, type LibField, type LibItem, type ParamKind } from '../../lib/proto'

// The team's parameter library: the + buttons on a prototype, and what each new subsystem's
// prototypes start with. Edited here, so changing a default never needs code.

const KINDS: { value: ParamKind; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'choice', label: 'Choice' },
  { value: 'text', label: 'Text' },
  { value: 'bool', label: 'Yes / no' },
]

const startsWord = (i: Pick<LibItem, 'starter_for'>) =>
  i.starter_for.includes('*') ? 'Every subsystem' : i.starter_for.length ? i.starter_for.map((w) => w[0].toUpperCase() + w.slice(1)).join(', ') : 'Only from the + button'

/** "Number, in: 2, 2.25, 3" or "Kraken X60, NEO…" for a one-parameter item. */
const fieldWord = (f: LibField) =>
  f.kind === 'choice' ? f.options.join(', ') : `${KINDS.find((k) => k.value === f.kind)?.label ?? ''}${f.unit ? `, ${f.unit}` : ''}${f.options.length ? `: ${f.options.join(', ')}` : ''}`

export default function Library() {
  const { items, loading, error } = useLibrary()
  const [editing, setEditing] = useState<LibItem | 'new' | null>(null)

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <div>
          <h1 className="page__title">Parameter library</h1>
          <p className="soft">What the + buttons on a prototype add, and what a new subsystem's prototypes start with.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="q-btn q-btn--main" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> New
          </button>
        </div>
      </div>

      {error && !items.length ? (
        <LoadError />
      ) : loading && !items.length ? (
        <p className="soft">Loading</p>
      ) : (
        <ul className="rows">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" className="row pt-param" onClick={() => setEditing(i)}>
                <span className="row__main">
                  <span className="pt-param__name">{i.name}</span>
                  <span className="soft small">{i.fields.length === 1 ? fieldWord(i.fields[0]) : i.fields.map((f) => f.name).join(', ')}</span>
                </span>
                <span className="row__end soft small">{startsWord(i)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mfg-foot soft small">
        Changes here apply to the next prototypes. Parameters already on a prototype stay as they are; edit those on the prototype.
      </p>

      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New library item' : 'Library item'}>
        {editing && <ItemForm item={editing === 'new' ? null : editing} position={Math.max(0, ...items.map((i) => i.position)) + 1} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  )
}

const blank = (): LibField => ({ name: '', unit: '', kind: 'number', options: [] })

function ItemForm({ item, position, onDone }: { item: LibItem | null; position: number; onDone: () => void }) {
  const toast = useToast()
  const [busy, run] = useBusy()
  const [name, setName] = useState(item?.name ?? '')
  const [starts, setStarts] = useState(item?.starter_for.join(', ') ?? '')
  // Options are edited as text ("2, 2.25, 3") and split on save.
  const [fields, setFields] = useState(() => (item?.fields.length ? item.fields : [blank()]).map((f) => ({ ...f, text: f.options.join(', ') })))
  const [confirm, setConfirm] = useState(false)

  const set = (i: number, patch: Partial<(typeof fields)[number]>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const save = () =>
    run(async () => {
      const clean: LibField[] = []
      for (const f of fields) {
        if (!f.name.trim()) continue
        const options = f.text
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
        if (f.kind === 'choice' && options.length < 2) return toast(`${f.name}: list at least two choices, split by commas`)
        if (f.kind === 'number' && options.some((o) => !Number.isFinite(Number(o)))) return toast(`${f.name}: sizes are numbers, split by commas`)
        clean.push({
          name: f.name.trim(),
          unit: f.kind === 'number' ? f.unit.trim() : '',
          kind: f.kind,
          options: f.kind === 'choice' || f.kind === 'number' ? options : [],
          only_if: f.only_if?.field && f.only_if.is[0] ? f.only_if : null,
        })
      }
      if (!name.trim()) return toast('Give it a name, like Wheel')
      if (!clean.length) return toast('Add at least one parameter')
      const starter_for = starts
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
        .map((w) => (w === 'every' || w === 'all' ? '*' : w))
      const res = await saveLibItem({ id: item?.id, name: name.trim(), fields: clean, starter_for, position })
      if (res.error) return toast(res.error)
      onDone()
    })

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label className="ctl">
        <span className="ctl__name">Name on the + button</span>
        <input className="field" data-autofocus={!item || undefined} value={name} onChange={(e) => setName(e.target.value)} placeholder="Wheel" />
      </label>
      <label className="ctl">
        <span className="ctl__name">New prototypes start with it when the subsystem is called</span>
        <input className="field" value={starts} onChange={(e) => setStarts(e.target.value)} placeholder="intake, shooter" />
        <span className="soft small">Words split by commas; "every" for all subsystems. Empty: only from the + button.</span>
      </label>

      {fields.map((f, i) => {
        const choices = fields.filter((o, j) => j !== i && o.kind === 'choice' && o.name.trim())
        const on = choices.find((o) => o.name === f.only_if?.field)
        return (
          <fieldset key={i} className="pt-libfield">
            <legend className="soft small">Parameter {fields.length > 1 ? i + 1 : ''}</legend>
            <div className="dims">
              <label className="ctl">
                <span className="ctl__name">Name</span>
                <input className="field" value={f.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Wheel diameter" />
              </label>
              {f.kind === 'number' && (
                <label className="ctl">
                  <span className="ctl__name">Unit</span>
                  <input className="field" value={f.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder="in" />
                </label>
              )}
            </div>
            <div className="picks picks--seg picks--wrap" role="radiogroup" aria-label="Kind">
              {KINDS.map((k) => (
                <button key={k.value} type="button" role="radio" className="pick" aria-checked={f.kind === k.value} onClick={() => set(i, { kind: k.value })}>
                  {k.label}
                </button>
              ))}
            </div>
            {(f.kind === 'choice' || f.kind === 'number') && (
              <label className="ctl">
                <span className="ctl__name">{f.kind === 'choice' ? 'Choices' : 'Sizes to tap (optional)'}</span>
                <input className={`field${f.kind === 'number' ? ' num' : ''}`} value={f.text} onChange={(e) => set(i, { text: e.target.value })} placeholder={f.kind === 'choice' ? 'Compliant, Flex, Stealth' : '2, 2.25, 3, 4'} />
              </label>
            )}
            {choices.length > 0 && (
              <div className="ctl">
                <span className="ctl__name">Show only when</span>
                <div className="dims">
                  <Select
                    value={f.only_if?.field ?? ''}
                    onChange={(v) => set(i, { only_if: v ? { field: v, is: [] } : null })}
                    options={[{ value: '', label: 'Always shown' }, ...choices.map((o) => ({ value: o.name, label: o.name }))]}
                  />
                  {on && (
                    <Select
                      value={f.only_if?.is[0] ?? ''}
                      onChange={(v) => set(i, { only_if: { field: on.name, is: v ? [v] : [] } })}
                      placeholder="is…"
                      options={on.text
                        .split(',')
                        .map((o) => o.trim())
                        .filter(Boolean)
                        .map((o) => ({ value: o, label: `is ${o}` }))}
                    />
                  )}
                </div>
              </div>
            )}
            {fields.length > 1 && (
              <button type="button" className="text-btn" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}>
                Remove this parameter
              </button>
            )}
          </fieldset>
        )
      })}
      <button type="button" className="q-btn q-btn--small" onClick={() => setFields((fs) => [...fs, { ...blank(), text: '' }])}>
        <Icon name="plus" size={18} /> Another parameter in this group
      </button>

      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Saving' : 'Save'}
      </button>
      {item && (
        <div className="pt-form-foot">
          {confirm ? (
            <button
              type="button"
              className="q-btn q-btn--small q-btn--danger"
              onClick={async () => {
                const res = await deleteLibItem(item.id)
                if (res.error) return toast(res.error)
                onDone()
              }}
            >
              Delete {item.name}
            </button>
          ) : (
            <button type="button" className="text-btn" onClick={() => setConfirm(true)}>
              Delete from the library
            </button>
          )}
        </div>
      )}
    </form>
  )
}
