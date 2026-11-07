import { Link } from 'react-router-dom'
import { Poster, ProtoStatusTag } from '../../components/proto'
import { keyLines, paramsOf, usePrototypes } from '../../lib/proto'

// On a Manufacturing subsystem page: the chosen prototype first with its key parameters, then the
// others. Matched by season and subsystem number, so V1 and V2 show the same prototypes.

export function SubsystemPrototypes({ season, number, name }: { season: number; number: number; name: string }) {
  const { prototypes, tests, params } = usePrototypes(season)
  const mine = prototypes.filter((p) => p.subsystem_number === number)
  if (!mine.length) return null
  const chosen = mine.filter((p) => p.status === 'chosen')
  const others = mine.filter((p) => p.status !== 'chosen' && p.status !== 'dropped')
  const lastOf = (id: string) => tests.filter((t) => t.prototype_id === id).sort((a, b) => b.n - a.n)[0]

  return (
    <section className="pt-subsys">
      <div className="mfg-bar-head">
        <h2 className="section__title">Prototypes</h2>
        <span className="pt-subsys__links small">
          <Link to={`/prototypes/summary?sub=${number}&season=${season}`} className="soft">
            Season summary
          </Link>
          <Link to={`/prototypes?sub=${number}`} className="soft">
            All {mine.length} {name} prototypes
          </Link>
        </span>
      </div>
      {chosen.map((p) => {
        const last = lastOf(p.id)
        const lines = last ? keyLines(paramsOf(p, params), last.values, true) : []
        return (
          <Link key={p.id} to={`/prototypes/${p.id}`} className="pt-chosen">
            <Poster path={p.cover_path} className="pt-poster pt-poster--small" />
            <span className="row__main">
              <span className="pt-card__top">
                <span className="strong" dir="auto">
                  {p.name}
                </span>
                <ProtoStatusTag status={p.status} />
              </span>
              {p.status_note && (
                <span className="soft small" dir="auto">
                  {p.status_note}
                </span>
              )}
              {lines.length > 0 && <span className="small num">{lines.join(' · ')}</span>}
            </span>
          </Link>
        )
      })}
      {others.length > 0 && (
        <p className="soft small pt-subsys__others">
          {chosen.length ? 'Also tried: ' : 'Being tried: '}
          {others.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link to={`/prototypes/${p.id}`} dir="auto">
                {p.name}
              </Link>
            </span>
          ))}
        </p>
      )}
    </section>
  )
}
