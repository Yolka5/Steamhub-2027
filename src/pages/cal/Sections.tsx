import { useState } from 'react'
import { CalTabs, useCalSeason } from '../../components/cal'
import { CommentChip, CommentsHost } from '../../components/Comments'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { LoadError, Sheet, useBusy, useToast } from '../../components/ui'
import {
  colorPair,
  colorWarning,
  createGroup,
  createSection,
  deleteGroup,
  deleteSection,
  FIXED_SECTIONS,
  groupColor,
  PALETTE,
  sectionColor,
  secStyle,
  updateGroup,
  updateSection,
  type CalGroup,
  type Section,
} from '../../lib/cal'
import { applyRow, putRows, useCal, type Cal } from '../../lib/useCal'
import { usePeople } from '../../lib/useMfg'
import { usePhone } from '../../lib/usePhone'

// Sections: Mechanics, Electronics, Programming, Strategy and any you add. Each has a colour that
// shows everywhere (Board, month, Gantt, filters) and a lead, who gets its daily update reminder.
// Groups you add yourself live here too (Scouting under Strategy), with their own colour if wanted.
// Anyone on the team can change these, like the rest of the Calendar.

export default function SectionsPage() {
  const season = useCalSeason()
  const cal = useCal(season)
  const phone = usePhone()
  const { people } = usePeople()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, run] = useBusy()
  const [colorFor, setColorFor] = useState<{ kind: 'section'; key: string } | { kind: 'group'; id: string } | null>(null)

  if (cal.error && !cal.groups.length) return <LoadError onRetry={cal.reload} />

  const add = () =>
    run(async () => {
      const res = await createSection(name)
      if (res.error) return toast(res.error)
      putRows('cal_sections', [res.data!])
      setName('')
      // Its group for this season is made by the database; reload picks it up.
      await cal.reload()
      const c = PALETTE.find((p) => p.key === res.data!.color)
      toast(`${res.data!.name} added${c ? `, in ${c.name.toLowerCase()}` : ''}. Tap the colour to change it.`)
    })

  const sections = [...cal.sections].sort((a, b) => a.sort - b.sort)

  return (
    <div className="page cal-page cal-sections-page">
      <div className="page__head">
        <h1 className="page__title">Sections</h1>
        {!phone && (
          <div className="cal-head-end">
            <CalTabs />
          </div>
        )}
      </div>
      {phone && <CalTabs />}
      <p className="soft cal-sections-page__lede">
        Each section has its own colour, everywhere in the Calendar, and a lead who gets its daily update reminder. Groups you add sit inside a section.
      </p>

      {cal.loading ? (
        <p className="soft">Loading</p>
      ) : (
        <ol className="cal-sec-list">
          {sections.map((s, i) => (
            <SectionRow
              key={s.key}
              s={s}
              cal={cal}
              people={people}
              first={i === 0}
              last={i === sections.length - 1}
              sections={sections}
              onColor={() => setColorFor({ kind: 'section', key: s.key })}
              onGroupColor={(id) => setColorFor({ kind: 'group', id })}
            />
          ))}
        </ol>
      )}

      <form
        className="cal-quick cal-sec-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <div className="cal-quick__row">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Media" aria-label="New section name" dir="auto" />
          <button type="submit" className="q-btn">
            {busy ? 'Adding' : 'Add section'}
          </button>
        </div>
      </form>

      <Sheet open={!!colorFor} onClose={() => setColorFor(null)} title="Colour">
        {colorFor && <ColorPicker target={colorFor} cal={cal} onDone={() => setColorFor(null)} />}
      </Sheet>
      <CommentsHost cal={cal} people={people} />
    </div>
  )
}

