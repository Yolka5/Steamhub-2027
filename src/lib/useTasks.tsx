import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useWho } from './auth'
import {
  assignParts,
  between,
  askFirst,
  claimPart,
  doneWithNote,
  rejectPart,
  doneRecently,
  giveBack,
  isOpen,
  isTask,
  moveInQueue,
  partName,
  queueSort,
  setStatus,
  unassignParts,
  updatePart,
  logPart,
  type Part,
  type Robot,
  type Subsystem,
} from './mfg'
import { useParts, usePeople, useRobots } from './useMfg'
import { useToast } from '../components/ui'
import { useClaimAs, usePickPerson } from '../components/WhoPicker'
import { useNote } from '../components/NoteSheet'
import { usePlateAsk } from '../components/PlateAsk'

/** What the note sheet says for each kind of pushback (WORKSHOP_TASKS.md, "Pushback"). */
export const NOTE = {
  reject: (p: Part) => ({
    title: `Reject ${p.part_no}`,
    sub: 'It goes back to design, and whoever released it and the subsystem lead get your note.',
    placeholder: 'No 6 mm plate in stock / the drawing is missing the hole sizes',
    button: 'Reject',
  }),
  ask: (p: Part) => ({
    title: `Ask about ${p.part_no}`,
    sub: 'Whoever released it and the subsystem lead get the question. Wait for their answer before you start.',
    placeholder: 'Can I use the 6 mm plate instead of 5 mm?',
    button: 'Send',
  }),
  doneNote: (p: Part) => ({
    title: `${p.part_no} done, with a note`,
    sub: 'It counts as done. Whoever released it and the subsystem lead get your note, and the part is marked Made differently.',
    placeholder: 'Used 6 mm plate instead of 5 mm',
    button: 'Done',
  }),
}

// What the board, the person lists and the workshop list share: the parts the workshop hands
// out, who may do what with each, and the actions (WORKSHOP_TASKS.md).

/** Released, made-in-house parts of active robots, kept live. */
export function useTasks() {
  const { parts, loading, error, reload, put } = useParts({ released: true })
  const { robots, subs, loading: loadingR } = useRobots()
  const { people } = usePeople()
  const live = useMemo(() => {
    const active = new Set(robots.filter((r) => !r.archived).map((r) => r.id))
    return new Map(subs.filter((s) => active.has(s.robot_id)).map((s) => [s.id, s]))
  }, [robots, subs])
  const tasks = useMemo(() => parts.filter((p) => isTask(p) && live.has(p.subsystem_id)), [parts, live])
  return { tasks, parts, robots, subs, live, people, loading: loading || loadingR, error, reload, put }
}

/** One person's list: open parts in order, then the ones done in the last 12 hours. */
export function listOf(tasks: Part[], personId: string | null) {
  const mine = tasks.filter((p) => p.assignee_id === personId)
  return {
    open: mine.filter(isOpen).sort(queueSort),
    done: mine.filter((p) => doneRecently(p)).sort((a, b) => Date.parse(b.done_at!) - Date.parse(a.done_at!)),
  }
}

export const subLabel = (sub: Subsystem | undefined, robot?: Robot, multi = false) => (sub ? `${sub.number} ${sub.name}${multi && robot ? ` (${robot.name})` : ''}` : '')

/**
 * Who may do what with a part:
 * - Start / Done: the person it's assigned to, the shared PC, leads, or anyone when it's unassigned.
 * - Give back: the person it's assigned to, or the shared PC on their behalf.
 */
export function useTaskRules() {
  const { userId, canAssign, shared } = useAuth()
  return useMemo(
    () => ({
      canAssign,
      shared,
      userId,
      canWork: (p: Part) => canAssign || shared || !p.assignee_id || p.assignee_id === userId,
      canGiveBack: (p: Part) => !!p.assignee_id && (p.assignee_id === userId || shared) && isOpen(p),
    }),
    [canAssign, shared, userId],
  )
}

