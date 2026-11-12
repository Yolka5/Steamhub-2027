import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useBusy, useToast } from './ui'
import { useAuth } from '../lib/auth'
import { pushState, testPush, turnOffPush, turnOnPush, type PushState } from '../lib/push'

// Turning phone notifications on, on the Notifications page (always) and on Home (once, until
// it's on or dismissed on this device).

const DISMISS_KEY = 'push-card-dismissed'

export function PushCard({ home = false }: { home?: boolean }) {
  const { userId } = useAuth()
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, run] = useBusy()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return home && localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    pushState().then(setState, () => setState('unsupported'))
  }, [])

  if (!state || dismissed) return null
  // Home only asks; the Notifications page also shows on, off and blocked.
  if (home && state !== 'off' && state !== 'ios-install') return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode */
    }
  }

  const on = () =>
    run(async () => {
      if (!userId) return
      const err = await turnOnPush(userId)
      setState(await pushState())
      toast(err ?? 'Notifications are on for this phone')
    })

  return (
    <section className="push-card" aria-label="Phone notifications">
      <span className="push-card__icon">
        <Icon name="bell" />
      </span>
      <div className="push-card__text">
        <h2 className="push-card__title">{state === 'on' ? 'Phone notifications are on' : 'Get notifications on this phone'}</h2>
        <p className="soft small">
          {state === 'ios-install'
            ? 'On iPhone, add Steamhub to the home screen first: Share, then Add to Home Screen. Open it from there and turn notifications on.'
            : state === 'denied'
              ? 'They’re blocked for Steamhub. Allow notifications in the browser or phone settings, then come back.'
              : state === 'unsupported'
                ? 'This browser can’t show them. Use Chrome on Android, or Steamhub from the iPhone home screen.'
                : state === 'on'
                  ? 'Tasks, reminders, your update, urgent parts and CAD changes reach this phone.'
                  : 'Reminders to send your update, tasks you’re given, urgent parts and CAD changes, even when Steamhub is closed.'}
        </p>
      </div>
      <div className="push-card__acts">
        {state === 'off' && (
          <button type="button" className="q-btn q-btn--main" onClick={on}>
            {busy ? 'Turning on' : 'Turn on'}
          </button>
        )}
        {state === 'on' && (
          <>
            <button
              type="button"
              className="q-btn"
              onClick={() =>
                run(async () => {
                  if (!userId) return
                  const err = await testPush(userId)
                  toast(err ?? 'Sent. It should arrive in a few seconds.')
                })
              }
            >
              Send a test
            </button>
            <button
              type="button"
              className="q-btn"
              onClick={() =>
                run(async () => {
                  await turnOffPush()
                  setState(await pushState())
                  toast('Off for this phone')
                })
              }
            >
              Turn off
            </button>
          </>
        )}
        {home && (
          <button type="button" className="icon-btn" aria-label="Not now" onClick={dismiss}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </section>
  )
}
