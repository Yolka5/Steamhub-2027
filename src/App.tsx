import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { PaletteContext } from './lib/palette'
import { supabase } from './lib/supabase'
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
import CncHome from './pages/CncHome'
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
import ShopTool from './pages/ShopTool'
import Workshop from './pages/mfg/Workshop'
import Robots from './pages/mfg/Robots'
import RobotPage from './pages/mfg/Robot'
import SubsystemPage from './pages/mfg/SubsystemPage'
import PartPage from './pages/mfg/PartPage'
import Wishlist from './pages/mfg/Wishlist'
import Bolts from './pages/mfg/Bolts'
import Guide from './pages/mfg/Guide'
import Board, { MfgStart } from './pages/mfg/Board'
import PersonList from './pages/mfg/PersonList'
import LabelPage from './pages/mfg/Label'
import Prototypes from './pages/proto/Prototypes'
import PrototypePage from './pages/proto/PrototypePage'
import TestForm from './pages/proto/TestForm'
import Compare from './pages/proto/Compare'
import Record from './pages/proto/Record'
import Summary from './pages/proto/Summary'
import Library from './pages/proto/Library'
import Plates from './pages/Plates'
import EndMills from './pages/EndMills'
import Notifications from './pages/Notifications'
import People from './pages/People'
import GuidePage from './pages/Guide'
import GuidePoster from './pages/GuidePoster'
import CalendarPage from './pages/cal/Calendar'
import GroupPage from './pages/cal/GroupPage'
import UpdatePage from './pages/cal/UpdatePage'
import CalSummary from './pages/cal/Summary'
import CalImport from './pages/cal/Import'
import SteamLab from './pages/SteamLab'
import { useSteamlabAccess } from './lib/steamlab'
import { refreshPush } from './lib/push'
import { NoAccess, SignIn } from './components/SignIn'
import { useNotifications } from './lib/notifications'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
  /** Other pages that belong to this item, so it stays selected there. */
  also?: string[]
}

const HOME: NavItem = { to: '/', label: 'Home', icon: 'home', end: true }
const STOCK: NavItem = { to: '/stock', label: 'Stock', icon: 'stock' }
const MFG: NavItem = { to: '/manufacturing', label: 'Manufacturing', icon: 'gear' }
const PROTO: NavItem = { to: '/prototypes', label: 'Prototypes', icon: 'flask' }
const CAL: NavItem = { to: '/calendar', label: 'Calendar', icon: 'calendar' }
const TOOLS: NavItem = { to: '/tools', label: 'Tools', icon: 'wrench', also: ['/calculators'] }
const HANDBOOK: NavItem = { to: '/handbook', label: 'Handbook', icon: 'book' }
/** Mentors, leads and admins only (STEAMLAB.md). */
const STEAMLAB: NavItem = { to: '/steamlab', label: 'SteamLab', icon: 'chart' }

const NAV: NavItem[] = [HOME, STOCK, MFG, PROTO, CAL, TOOLS, HANDBOOK]
/** Manufacturing opens where you'd want it: the board, your list or the workshop list (MfgStart). */
const linkTo = (n: NavItem) => (n === MFG ? '/manufacturing/start' : n.to)
/**
 * Phones: the workshop needs Make in reach and leads use the Calendar daily, so those two sit on the
 * right. Tools (with the Handbook inside) is a tile on Home there, and search finds every tool.
 * Add sits in the middle.
 */
const TABS_LEFT: NavItem[] = [HOME, STOCK]
const TABS_RIGHT: { item: NavItem; label: string }[] = [
  { item: MFG, label: 'Make' },
  { item: CAL, label: 'Calendar' },
]