/** Start, Done, Give back and the lead's moves, with toasts. `put` applies saved rows at once. */
export function useTaskActions(put: (rows: Part | Part[]) => void, tasks: Part[]) {
  const who = useWho()
  const { shared } = useAuth()
  const nameOf = useNames()
  const toast = useToast()
  const navigate = useNavigate()
  const { pick, picker } = useClaimAs()
  const { ask, sheet } = usePickPerson()
  const { write, sheet: noteSheet } = useNote()
  const plateAsk = usePlateAsk()
  const running = useRef(new Set<string>())
  const [held, setHeld] = useState<Set<string>>(new Set())
  const hold = useCallback(
    (id: string, on: boolean) =>
      setHeld((s) => {
        const n = new Set(s)
        if (on) n.add(id)
        else n.delete(id)
        return n
      }),
    [],
  )

  const once = async (id: string, run: () => Promise<void>) => {
    if (running.current.has(id)) return
    running.current.add(id)
    hold(id, true)
    try {
      await run()
    } finally {
      running.current.delete(id)
    }
  }

  const start = (p: Part) =>
    once(p.id, async () => {
      if (!who) return hold(p.id, false)
      // On the shared PC: the assignee without asking, otherwise "Who's making it?".
      // A lead starting someone else's part starts it for them.
      const maker = p.assignee_id && p.assignee_id !== who.userId && !shared ? { id: p.assignee_id, name: nameOf(p.assignee_id) } : await pick(p)
      if (maker === null) return hold(p.id, false)
      const res = await claimPart(p, who, maker)
      if (res.error) {
        hold(p.id, false)
        return toast(res.error)
      }
      if (res.data) put(res.data)
      toast(maker ? `${p.part_no} started by ${maker.name.split(' ')[0]}` : `${p.part_no} is yours`)
      // Start turns into Done in the same spot, so it rests a moment: a double tap on Start
      // used to finish the part.
      window.setTimeout(() => hold(p.id, false), 1200)
    })

  const done = (p: Part) =>
    once(p.id, async () => {
      if (!who) return hold(p.id, false)
      // Done with stock reserved also cuts the piece, which the part page does.
      if (p.piece_id) {
        hold(p.id, false)
        return navigate(`/manufacturing/p/${p.id}`)
      }
      const res = await setStatus(p, 'done', who)
      hold(p.id, false)
      if (res.error) return toast(res.error)
      if (res.data) put(res.data)
      toast(`${p.part_no} ${partName(p)} done`, {
        undo: async () => {
          const back = await setStatus(res.data!, 'doing', who)
          if (back.error) return toast(back.error)
          if (back.data) put(back.data)
        },
      })
      if (res.data) plateAsk.after(res.data, put)
    })

  const handBack = (p: Part) =>
    once(p.id, async () => {
      if (!who) return hold(p.id, false)
      const res = await giveBack(p, who)
      hold(p.id, false)
      if (res.error) return toast(res.error)
      if (res.data) put(res.data)
      toast(`${p.part_no} is back with the workshop lead`)
    })

  /** Hands parts to someone picked from the list. */
  const assignTo = async (parts: Part[]) => {
    if (!who || !parts.length) return false
    const person = await ask(parts.length === 1 ? `Who makes ${parts[0].part_no}?` : `Who makes these ${parts.length} parts?`)
    if (!person) return false
    return assign(parts, person)
  }

  const assign = async (parts: Part[], person: { id: string; name: string }, at?: number) => {
    if (!who) return false
    const res = await assignParts(parts, person, who, at)
    if (res.data?.length) put(res.data)
    if (res.error) {
      toast(res.error)
      return false
    }
    if (at === undefined) toast(parts.length === 1 ? `${parts[0].part_no} is ${person.name.split(' ')[0]}'s` : `${parts.length} parts to ${person.name.split(' ')[0]}`)
    return true
  }

  const unassign = async (parts: Part[]) => {
    if (!who) return false
    const res = await unassignParts(parts, who)
    if (res.data?.length) put(res.data)
    if (res.error) {
      toast(res.error)
      return false
    }
    toast(parts.length === 1 ? `${parts[0].part_no} is unassigned` : `${parts.length} parts unassigned`)
    return true
  }

  /** Moves a part in its person's list: to the top, one up or one down. */
  const move = async (p: Part, where: 'top' | 'up' | 'down') => {
    const list = listOf(tasks, p.assignee_id).open.filter((x) => x.status === 'todo')
    const i = list.findIndex((x) => x.id === p.id)
    if (i === -1) return
    const rest = list.filter((x) => x.id !== p.id)
    const to = where === 'top' ? 0 : where === 'up' ? Math.max(0, i - 1) : Math.min(rest.length, i + 1)
    if (to === i) return
    const res = await moveInQueue(p, between(rest[to - 1], rest[to]))
    if (res.error) return toast(res.error)
    if (res.data) put(res.data)
    if (where === 'top' && who) await logPart(p.id, 'moved_top', who)
  }

  /** Drops a card at `index` in a column (a person, or null for Unassigned). */
  const drop = async (p: Part, personId: string | null, index: number, people: { id: string; name: string }[]) => {
    if (personId === null) {
      if (p.assignee_id) await unassign([p])
      return
    }
    const list = listOf(tasks, personId).open.filter((x) => x.id !== p.id)
    const pos = between(list[index - 1], list[index])
    if (p.assignee_id === personId) {
      const res = await moveInQueue(p, pos)
      if (res.error) return toast(res.error)
      if (res.data) put(res.data)
      return
    }
    const person = people.find((x) => x.id === personId)
    if (person) {
      const ok = await assign([p], person, pos)
      if (ok) toast(`${p.part_no} is ${person.name.split(' ')[0]}'s`)
    }
  }

  /** The lead sends it back to design with a note. */
  const reject = async (p: Part) => {
    if (!who) return
    const note = await write(NOTE.reject(p))
    if (!note) return
    const res = await rejectPart(p, note, who)
    if (res.error) return toast(res.error)
    if (res.data) put(res.data)
    toast(`${p.part_no} is back with design`)
  }

  /** A question before starting. On the shared PC, for the person picked. */
  const askAbout = async (p: Part) => {
    if (!who) return
    const by = await pick(p)
    if (by === null) return
    const note = await write(NOTE.ask(p))
    if (!note) return
    const res = await askFirst(p, note, who, by)
    if (res.error) return toast(res.error)
    if (res.data) put(res.data)
    toast('Question sent. You get a notification with the answer.')
  }

  /** Done, but made differently. */
  const doneNote = async (p: Part) => {
    if (!who) return
    const note = await write(NOTE.doneNote(p))
    if (!note) return
    const res = await doneWithNote(p, note, who)
    if (res.error) return toast(res.error)
    if (res.data) put(res.data)
    toast(`${p.part_no} done, note sent`)
    if (res.data) plateAsk.after(res.data, put)
  }

  const toggleUrgent = async (p: Part) => {
    if (!who) return
    const res = await updatePart(p.id, { urgent: !p.urgent })
    if (res.error) return toast(res.error)
    if (res.data) put(res.data)
    await logPart(p.id, p.urgent ? 'not_urgent' : 'urgent', who)
  }

  return { start, done, handBack, assignTo, assign, unassign, move, drop, toggleUrgent, reject, askAbout, doneNote, held, sheets: (
      <>
        {picker}
        {sheet}
        {noteSheet}
        {plateAsk.sheet}
      </>
    ),
  }
}

/** The person names, with a fallback for an account that left. */
export function useNames() {
  const { people } = usePeople()
  return useCallback((id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? 'Someone') : ''), [people])
}
