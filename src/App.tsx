import { useEffect, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './components/Icon'
import { AccountMenu } from './components/AccountMenu'
import { BackButton } from './components/BackButton'
import { Indicator } from './components/Indicator'
import { Palette } from './components/Palette'
import { ToastProvider } from './components/ui'
import { useAuth } from './lib/auth'
import { switchTheme } from './lib/motion'
import Home from './pages/Home'
import Stock from './pages/Stock'
import PiecePage from './pages/Piece'
import AddStock from './pages/AddStock'
import NeedsPhoto from './pages/NeedsPhoto'
import CutList from './pages/CutList'
import Mechanisms from './pages/Mechanisms'
import Handbook from './pages/Handbook'
import HandbookHub from './pages/HandbookHub'
import Calculator from './pages/Calculator'
import Tools from './pages/Tools'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
  /** Other pages that belong to this item, so it stays selected there. */
  also?: string[]
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/stock', label: 'Stock', icon: 'stock' },
  { to: '/tools', label: 'Tools', icon: 'wrench', also: ['/calculators'] },
  { to: '/handbook', label: 'Handbook', icon: 'book' },
]

/** Stock stays unselected on Add, which has its own tab on phones. */
function isActive(n: NavItem, path: string, phone = false) {
  if (phone && path === '/stock/add') return false
  if (n.end) return path === n.to
  return [n.to, ...(n.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`))
}

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')

  const toggle = (e: MouseEvent) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // The DOM has to change inside the transition callback, so the theme is applied right there.
    switchTheme(
      () => {
        document.documentElement.dataset.theme = next
        flushSync(() => setTheme(next))
      },
      r.left + r.width / 2,
      r.top + r.height / 2,
    )
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0c0c0c' : '#fbfbf9')
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* private mode */
    }
  }
  return [theme, toggle] as const
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Opened by a click it drops in; opened by Ctrl K it appears instantly, since that happens constantly.
  const [paletteAnim, setPaletteAnim] = useState(false)
  const openPalette = () => {
    setPaletteAnim(true)
    setPaletteOpen(true)
  }
  const { session, signIn } = useAuth()
  const [authError, setAuthError] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteAnim(false)
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setPaletteOpen(false), [location.pathname, location.search])

  const account = session ? (
    <AccountMenu placement="up" />
  ) : (
    <button
      type="button"
      className="pick"
      onClick={async () => setAuthError(await signIn())}
      title="Sign in with Google"
    >
      <span className="avatar avatar--empty" />
      <span className="rail__label">Sign in</span>
    </button>
  )

  return (
    <ToastProvider>
      <div className="app">
        <aside className="rail" aria-label="Main">
          <NavLink to="/" className="brand">
            <img className="logo logo--light" src="/logo-256.png" alt="" width="36" height="36" />
            <img className="logo logo--dark" src="/logo-dark-256.png" alt="" width="36" height="36" />
            <span className="brand__name">Steamhub</span>
          </NavLink>
          <button type="button" className="rail__search" onClick={openPalette}>
            <Icon name="search" size={18} />
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </button>
          <nav className="picks picks--stack">
            <Indicator selector='[aria-current="page"]' />
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="pick" aria-current={isActive(n, location.pathname) ? 'page' : undefined}>
                <Icon name={n.icon} />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="rail__foot picks picks--stack">
            <button type="button" className="pick" onClick={toggleTheme}>
              <span className="swap" key={theme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </span>
              <span className="rail__label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            {account}
            {authError && <p className="rail__error">{authError}</p>}
          </div>
        </aside>

        <header className="topbar">
          <NavLink to="/" className="brand">
            <img className="logo logo--light" src="/logo-256.png" alt="" width="32" height="32" />
            <img className="logo logo--dark" src="/logo-dark-256.png" alt="" width="32" height="32" />
            <span className="brand__name">Steamhub</span>
          </NavLink>
          <div className="topbar__end">
            <button type="button" className="icon-btn" aria-label="Search" onClick={openPalette}>
              <Icon name="search" />
            </button>
            <button type="button" className="icon-btn" aria-label="Toggle dark mode" onClick={toggleTheme}>
              <span className="swap" key={theme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </span>
            </button>
            {session ? (
              <AccountMenu placement="down" compact />
            ) : (
              <button type="button" className="q-btn q-btn--small" onClick={async () => setAuthError(await signIn())}>
                Sign in
              </button>
            )}
          </div>
        </header>

        <main className="main">
          <BackButton />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/stock/add" element={<AddStock />} />
            <Route path="/stock/photos" element={<NeedsPhoto />} />
            <Route path="/stock/cut" element={<CutList />} />
            <Route path="/stock/mechanisms" element={<Mechanisms />} />
            <Route path="/stock/:id" element={<PiecePage />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/calculators" element={<Calculator />} />
            <Route path="/handbook" element={<HandbookHub />} />
            <Route path="/handbook/design" element={<Handbook key="design" part="design" />} />
            <Route path="/handbook/sources" element={<Handbook key="sources" part="sources" />} />
          </Routes>
        </main>

        <nav className="tabbar" aria-label="Main">
          <Indicator selector='.tab:not(.tab--add)[aria-current="page"]' />
          {NAV.slice(0, 2).map((n) => (
            <Link key={n.to} to={n.to} className="tab" aria-current={isActive(n, location.pathname, true) ? 'page' : undefined}>
              <Icon name={n.icon} size={22} />
              {n.label}
            </Link>
          ))}
          <NavLink to="/stock/add" className="tab tab--add">
            <span className="tab__plus">
              <Icon name="plus" size={22} />
            </span>
            Add
          </NavLink>
          {NAV.slice(2).map((n) => (
            <Link key={n.to} to={n.to} className="tab" aria-current={isActive(n, location.pathname, true) ? 'page' : undefined}>
              <Icon name={n.icon} size={22} />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <Palette open={paletteOpen} animated={paletteAnim} onClose={() => setPaletteOpen(false)} />
    </ToastProvider>
  )
}
