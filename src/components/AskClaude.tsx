// SteamLab's question box (ONSHAPE.md phase 4). Claude answers from what Steamhub has saved: parts,
// who leads what, and the last Onshape sync. It shows the figures it used, so the answer can be checked.
import { useState, type FormEvent } from 'react'
import { askClaude, type Answer } from '../lib/claude'
import { useToast } from './ui'

const IDEAS = ['How heavy is each subsystem?', 'Which parts have no material?', 'What changed in CAD this week?']

export function AskClaude() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [got, setGot] = useState<{ q: string; a: Answer } | null>(null)

  const ask = async (text: string) => {
    const question = text.trim()
    if (busy) return toast('Claude is still answering')
    if (question.length < 3) return toast('Write a question first')
    setBusy(true)
    const res = await askClaude(question)
    setBusy(false)
    if (res.error || !res.data) return toast(res.error ?? "Claude didn't answer. Try again.")
    setGot({ q: question, a: res.data })
    setQ('')
  }

  return (
    <>
      <h2 className="section__title">Ask Claude</h2>
      <form
        className="sl-ask__form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          ask(q)
        }}
      >
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder="How heavy is the intake?" aria-label="Question for Claude" />
        <button type="submit" className="q-btn">
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {got ? (
        <div className="sl-ask__answer">
          <p className="soft small">{got.q}</p>
          <p>{got.a.answer}</p>
          {got.a.numbers.length > 0 && (
            <dl className="sl-ask__nums num">
              {got.a.numbers.map((n, i) => (
                <div key={i}>
                  <dt>{n.label}</dt>
                  <dd>{n.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : (
        <p className="soft small sl-ask__ideas">
          Answers come from parts and the last Onshape sync.{' '}
          {IDEAS.map((idea, i) => (
            <span key={idea}>
              {i > 0 && ' · '}
              <button type="button" className="text-btn" onClick={() => ask(idea)}>
                {idea}
              </button>
            </span>
          ))}
        </p>
      )}
    </>
  )
}
