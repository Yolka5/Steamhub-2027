import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KINDS, photoSrc, sizeLabel, type Piece } from '../lib/stock'
import { Copy } from './ui'
import { Icon } from './Icon'
import { StockRender } from './StockRender'

export function Photo({ piece, width = 600, className = '' }: { piece: Piece; width?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = photoSrc(piece.photo_url, width)
  if (!src || failed) {
    return (
      <div className={`photo photo--empty ${className}`}>
        <Icon name="camera" size={22} />
        <span>{src ? 'Photo not shared' : 'No photo yet'}</span>
      </div>
    )
  }
  return (
    <img
      className={`photo ${className}`}
      src={src}
      alt={`${piece.id}, ${sizeLabel(piece)}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

/** The real photo, small in the corner of the drawing, so you can still spot the piece on the rack. */
function PhotoInset({ piece }: { piece: Piece }) {
  const [failed, setFailed] = useState(false)
  const src = photoSrc(piece.photo_url, 160)
  if (!src || failed) return null
  return <img className="card__inset" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

export function StatusTag({ piece }: { piece: Piece }) {
  if (piece.status === 'available') return <span className="tag tag--ok">Available</span>
  if (piece.status === 'reserved')
    return (
      <span className="tag tag--reserved">
        Reserved{piece.reserved_by_name ? ` by ${piece.reserved_by_name.split(' ')[0]}` : ''}
      </span>
    )
  return <span className="tag">Used</span>
}

export function PieceCard({
  piece,
  leftover,
  main,
  onReserve,
}: {
  piece: Piece
  leftover: number | null
  main?: boolean
  onReserve?: (p: Piece) => void
}) {
  return (
    <article className="card">
      <Link to={`/stock/${piece.id}`} className="card__link card__visual" aria-label={`Open ${piece.id}`}>
        <StockRender piece={piece} />
        <PhotoInset piece={piece} />
      </Link>
      <div className="card__body">
        <div className="card__top">
          <Link to={`/stock/${piece.id}`} className="card__id num">
            {piece.id}
          </Link>
          <StatusTag piece={piece} />
        </div>
        <div className="card__size num">
          {KINDS[piece.kind].label} <Copy value={sizeLabel(piece)} />
        </div>
        <div className="card__len">
          <Copy value={piece.length}>
            <span className="card__mm">{piece.length}</span> mm
          </Copy>
          {leftover != null && (
            <span className="card__left num">{leftover < 1 ? 'Exact length' : `${Math.round(leftover)} mm left after cut`}</span>
          )}
        </div>
        <div className="card__meta">
          {piece.material ?? 'Unknown material'}
          {piece.location ? ` · ${piece.location}` : ''}
        </div>
        {piece.status === 'reserved' && piece.reserved_for && <div className="card__meta">For {piece.reserved_for}</div>}
        {onReserve && piece.status === 'available' && (
          <button type="button" className={`q-btn q-btn--wide ${main ? 'q-btn--main' : ''}`} onClick={() => onReserve(piece)}>
            Reserve
          </button>
        )}
      </div>
    </article>
  )
}
