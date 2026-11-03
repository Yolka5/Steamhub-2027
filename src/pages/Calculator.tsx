import { useSearchParams } from 'react-router-dom'
import { ExplainToggle } from '../components/Help'
import { Indicator } from '../components/Indicator'
import { useAuth } from '../lib/auth'
import { ExplainProvider } from '../lib/explain'
import { useCalcRobot } from '../lib/useCalcRobot'
import { GuideTab } from './calc/GuideTab'
import { CurvesTab, MotorsTab, SwerveTab, VoltageTab } from './calc/OtherTabs'
import { RobotTab } from './calc/RobotTab'
import { CenterTab, SheetTab } from './calc/ShopTabs'

const TABS = [
  { id: 'robot', label: 'Robot' },
  { id: 'swerve', label: 'Swerve' },
  { id: 'curves', label: 'Motor curves' },
  { id: 'voltage', label: 'Voltage map' },
  { id: 'motors', label: 'Motors' },
  { id: 'center', label: 'Center distance' },
  { id: 'sheet', label: 'Cheat sheet' },
  { id: 'guide', label: 'Guide' },
] as const

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function Calculator() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'robot') as (typeof TABS)[number]['id']
  const { session, userId, name, signIn } = useAuth()
  const calc = useCalcRobot(userId && name ? { userId, name } : null)

  // Explanations only exist for the workbook tabs.
  const explainable = !['center', 'sheet', 'guide'].includes(tab)

  return (
    <ExplainProvider>
      <div className="page page--wide">
        <div className="page__head">
          <h1 className="page__title">Calculator</h1>
          <p className="soft small calc-saved">
            {calc.updatedAt ? `Team robot saved by ${calc.updatedBy?.split(' ')[0] ?? 'someone'}, ${ago(calc.updatedAt)}` : 'Team robot: starting numbers from the spreadsheet'}
          </p>
        </div>

        {calc.hasDraft && (
          <div className="draft" role="status">
            <div className="draft__text">
              <strong>You're trying changes.</strong> Only you see them until you save.
              {calc.teamChanged && <span className="draft__warn"> Someone saved the team robot after you started, so saving replaces their version.</span>}
              {calc.error && <span className="error"> {calc.error}</span>}
            </div>
            <div className="draft__actions">
              <button type="button" className="q-btn" onClick={calc.discard}>
                Discard
              </button>
              {session ? (
                <button type="button" className="q-btn q-btn--main" onClick={calc.save} disabled={calc.saving}>
                  {calc.saving ? 'Saving' : 'Save to team robot'}
                </button>
              ) : (
                <button type="button" className="q-btn q-btn--main" onClick={() => signIn()}>
                  Sign in to save
                </button>
              )}
            </div>
          </div>
        )}

        <div className="calc-bar">
          <div className="picks picks--seg calc-tabs" role="tablist" aria-label="Calculator sections">
            <Indicator selector='[aria-selected="true"]' />
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className="pick"
                aria-selected={tab === t.id}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set('tab', t.id)
                  next.delete('m')
                  setParams(next, { replace: true })
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {explainable && <ExplainToggle />}
        </div>

        {tab === 'robot' && <RobotTab robot={calc.robot} update={calc.update} />}
        {tab === 'swerve' && <SwerveTab robot={calc.robot} update={calc.update} />}
        {tab === 'curves' && <CurvesTab robot={calc.robot} initial={params.get('m')} />}
        {tab === 'voltage' && <VoltageTab robot={calc.robot} />}
        {tab === 'motors' && <MotorsTab robot={calc.robot} update={calc.update} />}
        {tab === 'center' && <CenterTab />}
        {tab === 'sheet' && <SheetTab />}
        {tab === 'guide' && <GuideTab />}
      </div>
    </ExplainProvider>
  )
}
