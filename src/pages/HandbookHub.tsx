import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { PARTS, sectionsOf, type PartId } from './Handbook'

// The Handbook section opens on a choice, the same way Tools does, with the same cards.

const ORDER: { id: PartId; icon: IconName; what: string }[] = [
  { id: 'design', icon: 'book', what: 'עקרונות תכן, טיפוס, דריבלר, סלאפ דאון וזיוות, וצ’ק ליסט לאישור מכלול.' },
  { id: 'sources', icon: 'external', what: 'תחרויות ופורומים, גלריות ושרטוטים, קבוצות ובלוגים ששווה ללמוד מהם, ואיך לחפש.' },
]

export default function HandbookHub() {
  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Handbook</h1>
      </div>
      <div className="tools hb-hub" dir="rtl" lang="he">
        {ORDER.map(({ id, icon, what }) => {
          const p = PARTS[id]
          return (
            <Link key={id} to={p.path} className="tool hb-hub__card">
              <span className="tool__icon">
                <Icon name={icon} />
              </span>
              <span className="tool__name">{p.title}</span>
              <span className="tool__what">{what}</span>
              <span className="tool__host">{sectionsOf(id).length} פרקים</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
