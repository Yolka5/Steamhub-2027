import { Link } from 'react-router-dom'
import { PartThumb } from './PartThumb'
import { UrgentTag } from './mfg'
import { partName, partNo, type Machine, type Part } from '../lib/mfg'

// CNC and Workshop on the Calendar: what they're really doing is making parts, so their cards and
// pages show the released parts waiting on their machines, from the manufacturing board.

function summary(list: Part[], verb: string) {
  const doing = list.filter((p) => p.status === 'doing').length
  const urgent = list.filter((p) => p.urgent).length
  const todo = list.length - doing
  return [`${todo} to ${verb}`, doing && `${doing} in progress`, urgent && `${urgent} urgent`].filter(Boolean).join(' · ')
}

/** The full list on the group page. */
export function PartsList({ list, machines }: { list: Part[]; machines: Machine[] }) {
  const cnc = machines.length === 1 && machines[0] === 'CNC'
  return (
    <section className="section">
      <div className="your-tasks__head">
        <h2 className="section__title">
          {cnc ? 'Parts to cut' : 'Parts to make'} <span className="soft num">{list.length}</span>
        </h2>
        <Link to={cnc ? '/manufacturing/board?m=CNC' : '/manufacturing/board'} className="soft small">
          Manufacturing board
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="soft">Nothing released for {cnc ? 'the CNC' : machines.join(', ')} right now.</p>
      ) : (
        <>
          <p className="soft small num">{summary(list, cnc ? 'cut' : 'make')}</p>
          <ul className="rows">
            {list.map((p) => (
              <li key={p.id}>
                <Link to={`/manufacturing/p/${p.id}`} className="row cal-part">
                  <PartThumb part={p} />
                  <span className="num strong">{partNo(p)}</span>
                  <span className="row__main">
                    <span>{partName(p)}</span>
                    <span className="soft small num">
                      {[p.machine, `×${p.qty}`, p.material, p.status === 'doing' ? `In progress${p.maker_name ? ` · ${p.maker_name}` : ''}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {p.urgent && <UrgentTag />}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
