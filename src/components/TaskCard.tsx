import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Sheet } from './ui'
import { UrgentTag } from './mfg'
import { partName, partNo, type Part } from '../lib/mfg'
import type { useTaskActions, useTaskRules } from '../lib/useTasks'

type Actions = ReturnType<typeof useTaskActions>
type Rules = ReturnType<typeof useTaskRules>

/** Start or Done for a part, when this account may work on it. */
export function TaskButton({ part, actions, rules, big = false }: { part: Part; actions: Actions; rules: Rules; big?: boolean }) {
  if (!rules.canWork(part) || (part.status !== 'todo' && part.status !== 'doing')) return null
  const start = part.status === 'todo'
  return (
    <button
      type="button"
      className={`q-btn ${big ? '' : 'q-btn--small'} task__act`}
      disabled={actions.held.has(part.id)}
      onClick={(e) => {
        e.stopPropagation()
        if (start) actions.start(part)
        else actions.done(part)
      }}
    >
      {start ? 'Start' : 'Done'}
    </button>
  )
}

/**
 * One part on the board or in a person's list. The body opens the part; the end holds Start /
 * Done and the menu. In select mode the whole card ticks instead.
 */
export function TaskCard({
  part,
  sub,
  actions,
  rules,
  onMenu,
  grip,
  select,
  big = false,
  maker,
}: {
  part: Part
  sub: string
  actions: Actions
  rules: Rules
  onMenu?: (p: Part) => void
  /** The drag handle, for leads. */
  grip?: ReactNode
  select?: { on: boolean; toggle: () => void }
  big?: boolean
  /** "In progress · Dana" for a typed-in maker in Unassigned. */
  maker?: string | null
}) {
  const done = part.status === 'done'
  const meta = [part.machine, `×${part.qty}`, sub].filter(Boolean).join(' · ')
  const body = (
    <>
      <span className="task__no num">{partNo(part)}</span>
      <span className="task__main">
        <span className="task__name">{partName(part)}</span>
        <span className="soft small num task__meta">
          {meta}
          {maker ? ` · ${maker}` : ''}
        </span>
      </span>
      <span className="task__tags">
        {part.changed && !done && <span className="tag tag--reserved">Changed</span>}
        {part.urgent && !done && <UrgentTag />}
        {part.status === 'doing' && <span className="tag tag--reserved">In progress</span>}
        {done && <span className="tag tag--ok">Done</span>}
      </span>
    </>
  )
  const cls = `task${big ? ' task--big' : ''}${done ? ' task--done' : ''}${part.urgent && !done ? ' task--urgent' : ''}`
  if (select) {
    return (
      <label className={`${cls} task--select`}>
        <input type="checkbox" className="task__check" checked={select.on} onChange={select.toggle} />
        {body}
      </label>
    )
  }
  return (
    <div className={cls}>
      {grip}
      <Link to={`/manufacturing/p/${part.id}`} className="task__link">
        {body}
      </Link>
      <TaskButton part={part} actions={actions} rules={rules} big={big} />
      {onMenu && (rules.canAssign || rules.canGiveBack(part)) && !done && (
        <button type="button" className="icon-btn task__more" aria-label={`More for ${part.part_no}`} onClick={() => onMenu(part)}>
          <Icon name="more" />
        </button>
      )}
    </div>
  )
}

/** The card's menu: the lead's moves, or Give back for the person it's assigned to. */
export function TaskMenu({ part, actions, rules, onClose }: { part: Part | null; actions: Actions; rules: Rules; onClose: () => void }) {
  const run = (fn: () => unknown) => () => {
    onClose()
    fn()
  }
  return (
    <Sheet open={!!part} onClose={onClose} title={part ? `${part.part_no} ${partName(part)}` : ''}>
      {part && (
        <div className="task-menu">
          {rules.canAssign && part.assignee_id && part.status === 'todo' && (
            <>
              <button type="button" className="q-btn" onClick={run(() => actions.move(part, 'top'))}>
                <Icon name="up" /> Move to the top
              </button>
              <div className="task-menu__pair">
                <button type="button" className="q-btn" onClick={run(() => actions.move(part, 'up'))}>
                  Up one
                </button>
                <button type="button" className="q-btn" onClick={run(() => actions.move(part, 'down'))}>
                  Down one
                </button>
              </div>
            </>
          )}
          {rules.canAssign && (
            <button type="button" className="q-btn" onClick={run(() => actions.assignTo([part]))}>
              <Icon name="people" /> {part.assignee_id ? 'Give to someone else' : 'Give to someone'}
            </button>
          )}
          {rules.canAssign && part.assignee_id && (
            <button type="button" className="q-btn" onClick={run(() => actions.unassign([part]))}>
              Unassign
            </button>
          )}
          {rules.canAssign && (
            <button type="button" className="q-btn" onClick={run(() => actions.toggleUrgent(part))}>
              <Icon name="flag" /> {part.urgent ? 'Not urgent' : 'Urgent'}
            </button>
          )}
          {rules.canGiveBack(part) && (
            <button type="button" className="q-btn" onClick={run(() => actions.handBack(part))}>
              Give back
            </button>
          )}
          {rules.canGiveBack(part) && <p className="soft small">Give back returns it to the workshop lead to hand to someone else.</p>}
        </div>
      )}
    </Sheet>
  )
}
