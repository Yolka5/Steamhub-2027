import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { MfgBar } from './mfg'
import { useToast } from './ui'
import { useCalSeason } from './cal'
import { firstName, groupOrder, todayIso } from '../lib/cal'
import { empty, useCounts } from '../lib/counts'
import { supabase } from '../lib/supabase'
import { useCal } from '../lib/useCal'
import { usePeople, useRobots } from '../lib/useMfg'

// A mentor's Home (mentors only for now): the same pieces as everyone's Home plus a few made for
// mentors, in the order each mentor picks. Saved per person in home_layouts, so it follows them
// to any device. Edit mode works like a prototype's blocks: drag the handle, or the arrows on touch.

export type HomeBlock = 'tasks' | 'steamlab' | 'updates' | 'robot' | 'season' | 'activity' | 'workshop' | 'links' | 'answers' | 'mine'

export const HOME_BLOCKS: Record<HomeBlock, { name: string; what: string }> = {
  tasks: { name: 'Your tasks', what: "Your open tasks and today's update" },
  steamlab: { name: 'SteamLab', what: 'The whole SteamLab: schedule, the rooms live, the timeline, recap and feed' },
  updates: { name: "Today's updates", what: 'Which groups sent their daily update, and what they wrote' },
  robot: { name: 'Robot progress', what: 'Every subsystem: parts made, in progress, released' },
  season: { name: 'Season', what: 'The kickoff countdown, then the season robot' },
  activity: { name: 'Activity', what: 'What the team just did' },
  workshop: { name: 'Workshop now', what: 'The machines, live' },
  links: { name: 'Quick links', what: 'Stock, Manufacturing, Calendar, Tools, Handbook' },
  answers: { name: 'Waiting for your answer', what: '"Ask first" questions for you. Hidden when there are none' },
  mine: { name: 'Your parts and stock', what: 'Parts handed to you and stock you reserved' },
}

/** Workshop now isn't in it: mentors look at SteamLab instead. */
export const MENTOR_DEFAULT: HomeBlock[] = ['tasks', 'steamlab', 'updates', 'season', 'robot', 'answers', 'links']

const ALL = Object.keys(HOME_BLOCKS) as HomeBlock[]
const clean = (list: unknown): HomeBlock[] | null =>
  Array.isArray(list) ? [...new Set(list.filter((x): x is HomeBlock => typeof x === 'string' && x in HOME_BLOCKS))] : null

/** The saved order, or the mentor default. null while loading. */
export function useHomeLayout(userId: string | null, on: boolean) {
  const toast = useToast()
  const [blocks, setBlocks] = useState<HomeBlock[] | null>(null)
  useEffect(() => {
    if (!on || !userId) return
    supabase
      .from('home_layouts')
      .select('blocks')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setBlocks(clean(data?.blocks) ?? MENTOR_DEFAULT))
  }, [on, userId])
  const save = async (next: HomeBlock[]) => {
    setBlocks(next)
    if (!userId) return
    const { error } = await supabase.from('home_layouts').upsert({ user_id: userId, blocks: next, updated_at: new Date().toISOString() })
    if (error) toast(error.message)
  }
  return [blocks, save] as const
}

/**
 * The blocks. In edit mode each real block stays on the page, dimmed and not clickable, under a
 * small bar to move or remove it; a tray floats at the bottom to add blocks, Cancel or Save.
 */
