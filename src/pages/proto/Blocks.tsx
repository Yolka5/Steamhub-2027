import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { useToast } from '../../components/ui'
import { releasePiece, reservePiece, shrink } from '../../lib/actions'
import { useWho } from '../../lib/auth'
import { computeMechanism, type Robot } from '../../lib/calc'
import { DEFAULT_ROBOT } from '../../lib/calcDefaults'
import {
  addBlock,
  BLOCK_WORD,
  deleteBlock,
  fmtValue,
  hostOf,
  resultScore,
  updateBlock,
  uploadPhotoFile,
  useSigned,
  type Block,
  type BlockKind,
  type ParamDef,
  type Prototype,
  type Test,
} from '../../lib/proto'
import { sizeLabel, weight } from '../../lib/stock'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'

// The modular part of a prototype page. Each block saves on its own, so two people editing
// different blocks never overwrite each other. Drag the handle on desktop; up and down on touch.

const KINDS = Object.keys(BLOCK_WORD) as BlockKind[]
const uid = () => Math.random().toString(36).slice(2, 10)

interface Ctx {
  proto: Prototype
  tests: Test[]
  params: ParamDef[]
}

export function Blocks({ proto, blocks, setBlocks, tests, params }: Ctx & { blocks: Block[]; setBlocks: (fn: (b: Block[]) => Block[]) => void }) {
  const who = useWho()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const sorted = useMemo(() => blocks.slice().sort((a, b) => a.position - b.position), [blocks])

  /** Puts the list in a new order and saves only the positions that changed. */
  const reorder = async (next: Block[]) => {
    const withPos = next.map((b, i) => ({ ...b, position: i + 1 }))
    setBlocks(() => withPos)
    const changed = withPos.filter((b) => sorted.find((x) => x.id === b.id)?.position !== b.position)
    const res = await Promise.all(changed.map((b) => updateBlock(b.id, { position: b.position }, who)))
    const err = res.find((r) => r.error)
    if (err) toast(err.error!)
  }

  const move = (id: string, dir: -1 | 1) => {
    const i = sorted.findIndex((b) => b.id === id)
    const j = i + dir
    if (j < 0 || j >= sorted.length) return
    const next = sorted.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    reorder(next)
  }

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const next = sorted.filter((b) => b.id !== dragId)
    const at = next.findIndex((b) => b.id === targetId)
    const fromIdx = sorted.findIndex((b) => b.id === dragId)
    const toIdx = sorted.findIndex((b) => b.id === targetId)
    next.splice(fromIdx < toIdx ? at + 1 : at, 0, sorted.find((b) => b.id === dragId)!)
    setDragId(null)
    reorder(next)
  }

  const add = async (kind: BlockKind) => {
    if (!who) return
    setAdding(false)
    const res = await addBlock(proto.id, kind, blocks, who)
    if (res.error) return toast(res.error)
    setBlocks((b) => (b.some((x) => x.id === res.data!.id) ? b : [...b, res.data!]))
    setTimeout(() => document.getElementById(`block-${res.data!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  return (
    <div className="pt-blocks">
      {sorted.map((b, i) => (
        <BlockFrame
          key={b.id}
          block={b}
          first={i === 0}
          last={i === sorted.length - 1}
          dragging={dragId === b.id}
          onMove={(d) => move(b.id, d)}
          onDragStart={() => setDragId(b.id)}
          onDragEnd={() => setDragId(null)}
          onDrop={() => drop(b.id)}
          onDelete={async () => {
            setBlocks((list) => list.filter((x) => x.id !== b.id))
            const res = await deleteBlock(b)
            if (res.error) toast(res.error)
            else toast(`${b.title || BLOCK_WORD[b.kind].name} deleted`)
          }}
          ctx={{ proto, tests, params }}
        />
      ))}

      {adding ? (
        <div className="pt-add">
          <div className="mfg-bar-head">
            <h3 className="pt-add__title">Add a block</h3>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setAdding(false)}>
              <Icon name="close" />
            </button>
          </div>
          <div className="pt-add__grid">
            {KINDS.map((k) => (
              <button key={k} type="button" className="pt-add__item" onClick={() => add(k)}>
                <span className="strong">{BLOCK_WORD[k].name}</span>
                <span className="soft small">{BLOCK_WORD[k].what}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" className="q-btn pt-add-btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add a block
        </button>
      )}
    </div>
  )
}

function BlockFrame({
  block,
  first,
  last,
  dragging,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
  onDelete,
  ctx,
}: {
  block: Block
  first: boolean
  last: boolean
  dragging: boolean
  onMove: (d: -1 | 1) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
  onDelete: () => void
  ctx: Ctx
}) {
  const who = useWho()
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [over, setOver] = useState(false)
  const [collapsed, setCollapsed] = useState(block.collapsed)
  const [title, setTitle] = useState(block.title)
  useEffect(() => setCollapsed(block.collapsed), [block.collapsed])
  useEffect(() => setTitle(block.title), [block.title])
  const save = (patch: Partial<Block>) => updateBlock(block.id, patch, who)

  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setOver(false)
      onDrop()
    },
  }

  return (
    <section id={`block-${block.id}`} className="pt-block" data-dragging={dragging || undefined} data-over={over || undefined} {...dropProps}>
      <div className="pt-block__head">
        <span
          className="pt-block__grip"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            const sec = (e.currentTarget as HTMLElement).closest('section')
            if (sec) e.dataTransfer.setDragImage(sec, 20, 20)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          title="Drag to move"
          aria-hidden="true"
        >
          <Icon name="grip" size={18} />
        </span>
        <input
          className="pt-block__title"
          value={title}
          aria-label="Block title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== block.title && save({ title: title.trim() || BLOCK_WORD[block.kind].name })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!collapsed}
          onClick={() => {
            setCollapsed(!collapsed)
            save({ collapsed: !collapsed })
          }}
        >
          <Icon name={collapsed ? 'down' : 'up'} size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="Block actions" aria-expanded={menu} onClick={() => (setMenu(!menu), setConfirm(false))}>
          <Icon name="more" />
        </button>
      </div>
      {menu && (
        <div className="pt-block__menu">
          {!first && (
            <button type="button" className="q-btn q-btn--small" onClick={() => onMove(-1)}>
              <Icon name="up" size={18} /> Move up
            </button>
          )}
          {!last && (
            <button type="button" className="q-btn q-btn--small" onClick={() => onMove(1)}>
              <Icon name="down" size={18} /> Move down
            </button>
          )}
          {confirm ? (
            <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={onDelete}>
              Delete block
            </button>
          ) : (
            <button type="button" className="q-btn q-btn--small" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={18} /> Delete
            </button>
          )}
        </div>
      )}
      {!collapsed && <div className="pt-block__body">{body(block, ctx, (data) => save({ data }))}</div>}
    </section>
  )
}

type Save = (data: Record<string, unknown>) => Promise<{ error?: string }>

function body(b: Block, ctx: Ctx, save: Save): ReactNode {
  switch (b.kind) {
    case 'notes':
      return <Notes block={b} save={save} />
    case 'checklist':
      return <Checklist block={b} save={save} />
    case 'proscons':
      return <ProsCons block={b} save={save} />
    case 'links':
      return <Links block={b} save={save} />
    case 'photos':
      return <Photos block={b} save={save} protoId={ctx.proto.id} />
    case 'calc':
      return <CalcBlock block={b} save={save} />
    case 'stock':
      return <StockBlock proto={ctx.proto} />
    case 'chart':
      return <ChartBlock block={b} save={save} tests={ctx.tests} params={ctx.params} />
  }
}

/**
 * Local copy of a block's data that someone is editing. Someone else's save replaces it only
 * while this person isn't typing, so a live update never eats a half-typed word.
 */
function useData<T>(block: Block, key: string, fallback: T, save: Save) {
  const toast = useToast()
  const remote = (block.data[key] as T) ?? fallback
  const [value, setValue] = useState<T>(remote)
  const dirty = useRef(false)
  const timer = useRef(0)
  const json = JSON.stringify(remote)
  useEffect(() => {
    if (!dirty.current) setValue(JSON.parse(json))
  }, [json])
  const flush = async (v: T) => {
    window.clearTimeout(timer.current)
    const res = await save({ ...block.data, [key]: v })
    dirty.current = false
    if (res.error) toast(res.error)
  }
  /** soon: wait for a pause in typing. */
  const change = (v: T, soon = false) => {
    setValue(v)
    dirty.current = true
    window.clearTimeout(timer.current)
    if (soon) timer.current = window.setTimeout(() => flush(v), 900)
    else flush(v)
  }
  return [value, change, () => dirty.current && flush(value)] as const
}

function Notes({ block, save }: { block: Block; save: Save }) {
  const [text, change, flush] = useData(block, 'text', '', save)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = ref.current
    if (t) {
      t.style.height = 'auto'
      t.style.height = `${t.scrollHeight + 2}px`
    }
  }, [text])
  return <textarea ref={ref} className="field pt-notes" dir="auto" value={text} placeholder="What you saw, what to try next" onChange={(e) => change(e.target.value, true)} onBlur={flush} rows={3} />
}

interface Item {
  id: string
  text: string
  done?: boolean
}

/** One-line input that adds an item on Enter. */
function AddLine({ placeholder, onAdd, label = 'Add' }: { placeholder: string; onAdd: (t: string) => void; label?: string }) {
  const [t, setT] = useState('')
  return (
    <form
      className="pt-addline"
      onSubmit={(e) => {
        e.preventDefault()
        if (!t.trim()) return
        onAdd(t.trim())
        setT('')
      }}
    >
      <input className="field" dir="auto" value={t} onChange={(e) => setT(e.target.value)} placeholder={placeholder} />
      <button type="submit" className="q-btn q-btn--small">
        {label}
      </button>
    </form>
  )
}

function Checklist({ block, save }: { block: Block; save: Save }) {
  const [items, change] = useData<Item[]>(block, 'items', [], save)
  const left = items.filter((i) => !i.done).length
  return (
    <div className="pt-list">
      {items.length > 0 && <p className="soft small num">{left ? `${left} of ${items.length} left` : `All ${items.length} done`}</p>}
      <ul className="pt-checks">
        {items.map((it) => (
          <li key={it.id} data-done={it.done || undefined}>
            <label className="check">
              <input type="checkbox" checked={!!it.done} onChange={() => change(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} />
              <span dir="auto">{it.text}</span>
            </label>
            <button type="button" className="icon-btn pt-x" aria-label={`Remove ${it.text}`} onClick={() => change(items.filter((x) => x.id !== it.id))}>
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <AddLine placeholder="Try 45A wheels" onAdd={(text) => change([...items, { id: uid(), text }])} />
    </div>
  )
}

function ProsCons({ block, save }: { block: Block; save: Save }) {
  const [lists, change] = useData<{ pros: Item[]; cons: Item[] }>(block, 'lists', { pros: [], cons: [] }, save)
  const col = (title: string, k: 'pros' | 'cons', tone: string, ph: string) => (
    <div className={`pt-pc ${tone}`}>
      <h4 className="pt-pc__title">{title}</h4>
      <ul className="pt-pc__list">
        {lists[k].map((it) => (
          <li key={it.id}>
            <span dir="auto">{it.text}</span>
            <button type="button" className="icon-btn pt-x" aria-label={`Remove ${it.text}`} onClick={() => change({ ...lists, [k]: lists[k].filter((x) => x.id !== it.id) })}>
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <AddLine placeholder={ph} onAdd={(text) => change({ ...lists, [k]: [...lists[k], { id: uid(), text }] })} />
    </div>
  )
  return (
    <div className="pt-pcs">
      {col('Pros', 'pros', 'pt-pc--pro', 'Grabs from the side')}
      {col('Cons', 'cons', 'pt-pc--con', 'Heavy')}
    </div>
  )
}

interface LinkItem {
  id: string
  url: string
  label: string
}

function Links({ block, save }: { block: Block; save: Save }) {
  const [links, change] = useData<LinkItem[]>(block, 'links', [], save)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const toast = useToast()
  return (
    <div className="pt-list">
      {links.length > 0 && (
        <ul className="rows">
          {links.map((l) => (
            <li key={l.id} className="pt-linkrow">
              <a className="row" href={l.url} target="_blank" rel="noopener noreferrer">
                <Icon name="link" size={18} />
                <span className="row__main">
                  <span dir="auto">{l.label || hostOf(l.url)}</span>
                  <span className="soft small">{hostOf(l.url)} ↗</span>
                </span>
              </a>
              <button type="button" className="icon-btn pt-x" aria-label={`Remove ${l.label || hostOf(l.url)}`} onClick={() => change(links.filter((x) => x.id !== l.id))}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="pt-addline pt-addline--two"
        onSubmit={(e) => {
          e.preventDefault()
          let u = url.trim()
          if (!u) return
          if (!/^https?:\/\//i.test(u)) u = `https://${u}`
          try {
            new URL(u)
          } catch {
            return toast("That doesn't look like a link")
          }
          change([...links, { id: uid(), url: u, label: label.trim() }])
          setUrl('')
          setLabel('')
        }}
      >
        <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="cad.onshape.com/documents/…" inputMode="url" />
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (optional)" />
        <button type="submit" className="q-btn q-btn--small">
          Add
        </button>
      </form>
    </div>
  )
}

