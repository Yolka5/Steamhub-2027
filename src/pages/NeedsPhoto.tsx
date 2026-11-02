import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ui'
import { updatePiece, uploadPhoto } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { needsPhoto, sizeLabel } from '../lib/stock'
import { useStore } from '../lib/store'

// Walk the racks with a phone: tap, shoot, next. Each photo uploads on its own.

export default function NeedsPhoto() {
  const { pieces, upsertLocal } = useStore()
  const { userId, name, session, signIn } = useAuth()
  const toast = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const list = pieces.filter((p) => p.status !== 'used' && needsPhoto(p))

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Needs photo</h1>
        <Link to="/stock" className="q-btn">
          Done
        </Link>
      </div>
      <p className="soft">{list.length ? `${list.length} pieces to shoot. Tap the camera next to each one.` : 'Every piece has a photo.'}</p>
      {!session && (
        <button type="button" className="q-btn q-btn--main" onClick={() => signIn()}>
          Sign in with Google to add photos
        </button>
      )}
      <ul className="rows">
        {list.map((p) => (
          <li key={p.id} className="row row--tall">
            <Link to={`/stock/${p.id}`} className="row__main">
              <span className="num strong">{p.id}</span>
              <span className="num soft">
                {sizeLabel(p)} · {p.length} mm{p.location ? ` · ${p.location}` : ''}
              </span>
              {p.notes && <span className="soft small">{p.notes}</span>}
            </Link>
            {session && (
              <label className="q-btn row__end" aria-label={`Take photo of ${p.id}`}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !userId || !name) return
                    setBusyId(p.id)
                    const up = await uploadPhoto(p.id, file)
                    if (up.error) {
                      setBusyId(null)
                      return toast(up.error)
                    }
                    const notes = p.notes && /reshoot|blurry|no photo/i.test(p.notes) ? null : p.notes
                    const res = await updatePiece(p.id, { photo_url: up.url!, notes }, { userId, name })
                    setBusyId(null)
                    if (res.piece) {
                      upsertLocal(res.piece)
                      toast(`${p.id} photo saved`)
                    } else toast(res.error ?? 'Could not save')
                  }}
                />
                {busyId === p.id ? 'Uploading' : <Icon name="camera" />}
              </label>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
