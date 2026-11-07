import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Poster, ProtoStatusTag } from '../../components/proto'
import { Sheet } from '../../components/ui'
import { subLabel, usePrototypes, useSeasons } from '../../lib/proto'
import { NewPrototype } from './Prototypes'

// "Record a test" from Home: pick the prototype, then straight to the camera.

export default function Record() {
  const { current, subsystemsOf } = useSeasons()
  const { prototypes, tests, loading } = usePrototypes(current)
  const subs = subsystemsOf(current)
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const lastAt = (id: string) => tests.filter((t) => t.prototype_id === id).reduce((m, t) => (t.at > m ? t.at : m), '')
  const list = prototypes
    .filter((p) => p.status !== 'dropped')
    .sort((a, b) => (lastAt(b.id) || b.created_at).localeCompare(lastAt(a.id) || a.created_at))

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Record a test</h1>
      </div>
      <p className="soft">Which prototype? Most recently tested first.</p>
      {loading ? (
        <p className="soft">Loading</p>
      ) : (
        <ul className="rows pt-record">
          {list.map((p) => (
            <li key={p.id}>
              <Link to={`/prototypes/${p.id}/test`} className="row row--tall">
                <Poster path={p.cover_path} className="pt-poster pt-poster--small" />
                <span className="row__main">
                  <span className="strong" dir="auto">
                    {p.name}
                  </span>
                  <span className="soft small">{subLabel(p.subsystem_number, subs)}</span>
                </span>
                <ProtoStatusTag status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="q-btn q-btn--wide pt-record__new" onClick={() => setAdding(true)}>
        It's a new prototype
      </button>
      <Sheet open={adding} onClose={() => setAdding(false)} title="New prototype">
        <NewPrototype season={current} subs={subs} defaultSub={null} onDone={(p) => navigate(`/prototypes/${p.id}/test`, { replace: true })} />
      </Sheet>
    </div>
  )
}