interface Photo {
  path: string
}

function Photos({ block, save, protoId }: { block: Block; save: Save; protoId: string }) {
  const [photos, change] = useData<Photo[]>(block, 'photos', [], save)
  const [busy, setBusy] = useState(0)
  const toast = useToast()
  const get = useSigned(photos.map((p) => p.path))
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    const list = [...files].filter((f) => f.type.startsWith('image/'))
    setBusy(list.length)
    const added: Photo[] = []
    for (const f of list) {
      const res = await uploadPhotoFile(protoId, await shrink(f, 1600))
      if (res.error) toast(res.error)
      else added.push({ path: res.path! })
      setBusy((n) => n - 1)
    }
    change([...photos, ...added])
  }
  const remove = async (p: Photo) => {
    change(photos.filter((x) => x.path !== p.path))
    await supabase.storage.from('prototypes').remove([p.path])
  }
  return (
    <div className="pt-photos">
      {photos.map((p) => (
        <div key={p.path} className="pt-photo">
          {get(p.path) ? (
            <a href={get(p.path)!} target="_blank" rel="noopener noreferrer">
              <img src={get(p.path)!} alt="" loading="lazy" />
            </a>
          ) : (
            <span />
          )}
          <button type="button" className="icon-btn pt-photo__x" aria-label="Remove photo" onClick={() => remove(p)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      {Array.from({ length: busy }, (_, i) => (
        <div key={`busy-${i}`} className="pt-photo pt-photo--busy" />
      ))}
      <label className="pt-photo pt-photo--add">
        <Icon name="camera" size={24} />
        <span className="small">Add photos</span>
        <input type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      </label>
    </div>
  )
}

// ---------- Calculator mechanism ----------

let robotCache: Promise<Robot> | null = null
const teamRobot = () =>
  (robotCache ??= Promise.resolve(supabase.from('calc_robots').select('data').eq('id', 'main').maybeSingle()).then(({ data }) => (data?.data as Robot) ?? DEFAULT_ROBOT))

function CalcBlock({ block, save }: { block: Block; save: Save }) {
  const [robot, setRobot] = useState<Robot | null>(null)
  const [mechId, change] = useData<string>(block, 'mech', '', save)
  useEffect(() => {
    teamRobot().then(setRobot)
  }, [])
  if (!robot) return <p className="soft small">Loading the team robot</p>
  const mech = robot.mechanisms.find((m) => m.id === mechId)
  const r = mech ? computeMechanism(mech, robot.motors, robot.voltage) : null
  const ratio = mech ? (mech.mode === 2 ? mech.ratio : r?.op?.ratio) : null
  const stats: [string, string][] = []
  if (mech && r) {
    stats.push(['Ratio', ratio ? `${ratio.toFixed(2)}:1` : '–'])
    if (mech.type === 'roller') {
      if (r.wheelRpm != null) stats.push(['Wheel', `${Math.round(r.wheelRpm)} RPM`])
      if (r.surfaceSpeed != null) stats.push(['Surface', `${r.surfaceSpeed.toFixed(1)} m/s`])
    }
    if (mech.type === 'pivot' && r.outSpeed != null) stats.push(['Arm', `${Math.round(r.outSpeed)} °/s`])
    if (mech.type === 'linear' && r.carriageSpeed != null) stats.push(['Carriage', `${r.carriageSpeed.toFixed(2)} m/s`])
    if (r.batteryAll != null) stats.push(['Battery', `${Math.round(r.batteryAll)} A`])
  }
  return (
    <div className="pt-list">
      <Select value={mechId} onChange={(v) => change(v)} placeholder="Pick a mechanism" options={robot.mechanisms.map((m) => ({ value: m.id, label: m.name }))} />
      {mech && r && (
        <>
          <div className="pt-stats">
            {stats.map(([k, v]) => (
              <div key={k} className="pt-stat">
                <span className="soft small">{k}</span>
                <span className="pt-stat__v num">{v}</span>
              </div>
            ))}
          </div>
          <p className="soft small">
            {mech.motors} × {mech.motor} at {robot.voltage} V. Status: <span className={r.status === 'OK' ? 'strong' : 'pt-warn'}>{r.status.toLowerCase()}</span>.{' '}
            <Link to="/calculators">Open the calculator</Link>
          </p>
        </>
      )}
      {!mech && <p className="soft small">Live numbers from the team robot in the calculator.</p>}
    </div>
  )
}

// ---------- Stock used ----------

function StockBlock({ proto }: { proto: Prototype }) {
  const { pieces, densities, upsertLocal } = useStore()
  const who = useWho()
  const toast = useToast()
  const mine = pieces.filter((p) => p.prototype_id === proto.id && p.status !== 'available')
  const grams = mine.reduce((s, p) => s + (weight(p, densities) ?? 0), 0)

  const reserve = async (raw: string) => {
    if (!who) return
    const id = raw.trim().toUpperCase()
    const piece = pieces.find((p) => p.id.toUpperCase() === id)
    if (!piece) return toast(`No piece ${id} in stock`)
    if (piece.status !== 'available') return toast(`${piece.id} is already ${piece.status}`)
    const res = await reservePiece(piece.id, who, `Prototype: ${proto.name}`, null, null)
    if (res.error) return toast(res.error)
    const { data } = await supabase.from('pieces').update({ prototype_id: proto.id }).eq('id', piece.id).select().single()
    upsertLocal(data ?? { ...res.piece!, prototype_id: proto.id })
    toast(`${piece.id} reserved for ${proto.name}`)
  }

  return (
    <div className="pt-list">
      {mine.length > 0 && (
        <>
          <ul className="rows">
            {mine.map((p) => (
              <li key={p.id} className="pt-linkrow">
                <Link to={`/stock/${p.id}`} className="row">
                  <span className="num strong">{p.id}</span>
                  <span className="row__main num soft">
                    {sizeLabel(p)} · {p.length} mm
                  </span>
                  <span className="row__end soft small">{p.reserved_by_name}</span>
                </Link>
                <button
                  type="button"
                  className="text-btn"
                  onClick={async () => {
                    if (!who) return
                    const res = await releasePiece(p.id, who)
                    if (res.error) return toast(res.error)
                    upsertLocal(res.piece!)
                    toast(`${p.id} back in stock`)
                  }}
                >
                  Release
                </button>
              </li>
            ))}
          </ul>
          {grams > 0 && <p className="soft small num">{(grams / 1000).toFixed(2)} kg of raw stock</p>}
        </>
      )}
      <AddLine placeholder="Piece ID, like TB-014" label="Reserve" onAdd={reserve} />
      <p className="soft small">
        <Link to="/stock">Find stock by size</Link>, then type its ID here.
      </p>
    </div>
  )
}

// ---------- Parameter chart ----------

type YKind = 'result' | 'score' | 'measure'

function ChartBlock({ block, save, tests, params }: { block: Block; save: Save; tests: Test[]; params: ParamDef[] }) {
  const numeric = params.filter((d) => d.kind === 'number')
  const measureName = tests.find((t) => t.measure_name)?.measure_name
  const [cfg, change] = useData<{ x: string; y: YKind }>(block, 'cfg', { x: numeric[0]?.id ?? '', y: measureName ? 'measure' : 'result' }, save)
  const x = numeric.some((d) => d.id === cfg.x) ? cfg.x : (numeric[0]?.id ?? '')
  const y = cfg.y
  const setX = (v: string) => change({ ...cfg, x: v })
  const setY = (v: YKind) => change({ ...cfg, y: v })
  const def = numeric.find((d) => d.id === x)
  if (!numeric.length) return <p className="soft small">Add a number parameter, like Compression, to chart it against the results.</p>
  const points = def
    ? tests
        .map((t) => ({ t, x: Number(t.values[def.id]), y: y === 'result' ? resultScore(t) : y === 'score' ? t.score : t.measure_value }))
        .filter((p): p is { t: Test; x: number; y: number } => Number.isFinite(p.x) && p.y != null && Number.isFinite(Number(p.y)))
    : []
  return (
    <div className="pt-list">
      <div className="pt-chart__pick">
        <Select value={x} onChange={(v) => setX(v)} options={numeric.map((d) => ({ value: d.id, label: d.name }))} />
        <span className="soft small">against</span>
        <Select
          value={y}
          onChange={(v) => setY(v as YKind)}
          options={[{ value: 'result', label: 'Result' }, { value: 'score', label: 'Score' }, ...(measureName ? [{ value: 'measure', label: measureName }] : [])]}
        />
      </div>
      {def && <Scatter points={points} def={def} y={y} yName={y === 'measure' ? (measureName ?? '') : y === 'score' ? 'Score' : 'Result'} />}
    </div>
  )
}

function Scatter({ points, def, y, yName }: { points: { t: Test; x: number; y: number }[]; def: ParamDef; y: YKind; yName: string }) {
  if (points.length < 2) return <p className="soft small">Needs two tests with a {def.name.toLowerCase()} value and a {yName.toLowerCase()}.</p>
  const W = 600
  const H = 240
  const L = 64
  const B = 36
  const T = 22
  const R = 16
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  if (x0 === x1) [x0, x1] = [x0 - 1, x1 + 1]
  const padX = (x1 - x0) * 0.08
  x0 -= padX
  x1 += padX
  const yr = y === 'result' ? [0, 1] : y === 'score' ? [1, 5] : [Math.min(0, ...ys), Math.max(...ys) * 1.15]
  const y0 = yr[0]
  let y1 = yr[1]
  if (y0 === y1) y1 = y0 + 1
  const sx = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R)
  const sy = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B)
  const yTicks = y === 'result' ? [0, 0.5, 1] : y === 'score' ? [1, 2, 3, 4, 5] : niceTicks(y0, y1)
  const xTicks = niceTicks(x0, x1)
  const yLabel = (v: number) => (y === 'result' ? (v === 1 ? 'Worked' : v === 0.5 ? 'Partly' : 'Failed') : String(Math.round(v * 100) / 100))
  return (
    <svg className="pt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${def.name} against ${yName}`}>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="pt-chart__grid" />
          <text x={L - 8} y={sy(v)} className="pt-chart__tick" textAnchor="end" dominantBaseline="middle">
            {yLabel(v)}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <text key={`x${v}`} x={sx(v)} y={H - B + 18} className="pt-chart__tick" textAnchor="middle">
          {Math.round(v * 100) / 100}
        </text>
      ))}
      <text x={W - R} y={H - 4} className="pt-chart__tick" textAnchor="end">
        {def.name}
        {def.unit ? ` (${def.unit})` : ''}
      </text>
      {points.map((p) => (
        <g key={p.t.id}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={7} className="pt-chart__dot" />
          <text x={sx(p.x) + 10} y={sy(p.y) - 9} className="pt-chart__n">
            {p.t.n}
          </text>
        </g>
      ))}
      <title>{points.map((p) => `Test ${p.t.n}: ${fmtValue(def, p.x)}, ${yLabel(p.y)}`).join('\n')}</title>
    </svg>
  )
}

function niceTicks(a: number, b: number, n = 5) {
  const step0 = (b - a) / n
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0
  const out: number[] = []
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}
