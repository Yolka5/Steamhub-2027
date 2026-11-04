import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'

// Every tool the team designs with, in one place: ours first, then the outside ones people
// already use. Outside tools are links, not copies, so they stay as their authors keep them.

interface Tool {
  name: string
  what: string
  icon: IconName
  to?: string
  href?: string
  /** Extra words Ctrl K should match, English and Hebrew. */
  keywords?: string
}

export const OUR_TOOLS: Tool[] = [
  { name: 'Motor and gearbox', what: 'Gear ratio, current and battery budget for every mechanism on the robot.', icon: 'calc', to: '/calculators', keywords: 'ratio gearbox current amps kraken מנוע תמסורת' },
  { name: 'Tap drills and holes', what: 'Tap drill, clearance hole and thread depth for any screw, with a thin-wall check.', icon: 'screw', to: '/calculators?tab=sheet', keywords: 'tap tapping drill clearance thread הברזה הברזות קידוח' },
  { name: 'Center distance', what: 'Belt, chain and gear center distances: the belts or gears that fit your spacing, or the spacing for a belt you already have.', icon: 'ruler', to: '/calculators?tab=center', keywords: 'belt chain gear pulley sprocket timing מרחק רצועה שרשרת' },
  { name: 'Swerve ratios', what: 'Compare the three drive ratios: top speed, acceleration and current.', icon: 'wheel', to: '/calculators?tab=swerve', keywords: 'drive drivetrain sds mk5n סוורב' },
  { name: 'Motor curves', what: 'Torque, current, power and efficiency at every speed, for one mechanism or one motor.', icon: 'chart', to: '/calculators?tab=curves', keywords: 'dyno torque power efficiency voltage' },
  { name: 'Cut list', what: 'Every length a mechanism needs, matched to the fewest pieces of stock.', icon: 'cut', to: '/stock/cut', keywords: 'stock cut lengths saw מלאי חיתוך' },
  { name: 'Weight per mechanism', what: 'What each mechanism has reserved from stock, and what it weighs.', icon: 'scale', to: '/stock/mechanisms', keywords: 'weight mass משקל' },
]

export const OUTSIDE_TOOLS: Tool[] = [
  {
    name: 'JVN design calculator',
    what: "John V-Neun's mechanism design spreadsheet. The classic FRC calculator for gearing arms, elevators and drivetrains.",
    icon: 'external',
    href: 'https://docs.google.com/spreadsheets/d/1ElLzEAFQ6bOfMaG-2MHQiVw8LJReAszcMQgOhjoOM1Q/edit?gid=2103172023#gid=2103172023',
    keywords: 'jvn john neun spreadsheet',
  },
  { name: 'AMB calculator', what: 'Transmission calculator the team uses alongside JVN.', icon: 'external', href: 'https://ambcalc.com/', keywords: 'amb transmission' },
  { name: 'ReCalc', what: 'Web calculators for FRC mechanisms: arms, linear mechanisms, flywheels, belts and chains.', icon: 'external', href: 'https://www.reca.lc/', keywords: 'recalc reca.lc flywheel arm linear belt chain' },
]

const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')

function ToolCard({ t }: { t: Tool }) {
  const body = (
    <>
      <span className="tool__icon">
        <Icon name={t.icon} />
      </span>
      <span className="tool__name">{t.name}</span>
      <span className="tool__what">{t.what}</span>
      {t.href && <span className="tool__host">{host(t.href)} ↗</span>}
    </>
  )
  return t.href ? (
    <a className="tool" href={t.href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <Link className="tool" to={t.to!}>
      {body}
    </Link>
  )
}

export default function Tools() {
  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Tools</h1>
      </div>

      <section className="tools-group">
        <h2 className="section__title">Steamhub tools</h2>
        <p className="soft">Built for the team, with the team's stock and robot.</p>
        <div className="tools">
          {OUR_TOOLS.map((t) => (
            <ToolCard key={t.name} t={t} />
          ))}
        </div>
      </section>

      <section className="tools-group">
        <h2 className="section__title">Tools we also use</h2>
        <p className="soft">They open in a new tab.</p>
        <div className="tools">
          {OUTSIDE_TOOLS.map((t) => (
            <ToolCard key={t.name} t={t} />
          ))}
        </div>
      </section>
    </div>
  )
}
