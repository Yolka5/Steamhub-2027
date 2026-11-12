import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Indicator } from '../components/Indicator'
import { Icon } from '../components/Icon'
import SHOT_SIZES from '../content/guide-shots.json'

// How to use Steamhub, for new students. Opened from the QR code on the workshop wall, so it's
// phone first and works signed out. Pictures come from scripts/guide-shots (real app, demo data);
// run it again when a screen changes. The wall poster is /guide/print (GuidePoster.tsx).

type ShotName = keyof typeof SHOT_SIZES

interface Step {
  title: string
  body: ReactNode
  shot?: { name: ShotName; alt: string }
}

interface Chapter {
  id: string
  title: string
  intro?: ReactNode
  steps: Step[]
}

const A = ({ to, children }: { to: string; children: ReactNode }) => <Link to={to}>{children}</Link>
const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>

const CHAPTERS: Chapter[] = [
  {
    id: 'start',
    title: 'Getting in',
    steps: [
      {
        title: 'Sign in',
        body: (
          <>
            Open <A to="/">steamhub2027.vercel.app</A> and press <b>Sign in with Google</b>. Any Google account works, and you stay signed in after that.
          </>
        ),
        shot: { name: 'signin', alt: 'The sign-in screen: the Steamhub logo and a Sign in with Google button.' },
      },
      {
        title: 'Find your way on a phone',
        body: 'The tabs at the bottom are Home, Stock, Add, Make and Tools. Add is the orange button in the middle. The Handbook and Prototypes sit inside Tools.',
        shot: { name: 'tabbar', alt: 'The phone tab bar: Home, Stock, Add, Make and Tools.' },
      },
      {
        title: 'Find your way on a computer',
        body: (
          <>
            The menu on the left has every section, Search with <K>Ctrl K</K>, Notifications, Dark mode and your account at the bottom.
          </>
        ),
        shot: { name: 'home-desk', alt: 'Steamhub on a laptop: the menu on the left and the Home page with the search box.' },
      },
    ],
  },
  {
    id: 'home',
    title: 'Home',
    steps: [
      {
        title: 'Search from Home',
        body: (
          <>
            Type a stock size like <code>20x40x1 700</code>, a part number like <code>3004</code> or a thread like <code>M5</code>, then press <b>Find</b>.
          </>
        ),
        shot: { name: 'home', alt: 'Home on a phone: the search box, the part you are making and your reservations.' },
      },
      {
        title: "What you're doing",
        body: "Under the search: the parts you're making, the stock you reserved, and what the team did lately. Tap any of them to open it.",
      },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    intro: 'Every tube, profile, rod, angle and hex in the workshop, with its ID written on it in marker.',
    steps: [
      {
        title: 'Find stock by size',
        body: (
          <>
            In <A to="/stock">Stock</A>, type <code>20x40x1 700</code>: a 20 × 40 profile with a 1 mm wall, at least 700 mm long. The piece that wastes least comes first. <code>round 20/16 500</code> and an ID like <code>TB-014</code> work too.
          </>
        ),
        shot: { name: 'stock-find', alt: 'Stock search for 20x40x1 700, with the best piece, PR-003, on top and a Reserve button.' },
      },
      {
        title: 'Reserve a piece',
        body: "Press Reserve, pick the subsystem it's for, and add the length you plan to cut if you know it. It's yours until you cut or release it.",
        shot: { name: 'stock-reserve', alt: 'The Reserve sheet: subsystem, what for, and planned length.' },
      },
      {
        title: 'Cut, release or mark used',
        body: "Open the piece. Cut asks the final length, then shows the new length to write on what's left. Release gives it back; Mark used is for nothing left.",
        shot: { name: 'stock-piece', alt: 'A piece page, PR-002, with Cut, Release, Mark used, Add photo and Edit details.' },
      },
      {
        title: 'Add stock from your phone',
        body: (
          <>
            Tap <A to="/stock/add">Add</A>, pick the shape (or a recent size), type the sizes and length, and press <b>Save</b>. The button shows the next free ID: write it and the length on the piece.
          </>
        ),
        shot: { name: 'stock-add', alt: 'Add stock: Profile picked, 20 by 40 by 1 and 600 mm typed, with a drawing of the piece.' },
      },
      {
        title: 'Cut list for a whole mechanism',
        body: (
          <>
            In <A to="/stock/cut">Cut list</A>, type one size and all the lengths, like <code>700 x2, 350</code>. Steamhub picks the fewest, shortest pieces and shows where to cut.
          </>
        ),
        shot: { name: 'stock-cut', alt: 'Cut list for 20x40x1 with lengths 700 x2 and 350, matched to pieces of stock.' },
      },
      {
        title: 'Plates, end mills and weight',
        body: (
          <>
            <A to="/stock/plates">Plates</A> is the CNC plate stock, synced from the plate sheet, with <A to="/stock/end-mills">End mills</A> beside it. <A to="/stock/mechanisms">Mechanisms</A> shows what each mechanism reserved and what it weighs.
          </>
        ),
        shot: { name: 'stock-plates', alt: 'Plates: area per thickness, with a low stock warning on 6.35 mm.' },
      },
    ],
  },
  {
    id: 'make',
    title: 'Manufacturing',
    intro: 'What the workshop makes. On phones the tab is called Make.',
    steps: [
      {
        title: 'Pick a part',
        body: (
          <>
            <A to="/manufacturing">Manufacturing</A> lists every part released to the workshop, by subsystem, urgent first. Filter by machine: CNC, Mill, Lathe or 3D print.
          </>
        ),
        shot: { name: 'make-list', alt: 'The workshop list: machine filters, then 3 Intake with its parts.' },
      },
      {
        title: 'Start and Done',
        body: 'Press Start when you begin a part and Done when it\'s finished, right on the row. Done by mistake? Press Undo in the message that pops up. On the workshop PC, pick your name first.',
        shot: { name: 'make-rows', alt: 'Part rows with Start and Done buttons: 3001 and 3005 in progress, 3002 to start.' },
      },
      {
        title: 'The drawing',
        body: "Tap a part to see its drawing, with Drawing PDF and DXF for the CNC. I'll make it starts it. If stock is reserved for it, Done also cuts the piece and shows the length to write on the leftover.",
        shot: { name: 'make-part', alt: "Part 3002 Roller bearing block: I'll make it and Done buttons above its drawing." },
      },
      {
        title: 'Print a whole subsystem',
        body: 'The Drawings button next to a subsystem makes one PDF with a page per part, ready for the USB stick. CNC parts also come as DXF.',
        shot: { name: 'make-drawings', alt: 'The Drawings sheet: open parts picked, Download PDF and DXF for CNC.' },
      },
      {
        title: 'The workshop map',
        body: 'The Map button (the tab on the right edge on a computer) shows which machines are running, who is on them, and the hours this week.',
        shot: { name: 'make-map', alt: 'The workshop map: lathe and mill running, and CNC making 3001.' },
      },
      {
        title: 'For subsystem leads: upload and release',
        body: (
          <>
            In <A to="/manufacturing/robots">Robots</A>, open your subsystem and drop the assembly STEP from Onshape (Assembly tab, Export, STEP, millimeters). Parts get numbers and drawings. Pick them and press <b>Release</b> to send them to the workshop.
          </>
        ),
        shot: { name: 'make-subsystem', alt: 'A subsystem page: lead, prototypes, the STEP drop zone and the released parts.' },
      },
      {
        title: 'Bolts, assembly guide and wishlist',
        body: (
          <>
            The subsystem page also has Bolts (every bolt the joints need) and an Assembly guide, step by step. Things to buy go on the <A to="/manufacturing/wishlist">Wishlist</A>.
          </>
        ),
        shot: { name: 'make-wishlist', alt: 'The wishlist with two open items and Bought and Remove buttons.' },
      },
    ],
  },
  {
    id: 'prototypes',
    title: 'Prototypes',
    intro: 'One prototype per idea you build. Each test is a video with the parameters it ran with.',
    steps: [
      {
        title: 'Record a test',
        body: (
          <>
            Tap <A to="/prototypes/record">Record a test</A> on Home or in Prototypes, then pick the prototype. New idea? Press <b>It's a new prototype</b>.
          </>
        ),
        shot: { name: 'proto-record', alt: 'Record a test: pick a prototype, most recently tested first.' },
      },
      {
        title: 'Film, set the values, save',
        body: "Film or choose a video, set the parameters you changed, mark how it went (Worked, Partly, Failed), and Save test. The video uploads in the background.",
        shot: { name: 'proto-test', alt: 'A new test: Film and Choose file, parameter values, and how it went.' },
      },
      {
        title: 'See what worked',
        body: (
          <>
            The <A to="/prototypes">prototype page</A> lists every test with what changed since the last one, plus notes and a to-do list. Compare puts two prototypes side by side, videos and all.
          </>
        ),
        shot: { name: 'proto-page', alt: 'The Double roller prototype: its tests, newest first, with the values that changed.' },
      },
    ],
  },
  {
    id: 'search',
    title: 'Search',
    steps: [
      {
        title: 'Ctrl K finds anything',
        body: (
          <>
            Press <K>Ctrl K</K> on a computer, or the magnifier at the top on a phone. Type a stock size, a part number, a thread like <code>M5</code>, a prototype, a page or a handbook topic. Arrows to move, Enter to open.
          </>
        ),
        shot: { name: 'search', alt: 'The search box with 20x40x1 700 typed, showing Find stock and two matching pieces.' },
      },
      {
        title: 'Part numbers',
        body: (
          <>
            A part number jumps straight to its drawing. Part numbers start with the subsystem number, so <code>300</code> lists 3001 and up.
          </>
        ),
        shot: { name: 'search-part', alt: 'The search box with 300 typed, listing parts from 3001 up.' },
      },
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    steps: [
      {
        title: 'Calculators and cheat sheets',
        body: (
          <>
            <A to="/tools">Tools</A> has the motor and gearbox calculator, tap drills and holes, center distance, swerve ratios, motor curves, cut list and weight per mechanism, plus links to JVN, AMB and ReCalc.
          </>
        ),
        shot: { name: 'tools', alt: 'The Tools page: Motor and gearbox, Tap drills and holes, Center distance, Swerve ratios.' },
      },
      {
        title: 'Tap drills',
        body: (
          <>
            Pick a thread in <A to="/tools/tap-drills">Tap drills</A> for its tap drill and clearance hole. Searching <code>M5</code> gets there too.
          </>
        ),
        shot: { name: 'tools-tap', alt: 'Tap drills for M5: 4.20 mm tap drill and 5.50 mm clearance hole.' },
      },
      {
        title: 'Motor and gearbox calculator',
        body: (
          <>
            The <A to="/calculators">calculator</A> works out gear ratio, current and battery budget for every mechanism. Your changes stay a draft until you press <b>Save to team robot</b>.
          </>
        ),
        shot: { name: 'tools-calc', alt: 'The motor and gearbox calculator on a laptop.' },
      },
    ],
  },
  {
    id: 'handbook',
    title: 'Handbook',
    steps: [
      {
        title: 'The mechanical design handbook',
        body: (
          <>
            The <A to="/handbook">Handbook</A> is in Hebrew: the mechanical design handbook and the FRC information sources. On a phone, find it in Tools.
          </>
        ),
        shot: { name: 'handbook', alt: 'The Handbook page with its two parts, in Hebrew.' },
      },
    ],
  },
  {
    id: 'more',
    title: 'Good to know',
    steps: [
      {
        title: 'Notifications',
        body: (
          <>
            The bell tells you when a part you're making changes in CAD, or a prototype you follow gets a new test. <A to="/notifications">Mark all read</A> clears the dot.
          </>
        ),
        shot: { name: 'notifications', alt: 'Notifications: a part changed in CAD and a new prototype test.' },
      },
      {
        title: 'No signal in the workshop',
        body: "Steamhub still opens and shows what was saved last time. Changes need a connection, and Steamhub tells you when there isn't one.",
      },
      {
        title: 'Dark mode and signing out',
        body: 'The moon button switches to dark mode. Your initial (on a phone) or name (on a computer) opens Sign out.',
      },
    ],
  },
]

/** One picture, light or dark to match the app. Only the visible one loads. */
function Shot({ name, alt }: { name: ShotName; alt: string }) {
  const [w, h] = SHOT_SIZES[name] as [number, number]
  const wide = w > 600
  return (
    <figure className={`guide-shot${wide ? ' guide-shot--wide' : ''}`} style={{ maxWidth: wide ? undefined : `min(100%, ${Math.min(w, 390) * 0.8}px)` }}>
      <img className="guide-shot__light" src={`/guide/${name}.webp`} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
      <img className="guide-shot__dark" src={`/guide/${name}-dark.webp`} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
    </figure>
  )
}

/** The chapter being read, for the contents. Same approach as the Handbook's rail. */
function useActive(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
    const io = new IntersectionObserver(
      (entries) => {
        if (atBottom()) return setActive(els[els.length - 1]?.id)
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )
    els.forEach((el) => io.observe(el))
    const onScroll = () => {
      if (atBottom()) setActive(els[els.length - 1]?.id)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [ids])
  return active
}

const IDS = CHAPTERS.map((c) => c.id)

export default function Guide({ signedIn = true }: { signedIn?: boolean }) {
  const active = useActive(IDS)
  const toc = useRef<HTMLElement>(null)
  const { hash } = useLocation()

  // On phones the contents are one sideways row: keep the current chapter in view.
  useEffect(() => {
    const nav = toc.current
    const a = nav?.querySelector<HTMLElement>(`[href="#${active}"]`)
    if (!nav || !a || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollTo({ left: a.offsetLeft - 16 })
  }, [active])

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="page guide" lang="en">
      <header className="guide-head">
        <h1 className="page__title">How to use Steamhub</h1>
        <p className="guide-head__sub soft">The everyday things, a step at a time. Every link opens the real page.</p>
        <div className="page__actions">
          {!signedIn && (
            <Link to="/" className="q-btn q-btn--main">
              Sign in
            </Link>
          )}
          <Link to="/guide/print" className="q-btn">
            <Icon name="print" size={18} /> Print poster
          </Link>
        </div>
      </header>

      <div className="guide-body">
        <nav ref={toc} className="guide-toc" aria-label="Guide contents">
          <div className="picks picks--stack">
            <Indicator selector='[aria-current="true"]' />
            {CHAPTERS.map((c) => (
              <a key={c.id} href={`#${c.id}`} className="pick" aria-current={active === c.id ? 'true' : undefined}>
                {c.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="guide-text">
          {CHAPTERS.map((c) => (
            <section key={c.id} id={c.id} className="guide-ch" aria-labelledby={`${c.id}-title`}>
              <h2 id={`${c.id}-title`} className="section__title">
                {c.title}
              </h2>
              {c.intro && <p className="guide-ch__intro soft">{c.intro}</p>}
              <ol className="guide-steps">
                {c.steps.map((s) => (
                  <li key={s.title} className={`guide-step${s.shot ? '' : ' guide-step--text'}`}>
                    <div className="guide-step__text">
                      <h3 className="guide-step__title">{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                    {s.shot && <Shot name={s.shot.name} alt={s.shot.alt} />}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <p className="guide-end soft small">
            Pictures show demo data. Something here doesn't match what you see? Tell the person who looks after Steamhub.
          </p>
        </div>
      </div>
    </div>
  )
}
