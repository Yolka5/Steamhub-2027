import { Link } from 'react-router-dom'
import { KINDS, sizeLabel, type Match, type Piece } from '../lib/stock'
import { StatusTag } from './PieceCard'
import { Copy } from './ui'

/** The same search results as the cards, as a dense table with no photos. */
export function PieceTable({ matches, showLeft, best, onReserve }: { matches: Match[]; showLeft: boolean; best?: boolean; onReserve: (p: Piece) => void }) {
  return (
    <div className="table-wrap">
      <table className="ctable num stock-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Shape</th>
            <th>Size (mm)</th>
            <th>Length (mm)</th>
            {showLeft && <th>Left after cut (mm)</th>}
            <th>Material</th>
            <th>Location</th>
            <th>Status</th>
            <th aria-label="Reserve" />
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => {
            const p = m.piece
            const sel = best && i === 0 ? 'is-sel' : undefined
            return (
              <tr key={p.id} className={sel}>
                <td>
                  <Link to={`/stock/${p.id}`} className="strong">
                    {p.id}
                  </Link>
                </td>
                <td className={sel}>{KINDS[p.kind].label}</td>
                <td className={sel}>
                  <Copy value={sizeLabel(p)} />
                </td>
                <td className={sel}>
                  <Copy value={p.length} />
                </td>
                {showLeft && <td className={sel}>{m.leftover == null ? '' : m.leftover < 1 ? 'Exact' : Math.round(m.leftover)}</td>}
                <td className={sel}>{p.material ?? 'Unknown'}</td>
                <td className={sel}>{p.location ?? ''}</td>
                <td className={sel}>
                  <StatusTag piece={p} />
                </td>
                <td className={sel}>
                  {p.status === 'available' && (
                    <button type="button" className="q-btn q-btn--small" onClick={() => onReserve(p)}>
                      Reserve
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