function Bell({ compact = false }: { compact?: boolean }) {
  const { unread } = useNotifications()
  const label = unread ? `Notifications, ${unread} new` : 'Notifications'
  return (
    <Link to="/notifications" className={compact ? 'icon-btn bell' : 'pick bell'} aria-label={compact ? label : undefined}>
      <span className="bell__icon">
        <Icon name="bell" />
        {unread > 0 && <span className="bell__count num">{unread > 9 ? '9+' : unread}</span>}
      </span>
      {!compact && <span className="rail__label">Notifications</span>}
    </Link>
  )
}

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
  const [paletteText, setPaletteText] = useState('')
  const openPalette = useCallback((text = '') => {
    setPaletteText(text)
    setPaletteAnim(true)
    setPaletteOpen(true)
  }, [])
  const { session, ready, banned, userId, room } = useAuth()
  // The CNC room's PC: Home is the CNC Home, so it says so.
  const navLabel = (n: NavItem) => (n === HOME && room === 'cnc' ? 'CNC' : n.label)
  const steamlab = useSteamlabAccess(userId)
  const nav = steamlab ? [...NAV, STEAMLAB] : NAV
  const location = useLocation()

  // How often each section is opened, so two weeks after kickoff the unused ones can go.
  // One counter per section per day, no names (count_view in the database).
  const section = location.pathname.split('/')[1] || 'home'
  useEffect(() => {
    if (!session) return
    supabase.rpc('count_view', { section }).then(
      () => {},
      () => {},
    )
  }, [section, session])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteAnim(false)
        setPaletteText('')
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setPaletteOpen(false), [location.pathname, location.search])

  // A phone with notifications on keeps them pointed at whoever is signed in.
  useEffect(() => {
    if (userId) refreshPush(userId)
  }, [userId])

  // Steamhub is for the team: nothing shows until you're signed in. While that's being checked,
  // the startup frame from index.html stays, so the screen never goes blank.
  // The wall poster is paper: no menus, signed in or not.
  if (location.pathname === '/guide/print') return <GuidePoster />

  if (!ready)
    return (
      <div className="boot" aria-hidden="true">
        <span className="boot__logo" />
      </div>
    )
  // The QR code on the workshop wall opens the guide on phones that aren't signed in yet.
  if (!session && location.pathname === '/guide') return <PublicGuide />
  if (!session) return <SignIn />
  if (banned) return <NoAccess />

  return (
    <PaletteContext.Provider value={openPalette}>
    <ToastProvider>
      <div className="app">
        <aside className="rail" aria-label="Main">
          <NavLink to="/" className="brand">
            <span className="logo" style={{ width: 36, height: 36 }} aria-hidden="true" />
            <span className="brand__name">Steamhub</span>
          </NavLink>
          <button type="button" className="rail__search" onClick={() => openPalette()}>
            <Icon name="search" size={18} />
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </button>
          <nav className="picks picks--stack">
            <Indicator selector='[aria-current="page"]' />
            {nav.map((n) => (
              <Link key={n.to} to={linkTo(n)} className="pick" aria-current={isActive(n, location.pathname) ? 'page' : undefined}>
                <Icon name={n.icon} />
                {navLabel(n)}
              </Link>
            ))}
          </nav>
          <div className="rail__foot picks picks--stack">
            <Bell />
            <button type="button" className="pick" onClick={toggleTheme}>
              <span className="swap" key={theme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </span>
              <span className="rail__label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <AccountMenu placement="up" />
          </div>
        </aside>

        <header className="topbar">
          <NavLink to="/" className="brand">
            <span className="logo" style={{ width: 32, height: 32 }} aria-hidden="true" />
            <span className="brand__name">Steamhub</span>
          </NavLink>
          <div className="topbar__end">
            <button type="button" className="icon-btn" aria-label="Search" onClick={() => openPalette()}>
              <Icon name="search" />
            </button>
            <Bell compact />
            <button type="button" className="icon-btn" aria-label="Toggle dark mode" onClick={toggleTheme}>
              <span className="swap" key={theme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </span>
            </button>
            <AccountMenu placement="down" compact />
          </div>
        </header>

        <main className="main">
          <BackButton />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/cnc" element={<CncHome />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/stock/add" element={<AddStock />} />
            <Route path="/stock/photos" element={<NeedsPhoto />} />
            <Route path="/stock/cut" element={<CutList />} />
            <Route path="/stock/mechanisms" element={<Mechanisms />} />
            <Route path="/stock/:id" element={<PiecePage />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/tools/tap-drills" element={<ShopTool key="sheet" which="sheet" />} />
            <Route path="/tools/center-distance" element={<ShopTool key="center" which="center" />} />
            <Route path="/calculators" element={<Calculator />} />
            <Route path="/handbook" element={<HandbookHub />} />
            <Route path="/handbook/design" element={<Handbook key="design" part="design" />} />
            <Route path="/handbook/sources" element={<Handbook key="sources" part="sources" />} />
            <Route path="/manufacturing" element={<Workshop />} />
            <Route path="/manufacturing/start" element={<MfgStart />} />
            <Route path="/manufacturing/board" element={<Board />} />
            <Route path="/manufacturing/board/:id" element={<PersonList />} />
            <Route path="/manufacturing/mine" element={<PersonList mine />} />
            <Route path="/manufacturing/robots" element={<Robots />} />
            <Route path="/manufacturing/r/:id" element={<RobotPage />} />
            <Route path="/manufacturing/s/:id" element={<SubsystemPage />} />
            <Route path="/manufacturing/p/:id" element={<PartPage />} />
            <Route path="/manufacturing/s/:id/bolts" element={<Bolts />} />
            <Route path="/manufacturing/s/:id/guide" element={<Guide />} />
            <Route path="/manufacturing/wishlist" element={<Wishlist />} />
            <Route path="/manufacturing/label" element={<LabelPage />} />
            <Route path="/prototypes" element={<Prototypes />} />
            <Route path="/prototypes/record" element={<Record />} />
            <Route path="/prototypes/compare" element={<Compare />} />
            <Route path="/prototypes/summary" element={<Summary />} />
            <Route path="/prototypes/library" element={<Library />} />
            <Route path="/prototypes/:id" element={<PrototypePage />} />
            <Route path="/prototypes/:id/test" element={<TestForm key="new" />} />
            <Route path="/prototypes/:id/test/:testId" element={<TestForm />} />
            <Route path="/stock/plates" element={<Plates />} />
            <Route path="/stock/end-mills" element={<EndMills />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/people" element={<People />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/calendar/g/:id" element={<GroupPage />} />
            <Route path="/calendar/update" element={<UpdatePage />} />
            <Route path="/calendar/summary" element={<CalSummary />} />
            <Route path="/calendar/import" element={<CalImport />} />
            <Route path="/steamlab" element={<SteamLab />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <nav className="tabbar" aria-label="Main">
          <Indicator selector='.tab:not(.tab--add)[aria-current="page"]' />
          {TABS_LEFT.map((n) => (
            <Link key={n.to} to={n.to} className="tab" aria-current={isActive(n, location.pathname, true) ? 'page' : undefined}>
              <Icon name={n.icon} size={22} />
              {navLabel(n)}
            </Link>
          ))}
          <NavLink to="/stock/add" className="tab tab--add">
            <span className="tab__plus">
              <Icon name="plus" size={22} />
            </span>
            Add
          </NavLink>
          {TABS_RIGHT.map(({ item: n, label }) => (
            <Link key={n.to} to={linkTo(n)} className="tab" aria-current={isActive(n, location.pathname, true) ? 'page' : undefined}>
              <Icon name={n.icon} size={22} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <Palette open={paletteOpen} animated={paletteAnim} initial={paletteText} onClose={() => setPaletteOpen(false)} />
    </ToastProvider>
    </PaletteContext.Provider>
  )
}

/** The guide for someone not signed in yet: the same page under a plain bar, with Sign in. */
function PublicGuide() {
  return (
    <div className="guide-public">
      <header className="guide-public__bar">
        <Link to="/" className="brand">
          <span className="logo" style={{ width: 32, height: 32 }} aria-hidden="true" />
          <span className="brand__name">Steamhub</span>
        </Link>
      </header>
      <main className="main">
        <GuidePage signedIn={false} />
      </main>
    </div>
  )
}

/** A mistyped or old link: say so, and offer the way back, instead of a blank page. */
function NotFound() {
  return (
    <div className="page page--narrow">
      <h1 className="page__title">Not here</h1>
      <p className="soft">There's no page at this link. It may have moved, or a part or prototype was deleted.</p>
      <div className="page__actions">
        <Link to="/" className="q-btn q-btn--main">
          Home
        </Link>
        <Link to="/manufacturing" className="q-btn">
          Workshop list
        </Link>
      </div>
    </div>
  )
}