function SectionRow({
  s,
  cal,
  people,
  first,
  last,
  sections,
  onColor,
  onGroupColor,
}: {
  s: Section
  cal: Cal
  people: ReturnType<typeof usePeople>['people']
  first: boolean
  last: boolean
  sections: Section[]
  onColor: () => void
  onGroupColor: (id: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(s.name)
  const [confirm, setConfirm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [adding, setAdding] = useState(false)
  const host = cal.groups.find((g) => g.team === s.key && g.kind === 'team')
  const own = cal.groups.filter((g) => g.team === s.key && g.kind === 'custom').sort((a, b) => a.sort - b.sort)
  const auto = cal.groups.filter((g) => g.team === s.key && g.kind !== 'team' && g.kind !== 'custom')
  const fixed = FIXED_SECTIONS.includes(s.key)
  // Every section can have a lead (Mechanics: Tom Moyal). Its groups (CNC, Workshop, projects) can
  // also have their own, who get their own reminder.
  const ledGroups = cal.groups.filter((g) => g.team === s.key && g.kind !== 'team' && g.lead_id)
  const tasks = cal.tasks.filter((t) => cal.groups.some((g) => g.id === t.group_id && g.team === s.key)).length

  const save = async (patch: Partial<Section>) => {
    putRows('cal_sections', [{ ...s, ...patch }])
    const res = await updateSection(s.key, patch)
    if (res.error) {
      putRows('cal_sections', [s])
      toast(res.error)
      return
    }
    // The section's own group takes the new name too.
    if (patch.name && host) putRows('cal_groups', [{ ...host, name: patch.name }])
  }

  const move = async (dir: -1 | 1) => {
    const i = sections.findIndex((x) => x.key === s.key)
    const other = sections[i + dir]
    if (!other) return
    const a = other.sort === s.sort ? s.sort + dir : other.sort
    putRows('cal_sections', [
      { ...s, sort: a },
      { ...other, sort: s.sort },
    ])
    const r1 = await updateSection(s.key, { sort: a })
    const r2 = await updateSection(other.key, { sort: s.sort })
    if (r1.error || r2.error) toast(r1.error ?? r2.error!)
  }

  const setLead = async (lead: string) => {
    if (!host) return
    putRows('cal_groups', [{ ...host, lead_id: lead || null }])
    const res = await updateGroup(host.id, { lead_id: lead || null })
    if (res.error) {
      putRows('cal_groups', [host])
      toast(res.error)
    }
  }

  const remove = async () => {
    const res = await deleteSection(s.key)
    if (res.error) {
      setConfirm(false)
      return toast(res.error)
    }
    applyRow('cal_sections', 'delete', s)
    for (const g of cal.groups.filter((x) => x.team === s.key)) applyRow('cal_groups', 'delete', g)
    toast(`${s.name} deleted`)
  }

  const addGroup = async () => {
    if (cal.season == null) return
    const res = await createGroup(cal.season, s.key, groupName, cal.groups)
    if (res.error) return toast(res.error)
    putRows('cal_groups', [res.data!])
    setGroupName('')
    setAdding(false)
  }

  return (
    <li className="cal-sec sec" style={secStyle(sectionColor(s.key))}>
      <div className="cal-sec__head">
        <button type="button" className="cal-swatch" aria-label={`Colour of ${s.name}. Change it`} onClick={onColor} />
        <input
          className="field cal-sec__name"
          value={name}
          aria-label="Section name"
          dir="auto"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={() => {
            const v = name.trim()
            if (!v) return setName(s.name)
            if (v !== s.name) save({ name: v })
          }}
        />
        <div className="cal-sec__order">
          {!first && (
            <button type="button" className="icon-btn" aria-label={`Move ${s.name} up`} onClick={() => move(-1)}>
              <Icon name="up" size={16} />
            </button>
          )}
          {!last && (
            <button type="button" className="icon-btn" aria-label={`Move ${s.name} down`} onClick={() => move(1)}>
              <Icon name="down" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="cal-sec__grid">
        <span className="tsheet__label">Lead</span>
        <div>
          <Select
            label={`${s.name} lead`}
            value={host?.lead_id ?? ''}
            onChange={setLead}
            placeholder="No lead"
            options={[{ value: '', label: 'No lead' }, ...people.filter((p) => !p.banned && !p.shared).map((p) => ({ value: p.id, label: p.name }))]}
          />
          {!host?.lead_id && (
            <span className="soft small">
              {ledGroups.length
                ? ` No lead for the whole section. ${ledGroups.length === 1 ? 'Its group’s lead gets' : 'Its groups’ leads get'} their own daily update reminder.`
                : ' Without a lead, nobody is asked for its daily update.'}
            </span>
          )}
        </div>

        <span className="tsheet__label">Groups</span>
        <div className="cal-sec__groups">
          {auto.length > 0 && (
            <p className="soft small">
              Automatic: {auto.map((g) => g.name).join(', ')}
            </p>
          )}
          {own.map((g) => (
            <OwnGroup key={g.id} g={g} cal={cal} onColor={() => onGroupColor(g.id)} github={s.key === 'programming'} />
          ))}
          {adding ? (
            <form
              className="tsheet__add"
              onSubmit={(e) => {
                e.preventDefault()
                addGroup()
              }}
            >
              <input className="field" autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={s.key === 'strategy' ? 'Scouting' : 'Group name'} aria-label={`New group in ${s.name}`} dir="auto" onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
              <button type="submit" className="q-btn">
                Add
              </button>
            </form>
          ) : (
            <button type="button" className="q-btn q-btn--small cal-sec__addgroup" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Group
            </button>
          )}
        </div>
      </div>

      <div className="cal-sec__foot">
        <span className="soft small num">{tasks ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : 'No tasks yet'}</span>
        {host && <CommentChip cal={cal} kind="group" id={host.id} label={s.name} />}
        {!fixed &&
          (confirm ? (
            <span className="tsheet__confirm">
              <button type="button" className="q-btn q-btn--small" onClick={() => setConfirm(false)}>
                Keep it
              </button>
              <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={remove}>
                Delete {s.name}
              </button>
            </span>
          ) : (
            <button type="button" className="q-btn q-btn--small" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={16} /> Delete
            </button>
          ))}
      </div>
    </li>
  )
}

function OwnGroup({ g, cal, onColor, github }: { g: CalGroup; cal: Cal; onColor: () => void; github: boolean }) {
  const toast = useToast()
  const [name, setName] = useState(g.name)
  const [label, setLabel] = useState(g.github_label ?? '')
  const [confirm, setConfirm] = useState(false)
  const n = cal.tasks.filter((t) => t.group_id === g.id).length
  const save = async (patch: Partial<CalGroup>) => {
    putRows('cal_groups', [{ ...g, ...patch }])
    const res = await updateGroup(g.id, patch)
    if (res.error) {
      putRows('cal_groups', [g])
      toast(res.error)
    }
  }
  const remove = async () => {
    const res = await deleteGroup(g.id)
    if (res.error) return toast(res.error)
    applyRow('cal_groups', 'delete', g)
    for (const t of cal.tasks.filter((x) => x.group_id === g.id)) applyRow('tasks', 'delete', t)
    toast(`${g.name} deleted`)
  }
  return (
    <div className="cal-owngroup sec" style={secStyle(groupColor(g))}>
      <button type="button" className="cal-swatch cal-swatch--small" aria-label={`Colour of ${g.name}. Change it`} onClick={onColor} />
      <input
        className="field"
        value={name}
        aria-label="Group name"
        dir="auto"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={() => {
          const v = name.trim()
          if (!v) return setName(g.name)
          if (v !== g.name) save({ name: v })
        }}
      />
      {github && (
        <input
          className="field cal-owngroup__label"
          value={label}
          aria-label={`GitHub label for ${g.name}`}
          placeholder="GitHub label"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={() => {
            const v = label.trim() || null
            if (v !== (g.github_label ?? null)) save({ github_label: v })
          }}
        />
      )}
      {confirm ? (
        <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={remove}>
          {n ? `Delete with ${n} ${n === 1 ? 'task' : 'tasks'}` : 'Delete group'}
        </button>
      ) : (
        <button type="button" className="icon-btn" aria-label={`Delete ${g.name}`} onClick={() => setConfirm(true)}>
          <Icon name="trash" size={16} />
        </button>
      )}
    </div>
  )
}

/** Twelve colours that work in light and dark, or your own with a warning when it's hard to see. */
function ColorPicker({ target, cal, onDone }: { target: { kind: 'section'; key: string } | { kind: 'group'; id: string }; cal: Cal; onDone: () => void }) {
  const toast = useToast()
  const section = target.kind === 'section' ? cal.sections.find((s) => s.key === target.key) : undefined
  const group = target.kind === 'group' ? cal.groups.find((g) => g.id === target.id) : undefined
  const current = section?.color ?? group?.color ?? null
  const [custom, setCustom] = useState(current?.startsWith('#') ? current : colorPair(group ? groupColor(group) : current).light)
  const warning = colorWarning(custom)
  const usedBy = (key: string) =>
    cal.sections
      .filter((s) => s.color === key && s.key !== section?.key)
      .map((s) => s.name)
      .join(', ')

  const pick = async (color: string | null) => {
    if (section) {
      putRows('cal_sections', [{ ...section, color: color ?? 'slate' }])
      const res = await updateSection(section.key, { color: color ?? 'slate' })
      if (res.error) {
        putRows('cal_sections', [section])
        return toast(res.error)
      }
    } else if (group) {
      putRows('cal_groups', [{ ...group, color }])
      const res = await updateGroup(group.id, { color })
      if (res.error) {
        putRows('cal_groups', [group])
        return toast(res.error)
      }
    }
    onDone()
  }

  return (
    <div className="cal-colors">
      <p className="soft small">
        {section ? `${section.name}: its groups, bars and filter use it, unless a group has its own.` : group ? `${group.name}: its own colour, instead of its section's.` : ''}
      </p>
      <div className="cal-colors__grid" role="radiogroup" aria-label="Colour">
        {PALETTE.map((p) => {
          const by = usedBy(p.key)
          return (
            <button key={p.key} type="button" role="radio" aria-checked={current === p.key} className="cal-colors__one sec" style={secStyle(p.key)} onClick={() => pick(p.key)}>
              <span className="cal-swatch" aria-hidden="true" />
              <span className="small">{p.name}</span>
              {by && <span className="soft small cal-colors__by">{by}</span>}
            </button>
          )
        })}
      </div>
      <details className="finder__more cal-colors__more" open={!!current?.startsWith('#')}>
        <summary>Your own colour</summary>
        <div className="cal-colors__custom sec" style={secStyle(custom)}>
          <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Pick a colour" />
          <span className="cal-colors__preview">
            <span className="cal-bar-item cal-bar-item--event sec">How a bar looks</span>
          </span>
          <button type="button" className="q-btn q-btn--small" onClick={() => pick(custom)}>
            Use it
          </button>
        </div>
        {warning && <p className="small cal-colors__warn">{warning}</p>}
      </details>
      {group?.color && (
        <button type="button" className="q-btn q-btn--small" onClick={() => pick(null)}>
          Use the section's colour
        </button>
      )}
    </div>
  )
}
