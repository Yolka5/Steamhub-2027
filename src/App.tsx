import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './components/Icon'
import { Palette } from './components/Palette'
import { ToastProvider } from './components/ui'
import { useAuth } from './lib/auth'
import Home from './pages/Home'
import Stock from './pages/Stock'
import PiecePage from './pages/Piece'
import AddStock from './pages/AddStock'
import NeedsPhoto from './pages/NeedsPhoto'
import { Calculators, Handbook } from './pages/Later'
import Samples from './pages/Samples'

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/stock', label: 'Stock', icon: 'stock' },
  { to: '/calculators', label: 'Calculators', icon: 'calc' },
  { to: '/handbook', label: 'Handbook', icon: 'book' },
]

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c0c0c' : '#fbfbf9')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* private mode */
    }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { session, name, signIn, signOut } = useAuth()
  const [authError, setAuthError] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setPaletteOpen(false), [location.pathname, location.search])

  const account = session ? (
    <button type="button" className="pick" onClick={signOut} title="Sign out">
      <span className="avatar">{name?.[0]?.toUpperCase()}</span>
      <span className="rail__label">{name}</span>
    </button>
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
            <img src="/logo-256.png" alt="" width="36" height="36" />
            <span className="brand__name">Steamhub</span>
          </NavLink>
          <button type="button" className="rail__search" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={18} />
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </button>
          <nav className="picks picks--stack">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="pick">
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="rail__foot picks picks--stack">
            <button type="button" className="pick" onClick={toggleTheme}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              <span className="rail__label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            {account}
            {authError && <p className="rail__error">{authError}</p>}
          </div>
        </aside>

        <header className="topbar">
          <NavLink to="/" className="brand">
            <img src="/logo-256.png" alt="" width="32" height="32" />
            <span className="brand__name">Steamhub</span>
          </NavLink>
          <div className="topbar__end">
            <button type="button" className="icon-btn" aria-label="Search" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" />
            </button>
            <button type="button" className="icon-btn" aria-label="Toggle dark mode" onClick={toggleTheme}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            {session ? (
              <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out">
                <span className="avatar">{name?.[0]?.toUpperCase()}</span>
              </button>
            ) : (
              <button type="button" className="q-btn q-btn--small" onClick={async () => setAuthError(await signIn())}>
                Sign in
              </button>
            )}
          </div>
        </header>

        <main className="main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/stock/add" element={<AddStock />} />
            <Route path="/stock/photos" element={<NeedsPhoto />} />
            <Route path="/stock/:id" element={<PiecePage />} />
            <Route path="/calculators" element={<Calculators />} />
            <Route path="/handbook" element={<Handbook />} />
            <Route path="/samples" element={<Samples />} />
          </Routes>
        </main>

        <nav className="tabbar" aria-label="Main">
          {NAV.slice(0, 2).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end || location.pathname === '/stock/add'}
              className="tab"
            >
              <Icon name={n.icon} size={22} />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/stock/add" className="tab tab--add">
            <span className="tab__plus">
              <Icon name="plus" size={22} />
            </span>
            Add
          </NavLink>
          {NAV.slice(2).map((n) => (
            <NavLink key={n.to} to={n.to} className="tab">
              <Icon name={n.icon} size={22} />
              {n.label === 'Calculators' ? 'Calc' : n.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </ToastProvider>
  )
}
