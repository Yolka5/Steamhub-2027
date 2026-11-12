import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { Sheet, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { groupOrder, TEAM_WORD, type Team } from '../../lib/cal'
import type { Profile } from '../../lib/mfg'
import type { Cal } from '../../lib/useCal'
import { QuickAdd } from './Board'

// Phones: one + button for a new task instead of a button in every group. It asks which group
// (the last one used, or the one you lead) and takes the same one typed line.

const LAST_KEY = 'cal-last-group'

export function NewTaskButton({ cal, people, team }: { cal: Cal; people: Profile[]; team: Team | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="cal-fab" onClick={() => setOpen(true)} aria-label="New task">
        <Icon name="plus" size={22} />
        <span>Task</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New task">
        {open && <NewTaskForm cal={cal} people={people} team={team} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  )
}

function NewTaskForm({ cal, people, team, onDone }: { cal: Cal; people: Profile[]; team: Team | null; onDone: () => void }) {
  const { userId } = useAuth()
  const toast = useToast()
  const groups = [...cal.groups].sort(groupOrder)
  const [groupId, setGroupId] = useState(() => {
    let last: string | null = null
    try {
      last = localStorage.getItem(LAST_KEY)
    } catch {
      /* private mode */
    }
    return (
      groups.find((g) => g.id === last && (!team || g.team === team))?.id ??
      groups.find((g) => g.lead_id === userId && (!team || g.team === team))?.id ??
      groups.find((g) => !team || g.team === team)?.id ??
      ''
    )
  })
  const group = groups.find((g) => g.id === groupId)

  return (
    <div className="form">
      <label className="ctl">
        <span className="ctl__name">Group</span>
        <Select
          label="Group"
          value={groupId}
          onChange={(v) => {
            setGroupId(v)
            try {
              localStorage.setItem(LAST_KEY, v)
            } catch {
              /* private mode */
            }
          }}
          options={groups.map((g) => ({ value: g.id, label: g.name, group: TEAM_WORD[g.team] }))}
        />
      </label>
      {group && (
        <QuickAdd
          key={group.id}
          group={group}
          cal={cal}
          people={people}
          compact={false}
          autoFocus
          onAdded={(title) => {
            try {
              localStorage.setItem(LAST_KEY, group.id)
            } catch {
              /* private mode */
            }
            toast(`${title} added to ${group.name}`)
            onDone()
          }}
        />
      )}
    </div>
  )
}
