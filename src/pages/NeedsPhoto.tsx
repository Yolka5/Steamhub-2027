import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ui'
import { updatePiece, uploadPhoto } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { needsPhoto, sizeLabel } from '../lib/stock'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'

// Optional photos. Every piece is drawn from its profile, so a photo only helps for odd pieces
// (holes, bends). Also where Drive photos get copied into Steamhub's own storage.

export default function NeedsPhoto() {
  const { pieces, upsertLocal, reload } = useStore()
  const { userId, name, session, signIn } = useAuth()
  const toast = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const list = pieces.filter((p) => p.status !== 'used' && needsPhoto(p))
  const onDrive = pieces.filter((p) => p.photo_url?.includes('drive.google.com')).length
  const [copying, setCopying] = useState<string | null>(null)

  // Moves Drive photos into Steamhub's own storage, a batch at a time, so they survive the Drive folder.
  const copyFromDrive = async () => {
    let total = 0
    let failed = 0
    setCopying('Starting')
    for (;;) {
      const { data, error } = await supabase.functions.invoke('copy-drive-photos', { body: { batch: 10 } })
      if (error || !data) {
        toast(error?.message ?? 'Could not copy photos')
        break
      }
      total += data.copied.length
      failed = data.failed.length
      setCopying(`${total} copied, ${data.remaining} left`)
      if (data.remaining === 0 || data.copied.length === 0) break
    }
    setCopying(null)
    await reload()
    toast(failed ? `${total} photos copied, ${failed} couldn't be read from Drive` : `${total} photos copied`)
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Stock photos</h1>
        <Link to="/stock" className="q-btn">
          Done
        </Link>
      </div>
      <p className="soft">
        Photos are optional: every piece is already drawn from its profile and length. Add one only when it helps, like a piece with holes or a bend.
        {list.length ? ` ${list.length} pieces have no photo.` : ''}
      </p>
      {!session && (
        <button type="button" className="q-btn q-btn--main" onClick={() => signIn()}>
          Sign in with Google to add photos
        </button>
      )}
      {session && onDrive > 0 && (
        <div className="draft" role="status">
          <div className="draft__text">
            <strong>{onDrive} photos still live on Google Drive.</strong> Copy them into Steamhub so they keep working if the folder stops being shared.
          </div>
          <div className="draft__actions">
            <button type="button" className="q-btn" onClick={copyFromDrive} disabled={!!copying}>
              {copying ?? 'Copy from Drive'}
            </button>
          </div>
        </div>
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
