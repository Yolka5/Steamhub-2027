import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'

// One back button for every page below the main sections. It goes back through the app's own
// history; when the page was opened straight from a link (nothing to go back to), it goes up
// to the section the page belongs to instead of leaving Steamhub.

const TOP = ['/', '/stock', '/tools', '/handbook', '/manufacturing', '/manufacturing/robots', '/manufacturing/wishlist', '/notifications']

/** Where "up" is for a page opened from a link. */
function parentOf(path: string) {
  if (path.startsWith('/manufacturing/')) return '/manufacturing'
  if (path.startsWith('/calculators')) return '/tools'
  if (path.startsWith('/stock/')) return '/stock'
  if (path.startsWith('/handbook/')) return '/handbook'
  return '/'
}

export function BackButton() {
  const location = useLocation()
  const navigate = useNavigate()
  if (TOP.includes(location.pathname)) return null

  // React Router gives the first page of a visit the key "default".
  const hasHistory = location.key !== 'default'

  return (
    <button type="button" className="back" onClick={() => (hasHistory ? navigate(-1) : navigate(parentOf(location.pathname)))}>
      <Icon name="back" size={18} /> Back
    </button>
  )
}