export function HomeBlocks({
  blocks,
  render,
  editing,
  onChange,
  onCancel,
  onSave,
}: {
  blocks: HomeBlock[]
  render: (b: HomeBlock) => ReactNode
  editing: boolean
  onChange: (b: HomeBlock[]) => void
  onCancel: () => void
  onSave: () => Promise<void>
}) {
  const [drag, setDrag] = useState<HomeBlock | null>(null)
  const [over, setOver] = useState<HomeBlock | null>(null)
  const [saving, setSaving] = useState(false)
  const missing = ALL.filter((b) => !blocks.includes(b))

  if (!editing)
    return (
      <div className="mhome">
        {blocks.map((b) => (
          <div key={b} className="mhome__block">
            {render(b)}
          </div>
        ))}
      </div>
    )

  const move = (b: HomeBlock, d: -1 | 1) => {
    const i = blocks.indexOf(b)
    const j = i + d
    if (j < 0 || j >= blocks.length) return
    const next = blocks.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const drop = (target: HomeBlock) => {
    if (!drag || drag === target) return
    const from = blocks.indexOf(drag)
    const to = blocks.indexOf(target)
    const next = blocks.filter((b) => b !== drag)
    next.splice(next.indexOf(target) + (from < to ? 1 : 0), 0, drag)
    setDrag(null)
    onChange(next)
  }
  const add = (b: HomeBlock) => {
    onChange([...blocks, b])
    // Show where it landed.
    setTimeout(() => document.getElementById(`hb-${b}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  return (
    <>
      <div className="mhome mhome--edit">
        {blocks.length === 0 && <p className="soft mhome__empty">Home is empty. Add blocks from the tray below.</p>}
        {blocks.map((b, i) => (
          <section
            key={b}
            id={`hb-${b}`}
            className="mhome__frame"
            data-dragging={drag === b || undefined}
            data-over={over === b || undefined}
            onDragOver={(e: DragEvent) => {
              e.preventDefault()
              setOver(b)
            }}
            onDragLeave={() => setOver((o) => (o === b ? null : o))}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              setOver(null)
              drop(b)
            }}
          >
            <div className="mhome__bar">
              <span
                className="mhome__grip"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  const sec = (e.currentTarget as HTMLElement).closest('section')
                  if (sec) e.dataTransfer.setDragImage(sec, 24, 18)
                  setDrag(b)
                }}
                onDragEnd={() => setDrag(null)}
                title="Drag to move"
                aria-hidden="true"
              >
                <Icon name="grip" size={18} />
              </span>
              {/* The block's own heading shows below, so the bar only names blocks that are empty right now. */}
              <span className="mhome__name soft small">{render(b) ? '' : HOME_BLOCKS[b].name}</span>
              <button type="button" className="icon-btn" aria-label={`Move ${HOME_BLOCKS[b].name} up`} onClick={() => (i > 0 ? move(b, -1) : undefined)} data-off={i === 0 || undefined}>
                <Icon name="up" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Move ${HOME_BLOCKS[b].name} down`}
                onClick={() => (i < blocks.length - 1 ? move(b, 1) : undefined)}
                data-off={i === blocks.length - 1 || undefined}
              >
                <Icon name="down" size={18} />
              </button>
              <button type="button" className="icon-btn" aria-label={`Remove ${HOME_BLOCKS[b].name}`} onClick={() => onChange(blocks.filter((x) => x !== b))}>
                <Icon name="close" size={18} />
              </button>
            </div>
            {/* The real block, as it will look, but not clickable while arranging. */}
            <div className="mhome__preview" inert>
              {render(b) ?? <p className="soft small">{HOME_BLOCKS[b].what}</p>}
            </div>
          </section>
        ))}
      </div>

      <div className="mhome-tray" role="toolbar" aria-label="Customise Home">
        <div className="mhome-tray__add">
          <span className="soft small">{missing.length ? 'Add' : 'Every block is on Home'}</span>
          {missing.map((b) => (
            <button key={b} type="button" className="chip" title={HOME_BLOCKS[b].what} onClick={() => add(b)}>
              <Icon name="plus" size={14} /> {HOME_BLOCKS[b].name}
            </button>
          ))}
        </div>
        <div className="mhome-tray__acts">
          <button type="button" className="text-btn" onClick={() => onChange(MENTOR_DEFAULT)}>
            Mentor default
          </button>
          <button type="button" className="q-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="q-btn q-btn--main"
            onClick={async () => {
              setSaving(true)
              await onSave()
              setSaving(false)
            }}
          >
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

// ---------- Blocks made for mentors ----------

/** Each group with a lead: its update for today, or that it hasn't come yet. */
export function UpdatesBlock() {
  const season = useCalSeason()
  const cal = useCal(season)
  const { people } = usePeople()
  const today = todayIso()
  const groups = useMemo(() => cal.groups.filter((g) => g.lead_id).sort(groupOrder), [cal.groups])
  const sent = groups.filter((g) => cal.updates.some((u) => u.group_id === g.id && u.day === today))
  const waiting = groups.filter((g) => !sent.includes(g))
  const nameOf = (id: string | null) => firstName(people.find((p) => p.id === id)?.name)
  return (
    <section className="section mblock">
      <div className="mfg-bar-head">
        <h2 className="section__title">
          Today's updates{' '}
          {!cal.loading && (
            <span className="soft num">
              {sent.length} of {groups.length}
            </span>
          )}
        </h2>
        <Link to="/calendar/summary" className="q-btn q-btn--small">
          All updates
        </Link>
      </div>
      {cal.loading ? (
        <p className="soft small">Loading</p>
      ) : !groups.length ? (
        <p className="soft">No group has a lead yet, so nobody is asked for an update.</p>
      ) : (
        <>
          {sent.length > 0 && (
            <ul className="rows mblock__updates">
              {sent.map((g) => {
                const u = cal.updates.find((x) => x.group_id === g.id && x.day === today)!
                return (
                  <li key={g.id}>
                    <Link to={`/calendar/g/${g.id}`} className="row">
                      <span className="row__main">
                        <span className="strong">
                          {g.name} <span className="soft small">{firstName(people.find((p) => p.id === u.author_id)?.name)}</span>
                        </span>
                        <span className="small" dir="auto">
                          {u.text}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {waiting.length > 0 && (
            <p className="soft small mblock__waiting">
              Not sent yet:{' '}
              {waiting.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ', '}
                  <Link to={`/calendar/g/${g.id}`}>{g.name}</Link> ({nameOf(g.lead_id) || 'no lead'})
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** The live robots and projects, each subsystem with its bar. */
export function RobotBlock() {
  const { robots, subs, loading } = useRobots()
  const counts = useCounts()
  const live = robots.filter((r) => !r.archived).sort((a, b) => Number(a.offseason) - Number(b.offseason) || (b.version ?? 0) - (a.version ?? 0))
  return (
    <section className="section mblock">
      <div className="mfg-bar-head">
        <h2 className="section__title">Robot progress</h2>
        <Link to="/manufacturing/robots" className="q-btn q-btn--small">
          Robots
        </Link>
      </div>
      {loading ? (
        <p className="soft small">Loading</p>
      ) : !live.length ? (
        <p className="soft">No robot yet.</p>
      ) : (
        live.map((r) => {
          const mine = subs.filter((s) => s.robot_id === r.id).sort((a, b) => a.number - b.number)
          return (
            <div key={r.id} className="mblock__robot">
              <Link to={`/manufacturing/r/${r.id}`} className="strong">
                {r.name}
              </Link>
              {!mine.length ? (
                <p className="soft small">No subsystems yet.</p>
              ) : (
                <ul className="mblock__subs">
                  {mine.map((s) => {
                    const c = counts.get(s.id) ?? empty
                    const unreleased = c.made - c.released
                    return (
                      <li key={s.id}>
                        <Link to={`/manufacturing/s/${s.id}`} className="mblock__sub">
                          <span className="num strong">{s.number}</span>
                          <span className="mblock__subname">{s.name}</span>
                          <MfgBar done={c.done} doing={c.doing} of={c.made} />
                          <span className="soft small num">
                            {c.made
                              ? `${c.done}/${c.made} made${c.doing ? ` · ${c.doing} in progress` : ''}${unreleased ? ` · ${unreleased} not released` : ''}`
                              : 'No STEP yet'}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
