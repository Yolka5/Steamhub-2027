import type { ReactNode } from 'react'
import { A, B, C, K } from '../components/GuideText'
import SHOTS from './guide-shots.json'

// The words of the how-to guide (/guide). Each step's `how` list is numbered, and the numbers
// match the rings and arrows on its picture: mark 1 is how[0], and so on. The pictures and the
// marks' positions come from scripts/guide-shots/shots.mjs; change both together.

export type ShotName = keyof typeof SHOTS

export interface Step {
  title: string
  /** One or two lines of context, before the numbered actions. */
  body?: ReactNode
  /** Numbered actions; number n matches mark n on the picture. */
  how?: ReactNode[]
  tip?: ReactNode
  shot?: { name: ShotName; alt: string }
}

export interface Chapter {
  id: string
  title: string
  intro?: ReactNode
  steps: Step[]
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'start',
    title: 'Getting in',
    intro: 'Steamhub is the team’s app for stock, manufacturing, prototypes and design tools. It works on phones, laptops and the workshop PC.',
    steps: [
      {
        title: 'Sign in',
        how: [
          <>
            Open <A to="/">steamhub2027.vercel.app</A> and press <B>Sign in with Google</B>. Any Google account works.
          </>,
        ],
        tip: 'You stay signed in after that. To open it like an app, add it to your home screen: Share, then Add to Home Screen on an iPhone; the ⋮ menu, then Add to Home screen on Android.',
        shot: { name: 'signin', alt: 'The sign-in screen, with the Sign in with Google button marked 1.' },
      },
      {
        title: 'The tabs on a phone',
        body: 'The bar at the bottom of every page:',
        how: [
          <>
            <B>Home</B>: search, and what you’re doing right now.
          </>,
          <>
            <B>Stock</B>: find and reserve tubes, profiles and rods.
          </>,
          <>
            <B>Add</B>: put a new piece of stock in.
          </>,
          <>
            <B>Make</B>: Manufacturing, the parts to make and their drawings.
          </>,
          <>
            <B>Calendar</B>: tasks, the plan and the daily updates.
          </>,
        ],
        tip: 'Tools, with Prototypes and the Handbook inside, is a tile on Home. Search finds every tool too.',
        shot: { name: 'tabbar', alt: 'The phone tab bar with Home, Stock, Add, Make and Calendar marked 1 to 5.' },
      },
      {
        title: 'The top bar on a phone',
        how: [
          <>
            <B>Search</B> anything: stock, parts, threads, pages.
          </>,
          <>
            <B>Notifications</B>. A number means something new for you.
          </>,
          <>
            <B>Dark mode</B> on and off.
          </>,
          <>
            <B>Your account</B>: your initial. Sign out is here.
          </>,
        ],
        shot: { name: 'topbar', alt: 'The phone top bar with search, notifications, dark mode and account marked 1 to 4.' },
      },
      {
        title: 'On a computer',
        body: 'Everything sits in the menu on the left.',
        how: [
          <>
            <B>Search</B>, or press <K>Ctrl K</K> on any page.
          </>,
          <>The sections: Home, Stock, Manufacturing, Prototypes, Calendar, Tools and Handbook.</>,
          <>Notifications.</>,
          <>Dark mode.</>,
          <>Your name: your account and Sign out.</>,
        ],
        shot: { name: 'home-desk', alt: 'Steamhub on a laptop, with the search box, sections, notifications, dark mode and account marked 1 to 5.' },
      },
      {
        title: 'Your account',
        body: 'Tap your initial (your name on a computer).',
        how: [
          <>
            <B>People and bans</B> only shows for the admin.
          </>,
          <>
            <B>Sign out</B>. On a shared computer, do this when you leave.
          </>,
        ],
        shot: { name: 'account', alt: 'The account menu open, with People and bans marked 1 and Sign out marked 2.' },
      },
    ],
  },
  {
    id: 'home',
    title: 'Home',
    steps: [
      {
        title: 'Search from Home',
        how: [
          <>
            Type what you need: a stock size like <C>20x40x1 700</C>, a part number like <C>3004</C> or a thread like <C>M5</C>.
          </>,
          <>
            Press <B>Find</B>. A stock size goes straight to the stock that fits; anything else opens the full search.
          </>,
          <>
            <B>Your tasks</B> from the Calendar: late ones, today’s and this week’s.
          </>,
          <>
            <B>You’re making</B>: the parts you started. Tap one for its drawing. Your reserved stock is listed under it.
          </>,
        ],
        shot: { name: 'home', alt: 'Home on a phone, with the search box, Find, Your tasks and You’re making marked 1 to 4.' },
      },
      {
        title: 'Further down Home',
        how: [
          <>
            <B>Team activity</B>: who started, finished, added or reserved what. Tap a line to open it.
          </>,
          <>Shortcuts to Record a test, Tools and the Handbook (on a computer, to every section).</>,
          <>
            The <B>kickoff countdown</B>, with Add to calendar.
          </>,
          <>
            <B>Workshop now</B>: which machines are running, on what part and for how long. Tap it for the workshop map.
          </>,
        ],
        shot: { name: 'home-more', alt: 'Lower half of Home: team activity, shortcuts, the kickoff countdown and Workshop now, marked 1 to 4.' },
      },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    intro: 'Every tube, profile, rod, angle, flat bar and hex in the workshop. Each piece has an ID like PR-014 written on it in marker, with its length.',
    steps: [
      {
        title: 'Find stock by size',
        body: (
          <>
            Open <A to="/stock">Stock</A>.
          </>
        ),
        how: [
          <>
            Type the size and the length you need. <C>20x40x1 700</C> means a 20 × 40 profile with a 1 mm wall, at least 700 mm long.
          </>,
          <>Or narrow it with a shape: Round, Profile, Angle, Flat or Hex.</>,
          <>Check the line under the box: it says what Steamhub understood, and adds 3 mm for the saw cut.</>,
          <>
            The piece that wastes least comes first, with the mm left after the cut. Press <B>Reserve</B> on it.
          </>,
        ],
        tip: (
          <>
            Other ways to type it: <C>round 20/16 500</C> (round tube, OD/ID), <C>rod 12 300</C>, <C>20x20</C> without a length, or an ID like <C>TB-014</C> to open one piece.
          </>
        ),
        shot: { name: 'stock-find', alt: 'Stock search for 20x40x1 700: the search box, shape filters, what it understood, and the Reserve button on the best piece, marked 1 to 4.' },
      },
      {
        title: 'Search options',
        body: 'On a phone, tap Options under the shapes.',
        how: [
          <>Size tolerance: how close a size must be, ±0.2, ±0.5 or ±1 mm.</>,
          <>Cards with drawings, or a compact table.</>,
          <>Show pieces that are already reserved or used.</>,
        ],
        shot: { name: 'stock-options', alt: 'Search options open: tolerance, cards or table, and show reserved and used, marked 1 to 3.' },
      },
      {
        title: 'Reserve a piece',
        how: [
          <>Pick the subsystem it’s for. Not for a subsystem? Pick Something else and type what it’s for.</>,
          <>Add the length you plan to cut, if you know it. It counts toward that mechanism’s weight.</>,
          <>
            Press <B>Reserve</B>.
          </>,
        ],
        tip: 'Reservations don’t expire. Yours are on Home until you cut or release them.',
        shot: { name: 'stock-reserve', alt: 'The Reserve sheet, with subsystem, planned length and the Reserve button marked 1 to 3.' },
      },
      {
        title: 'The piece page',
        body: 'Tap any piece to open it.',
        how: [
          <>
            <B>Cut</B> it to length.
          </>,
          <>
            <B>Release</B> the reservation, so someone else can use it.
          </>,
          <>
            <B>Mark used</B> when nothing is left.
          </>,
          <>
            <B>Add photo</B>: optional, since every piece is drawn from its size.
          </>,
          <>
            <B>Edit details</B>: size, material, location or a note.
          </>,
        ],
        shot: { name: 'stock-piece', alt: 'Piece PR-002 with Cut, Release, Mark used, Add photo and Edit details marked 1 to 5.' },
      },
      {
        title: 'Cut a piece',
        how: [
          <>Type the final length from the drawing, not your planned length: the drawing is always the latest version.</>,
          <>
            Press <B>Cut it</B>. Steamhub takes off 3 mm for the saw, puts the leftover back in stock under the same ID, and shows the new length. Cross out the old length on the piece and write the new one.
          </>,
        ],
        tip: 'Parts that have stock reserved for them get cut for you when you press Done in Manufacturing.',
        shot: { name: 'stock-cutsheet', alt: 'The Cut sheet with the final length field marked 1 and the Cut it button marked 2.' },
      },
      {
        title: 'Add stock from your phone',
        body: (
          <>
            Tap <A to="/stock/add">Add</A> in the middle of the tab bar.
          </>
        ),
        how: [
          <>Recent sizes: one tap fills the shape, size and material of a piece you added before.</>,
          <>Or pick the shape.</>,
          <>Type the sizes in mm. For a solid round, leave ID empty.</>,
          <>Type the length in mm.</>,
        ],
        shot: { name: 'stock-add', alt: 'Add stock with Profile picked, 20, 40 and 1 typed, and 600 mm; recent sizes, shape, sizes and length marked 1 to 4.' },
      },
      {
        title: 'Check it and save',
        how: [
          <>The drawing shows what you typed. If it looks wrong, a number is off.</>,
          <>Add a photo if you like. It’s optional.</>,
          <>Material, location and a note are folded here. Tap to change them.</>,
          <>
            Press <B>Save</B>. The button shows the ID the piece gets.
          </>,
        ],
        shot: { name: 'stock-add-save', alt: 'The bottom of Add stock: the drawing preview, Add a photo, the folded material and location, and the Save button marked 1 to 4.' },
      },
      {
        title: 'Write it on the piece',
        how: [<>Write the ID and the length on the piece in marker, exactly as shown. Only the length clears, so the next piece of the same size is quick.</>],
        shot: { name: 'stock-add-saved', alt: 'After saving: Write on the piece, PR-014 · 600, marked 1.' },
      },
      {
        title: 'Cut list for a whole mechanism',
        body: (
          <>
            <A to="/stock/cut">Cut list</A> is for when you need many lengths of the same size.
          </>
        ),
        how: [
          <>Type the size, like 20x40x1.</>,
          <>
            Type all the lengths, with a count where you need more than one: <C>700 x2, 350</C>.
          </>,
          <>Steamhub picks the fewest, shortest pieces and shows where to cut each one. Leftovers go back to stock.</>,
        ],
        shot: { name: 'stock-cut', alt: 'Cut list for 20x40x1 with 700 x2 and 350: size, lengths and the result marked 1 to 3.' },
      },
      {
        title: 'Plates and end mills',
        body: (
          <>
            <A to="/stock/plates">Plates</A> is the plate stock for the CNC, by thickness.
          </>
        ),
        how: [
          <>
            <B>Add plate</B> by hand.
          </>,
          <>
            <B>Sync from sheet</B> reads the team’s plate sheet. It also runs each time the page opens.
          </>,
          <>
            <B>End mills</B>: how many of each the CNC has.
          </>,
          <>
            <B>Low stock</B> means it’s time to order that thickness.
          </>,
        ],
        shot: { name: 'stock-plates', alt: 'Plates: Add plate, Sync from sheet, End mills and a Low stock warning marked 1 to 4.' },
      },
      {
        title: 'Weight per mechanism',
        how: [
          <>
            <A to="/stock/mechanisms">Mechanisms</A> lists the stock each subsystem reserved and what it weighs, using the planned length when there is one.
          </>,
        ],
        tip: (
          <>
            <A to="/stock/photos">Stock photos</A> lists pieces with no photo yet, if you want to add some.
          </>
        ),
        shot: { name: 'stock-mech', alt: 'Mechanisms: reserved stock and weight per subsystem, with 1 Drivetrain marked 1.' },
      },
    ],
  },
  {
    id: 'make',
    title: 'Manufacturing',
    intro: 'Every part the workshop has to make, with its drawing. On phones the tab is called Make.',
    steps: [
      {
        title: 'The workshop list',
        body: (
          <>
            <A to="/manufacturing">Manufacturing</A> shows every part released to the workshop, grouped by subsystem, urgent first.
          </>
        ),
        how: [
          <>
            <B>Map</B>: the workshop map (on a computer, the tab on the right edge).
          </>,
          <>Workshop, Robots and Wishlist: the three parts of Manufacturing.</>,
          <>
            <B>Filters</B>: one machine, one subsystem, or show the done ones too.
          </>,
          <>
            <B>Drawings</B>: print every drawing of a subsystem.
          </>,
        ],
        shot: { name: 'make-list', alt: 'The workshop list: Map, the List, Robots and Wishlist tabs, Filters and Drawings marked 1 to 4.' },
      },
      {
        title: 'Filter by machine',
        how: [<>Pick your machine: CNC, Mill, Lathe or 3D print.</>, <>Or one subsystem.</>, <>Show the done parts too.</>],
        tip: 'Filters are in the link, so you can send someone the exact list you’re looking at.',
        shot: { name: 'make-filters', alt: 'Filters open: machine, subsystem and show done marked 1 to 3.' },
      },
      {
        title: 'Start and Done',
        how: [
          <>
            Press <B>Start</B> when you begin a part. Your name goes on it, so nobody makes it twice.
          </>,
          <>
            Press <B>Done</B> when it’s finished.
          </>,
          <>Urgent parts are at the top. Make those first.</>,
        ],
        shot: { name: 'make-rows', alt: 'Part rows: Start marked 1, Done marked 2 and an Urgent tag marked 3.' },
      },
      {
        title: 'Your parts',
        body: 'The workshop lead hands out parts. The ones he gives you are your list, in the order he wants them made.',
        how: [
          <>
            On your phone, <B>Make</B> opens your list. On a computer, press <B>parts for you</B> at the top of Manufacturing.
          </>,
          <>Start the top one first. Urgent parts are always on top.</>,
          <>
            Can’t make one? Press <B>⋯</B> on it and <B>Give back</B>. It goes back to the lead.
          </>,
          <>Nothing in your list? Start any part from Unassigned on the board and it becomes yours.</>,
        ],
        tip: 'You can only start and finish your own parts and unassigned ones.',
      },
      {
        title: 'The board',
        body: 'Board shows Unassigned first, then a column for everyone who has parts. Done parts stay faded for 12 hours.',
        how: [
          <>
            On the workshop PC, tap your name on top of your column to see your list big.
          </>,
          <>It goes back to the board by itself after 3 minutes.</>,
        ],
      },
      {
        title: 'Handing out parts (workshop lead)',
        how: [
          <>
            On the board, press <B>Hand out</B>.
          </>,
          <>
            Tick parts, or press <B>All</B> on a column. Filter by machine or subsystem first to pick “all CNC parts of Intake”.
          </>,
          <>
            Press <B>Give to…</B> and pick the person. The people you pick most are at the top.
          </>,
          <>Drag a card by its handle to another person, to Unassigned, or up and down to change the order.</>,
          <>
            On a phone, use <B>⋯</B> on a card: Move to the top, Up one, Down one, Give to someone else, Unassign.
          </>,
        ],
        tip: 'You get a notification when parts are released, when someone gives one back, and when someone has nothing left.',
      },
      {
        title: 'On the workshop PC',
        body: 'The workshop PC is shared. Start on someone’s part starts it for them. Start on an unassigned part asks who’s making it, with the people picked lately first.',
        how: [<>Type a few letters of your name,</>, <>then tap it.</>, <>Not on the list? Type your name at the bottom and press Start.</>],
        shot: { name: 'make-who', alt: 'Who’s making 3002: the name search, a name and the type-your-name box marked 1 to 3.' },
      },
      {
        title: 'Pressed Done by mistake?',
        how: [
          <>
            Press <B>Undo</B> in the message at the bottom. It’s there for a few seconds.
          </>,
        ],
        tip: 'Missed it? Open the part and press Not done yet.',
        shot: { name: 'make-undo', alt: 'The message 3005 Roller shaft done, with Undo marked 1.' },
      },
      {
        title: 'The part page and its drawing',
        body: 'Tap a part to open it.',
        how: [
          <>
            <B>I’ll make it</B>: the same as Start.
          </>,
          <>
            <B>Done</B>.
          </>,
          <>The drawing, always from the latest upload.</>,
          <>
            <B>Drawing PDF</B> to print or open on the machine’s computer.
          </>,
          <>
            <B>DXF</B> for the CNC (CNC parts only).
          </>,
        ],
        tip: 'When stock is reserved for the part, Done also cuts the piece and shows the length to write on the leftover.',
        shot: { name: 'make-part', alt: 'Part 3002: I’ll make it, Done, the drawing, Drawing PDF and DXF marked 1 to 5.' },
      },
      {
        title: 'Part details and history',
        body: 'Further down the part page:',
        how: [<>Subsystem, machine, material, quantity, who uploaded and released it.</>, <>History: who did what to the part, and when.</>],
        shot: { name: 'make-part-more', alt: 'Part details marked 1 and its history marked 2.' },
      },
      {
        title: 'Print a whole subsystem',
        body: 'Press Drawings next to a subsystem in the workshop list.',
        how: [
          <>The open parts are picked. Untick any you don’t need.</>,
          <>
            <B>Download PDF</B>: one page per part, ready for the USB stick.
          </>,
          <>
            <B>DXF for CNC</B>: the CNC parts as DXF files in one zip.
          </>,
        ],
        shot: { name: 'make-drawings', alt: 'The Drawings sheet: the picked parts, Download PDF and DXF for CNC marked 1 to 3.' },
      },
      {
        title: 'The workshop map',
        body: 'Press Map, or the tab on the right edge on a computer.',
        how: [
          <>The room. Running machines are green, with who’s on them. Point at or tap a machine for details.</>,
          <>Machines in the other room, like the CNC and the 3D printer.</>,
          <>
            <B>History</B>: hours and parts this week.
          </>,
        ],
        shot: { name: 'make-map', alt: 'The workshop map on a laptop: the room, the other room’s machines and the History tab marked 1 to 3.' },
      },
      {
        title: 'Map history',
        how: [<>Machine time today, hours this week and parts done this week, per machine.</>],
        shot: { name: 'make-map-history', alt: 'The workshop map’s History tab, marked 1.' },
      },
    ],
  },
  {
    id: 'leads',
    title: 'For subsystem leads',
    intro: 'Getting parts from Onshape to the workshop. Only the person who designs a subsystem needs this.',
    steps: [
      {
        title: 'Robots and subsystems',
        body: (
          <>
            Open <A to="/manufacturing/robots">Robots</A> in Manufacturing.
          </>
        ),
        how: [<>Open the robot to see its subsystems and how many parts are left.</>, <>New robot: give it a name and copy the subsystems from the last one.</>],
        shot: { name: 'make-robots', alt: 'Robots: the robot 2027 V1 marked 1 and New robot marked 2.' },
      },
      {
        title: 'Export the STEP from Onshape',
        body: 'A new subsystem shows these steps:',
        how: [
          <>Open the subsystem’s Assembly tab, not a Part Studio.</>,
          <>Right-click the tab, choose Export, pick STEP and millimeters, one file.</>,
          <>Drop the file on the subsystem page. Every part gets a number, a machine, a material and a drawing.</>,
        ],
        shot: { name: 'make-onshape', alt: 'The Getting the STEP from Onshape steps on a new subsystem.' },
      },
      {
        title: 'The subsystem page',
        body: 'It also shows the subsystem’s Calendar phases and open tasks.',
        how: [
          <>The lead, who gets told when parts change.</>,
          <>Its prototypes, and the season summary.</>,
          <>Drop the assembly STEP here, and again after each change in CAD. Parts that changed after release are flagged, and you decide whether made ones need remaking.</>,
        ],
        shot: { name: 'make-subsystem', alt: 'Subsystem 3 Intake: the lead, prototypes and the STEP drop zone marked 1 to 3.' },
      },
      {
        title: 'Release parts to the workshop',
        body: 'Nothing reaches the workshop until you release it.',
        how: [
          <>Tick the parts that are ready.</>,
          <>
            Press <B>Release</B>. They show up in the workshop list at once.
          </>,
          <>Mark them urgent if they’re needed first.</>,
        ],
        tip: 'The subsystem page also has Bolts (every bolt the joints need, plus 10% spare) and an Assembly guide that goes part by part. Both need the whole assembly as one STEP file.',
        shot: { name: 'make-release', alt: 'Two parts ticked in a subsystem, with a checkbox marked 1, Release marked 2 and Urgent marked 3.' },
      },
      {
        title: 'The wishlist',
        body: (
          <>
            Things to buy are on the <A to="/manufacturing/wishlist">Wishlist</A>. Bought parts marked Missing land here on their own.
          </>
        ),
        how: [
          <>
            <B>Add item</B>.
          </>,
          <>
            <B>Copy for Google Sheets</B>: paste the open items into the buying sheet.
          </>,
          <>
            <B>Bought</B> once it’s ordered.
          </>,
        ],
        shot: { name: 'make-wishlist', alt: 'The wishlist: Add item, Copy for Google Sheets and Bought marked 1 to 3.' },
      },
      {
        title: 'Add to the wishlist',
        how: [<>What to buy, with how many, the price, the vendor and a link if you have them.</>, <>Which subsystem it’s for.</>, <>Add it.</>],
        shot: { name: 'make-wish-add', alt: 'Add to the wishlist: item, subsystem and the Add button marked 1 to 3.' },
      },
    ],
  },
  {
    id: 'prototypes',
    title: 'Prototypes',
    intro: 'One prototype per idea you build, like “2 rollers over the bumper”. Each test is a video with the values it ran with, so you can see what changed and what worked.',
    steps: [
      {
        title: 'The prototypes list',
        body: (
          <>
            Open <A to="/prototypes">Prototypes</A> (on a phone: the Tools tile on Home, then Prototypes).
          </>
        ),
        how: [
          <>
            <B>Record a test</B>: the quickest way to film one.
          </>,
          <>
            <B>New prototype</B>.
          </>,
          <>Filter by stage: Idea, Building, Testing, Chosen.</>,
          <>
            <B>Season summary</B>: every idea for that subsystem at a glance.
          </>,
          <>
            <B>Compare</B> prototypes side by side.
          </>,
        ],
        shot: { name: 'proto-list', alt: 'Prototypes: Record a test, New prototype, the stage filter, Season summary and Compare marked 1 to 5.' },
      },
      {
        title: 'Start a new prototype',
        how: [
          <>A short name, like Double roller.</>,
          <>The subsystem. It starts with that subsystem’s parameters, so tests line up with the other ideas.</>,
          <>The concept in a line.</>,
          <>
            <B>Create prototype</B>.
          </>,
        ],
        shot: { name: 'proto-new', alt: 'New prototype: name, subsystem, concept and Create prototype marked 1 to 4.' },
      },
      {
        title: 'Record a test',
        body: (
          <>
            Tap <A to="/prototypes/record">Record a test</A> on Home or in Prototypes.
          </>
        ),
        how: [<>Pick the prototype. The ones tested last are on top.</>, <>A new idea? Press It’s a new prototype.</>],
        shot: { name: 'proto-record', alt: 'Record a test: a prototype marked 1 and It’s a new prototype marked 2.' },
      },
      {
        title: 'Film it and set the values',
        body: 'The values start from the last test, so change only what you changed.',
        how: [
          <>
            <B>Film</B> with the phone camera.
          </>,
          <>Or choose a video you already have.</>,
          <>Or paste a YouTube or Drive link.</>,
          <>Set the parameters. The + buttons add ones from the library, like Compression or Motor.</>,
        ],
        shot: { name: 'proto-test', alt: 'A new test: Film, Choose file, the link option and Parameters marked 1 to 4.' },
      },
      {
        title: 'How it went',
        how: [
          <>Worked, Partly or Failed.</>,
          <>A score and a measurement if you have one, like balls in out of 10.</>,
          <>
            <B>Save test</B>. The video uploads in the background, so you can keep testing.
          </>,
        ],
        shot: { name: 'proto-test-end', alt: 'How it went: the result, the score and Save test marked 1 to 3.' },
      },
      {
        title: 'The prototype page',
        how: [
          <>
            <B>New test</B>.
          </>,
          <>
            <B>Compare</B> with another prototype.
          </>,
          <>Its stage. Set Chosen when the team picks it; the leads get told.</>,
          <>Each test shows what changed since the one before, like compression 15 → 18 mm.</>,
        ],
        shot: { name: 'proto-page', alt: 'The Double roller page: New test, Compare, the stage and a test’s changes marked 1 to 4.' },
      },
      {
        title: 'Notes, to-do and chart',
        body: 'Further down a prototype page:',
        how: [<>Notes for the team.</>, <>A to-do list.</>, <>A chart of a result against one parameter.</>],
        shot: { name: 'proto-blocks', alt: 'Notes, to-do and parameter chart blocks marked 1 to 3.' },
      },
      {
        title: 'Compare prototypes',
        how: [
          <>
            <B>Play together</B> starts the videos at the same time.
          </>,
          <>Pick which test of each to compare.</>,
          <>Their parameters side by side. Rows that differ are tinted.</>,
        ],
        shot: { name: 'proto-compare', alt: 'Compare on a laptop: Play together, the test pickers and a differing parameter row marked 1 to 3.' },
      },
      {
        title: 'Season summary and parameter library',
        body: 'The season summary shows every idea for a subsystem at a glance. The parameter library is what the + buttons add, and what a new subsystem’s prototypes start with.',
        how: [<>New adds a parameter to the library, like Wheel with its type and diameter.</>],
        shot: { name: 'proto-library', alt: 'The parameter library, with New marked 1.' },
      },
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar',
    intro: 'Tasks for every team and subsystem, their phases, and the leads’ daily updates. It replaces the Monday board.',
    steps: [
      {
        title: 'The board',
        body: (
          <>
            Open the <A to="/calendar">Calendar</A>: the Calendar tab on a phone, the menu on a computer.
          </>
        ),
        how: [
          <>Four views: Board, Calendar, Plan (the Gantt, on a computer) and Updates.</>,
          <>Filters: one team, or only your own tasks.</>,
          <>One box per group: each team, CNC, the Workshop, and each subsystem with its lead and the phase it’s in.</>,
          <>
            <B>+ Task</B> under a group adds a task to it.
          </>,
        ],
        tip: 'A lead who hasn’t sent today’s update sees a Send today’s update row at the top.',
        shot: { name: 'cal-board', alt: 'The Calendar board on a phone: the views, the filters, the first group and its + Task button marked 1 to 4.' },
      },
      {
        title: 'Tasks',
        how: [
          <>Tap the circle to move a task along: Not started, In progress, Done.</>,
          <>Tap the name to open the task.</>,
          <>High priority tasks are tagged.</>,
          <>“Waits for” means it starts after another task. A task that slips moves the ones waiting for it.</>,
        ],
        shot: { name: 'cal-rows', alt: 'The 3 Intake group: a task’s status circle, its name, a High tag and a waits-for note marked 1 to 4.' },
      },
      {
        title: 'Add a task in one line',
        body: 'Press + Task under the group.',
        how: [
          <>
            Type the task with the day at the end: <C>Roller test thu high @noa</C>. The day (<C>thu</C>, <C>14/11</C>, <C>mon-thu</C>), High or Low, and <C>@name</C> for who are read from the end.
          </>,
          <>
            <B>Add</B>.
          </>,
        ],
        shot: { name: 'cal-new', alt: 'A task typed in one line under 3 Intake, with the line marked 1 and Add marked 2.' },
      },
      {
        title: 'Open a task',
        how: [<>Its status.</>, <>Start and due dates.</>, <>Who owns it. Add more than one person.</>, <>What it waits for.</>],
        tip: 'A task can also have notes and subtasks, and be linked to a prototype or a part.',
        shot: { name: 'cal-task', alt: 'A task open: status, dates, owners and waits for marked 1 to 4.' },
      },
      {
        title: 'A group’s page',
        body: 'Tap a group’s name on the board.',
        how: [
          <>Today’s update, for the group’s lead. It gets a tick once it’s sent.</>,
          <>Three tabs: the group’s Tasks, its Phases and its Updates. Today’s update is written right there in Updates.</>,
          <>Add a task to this group in one line, the same way as on the board.</>,
        ],
        shot: { name: 'cal-group', alt: 'The Intake group page: today’s update, the Tasks, Phases and Updates tabs, and the task line marked 1 to 3.' },
      },
      {
        title: 'Phases',
        how: [
          <>Each subsystem goes Prototypes, CAD, Manufacturing, and their progress comes from Steamhub itself: prototypes tested, parts made.</>,
          <>
            <B>Finish</B> a phase when it’s done. Steamhub asks the lead when one looks finished.
          </>,
          <>Add a phase of your own, like Wiring.</>,
        ],
        shot: { name: 'cal-phases', alt: 'The Phases tab: the phases, Finish and the new phase box marked 1 to 3.' },
      },
      {
        title: 'For leads: today’s update',
        body: (
          <>
            At the end of the day, open <A to="/calendar/update">Send today’s update</A>.
          </>
        ),
        how: [<>Your group.</>, <>One text box: what got done and what’s next.</>, <>Send update. It’s filed under your group’s current phase. Already sent one today? The button says Save the change and replaces it.</>],
        shot: { name: 'cal-update', alt: 'Today’s update: the group, the text box and Send marked 1 to 3.' },
      },
      {
        title: 'Everyone’s updates',
        body: (
          <>
            <A to="/calendar/summary">Updates</A> shows every group’s day on one screen.
          </>
        ),
        how: [<>Go back a day, or forward.</>, <>Copy as text, to paste in the team chat.</>],
        shot: { name: 'cal-summary', alt: 'Updates: the day arrows and Copy as text marked 1 and 2.' },
      },
      {
        title: 'Calendar and events',
        body: 'The Calendar view lists what’s on each day: tasks due, phases and events.',
        how: [
          <>
            <B>Event</B> adds a meeting, a competition or a deadline.
          </>,
          <>Each day with something on it.</>,
        ],
        shot: { name: 'cal-month', alt: 'The Calendar view on a phone: Event marked 1 and the first day marked 2.' },
      },
      {
        title: 'Meetings and reminders',
        how: [<>What kind of event it is.</>, <>Repeat it every week on the days you pick.</>, <>Remind everyone before it starts.</>],
        tip: 'When a meeting ends, leads who haven’t sent their update get a reminder.',
        shot: { name: 'cal-event', alt: 'A new event: kind, repeat days and reminders marked 1 to 3.' },
      },
      {
        title: 'The plan on a phone',
        how: [<>Plan, the Gantt for phones.</>, <>Each group’s phases (done, now, next) with dates and progress, then its dated tasks in order.</>],
        shot: { name: 'cal-plan', alt: 'The Plan view on a phone: the Plan tab and the Intake group’s phases and tasks marked 1 and 2.' },
      },
      {
        title: 'The Gantt',
        body: 'On a computer, the Gantt shows every group’s phases and tasks over time.',
        how: [
          <>Drag a bar to move it. Drag a task’s dot onto another task to make it wait for that one.</>,
          <>The line is today.</>,
        ],
        shot: { name: 'cal-gantt', alt: 'The Gantt on a laptop: a phase bar marked 1 and the today line marked 2.' },
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
            Press <K>Ctrl K</K> on a computer, or the magnifier at the top on a phone.
          </>
        ),
        how: [
          <>Type a stock size, a part number, a thread, a prototype, a page or a handbook topic.</>,
          <>
            Use the arrows and <K>Enter</K>, or tap a result.
          </>,
        ],
        shot: { name: 'search', alt: 'Search with 20x40x1 700 typed: the box marked 1 and Find stock marked 2.' },
      },
      {
        title: 'Part numbers',
        body: 'Part numbers start with the subsystem number: 3004 is part 4 of subsystem 3.',
        how: [
          <>
            Type the number to jump to the part and its drawing. <C>300</C> lists 3001 and up.
          </>,
        ],
        shot: { name: 'search-part', alt: 'Search with 300 typed, with part 3001 marked 1.' },
      },
      {
        title: 'Threads',
        how: [
          <>
            Type a thread like <C>M5</C> or <C>10-32</C> for its tap drill and clearance hole.
          </>,
        ],
        shot: { name: 'search-phone', alt: 'Search on a phone with M5 typed: tap drill 4.20 mm, marked 1.' },
      },
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    steps: [
      {
        title: 'The Tools page',
        body: (
          <>
            <A to="/tools">Tools</A> has every calculator, plus links to JVN, AMB and ReCalc further down. On a phone, open it from its tile on Home.
          </>
        ),
        how: [<>The Calendar.</>, <>Motor and gearbox: gear ratio, current and battery budget.</>, <>Tap drills and holes.</>, <>Center distance for belts, chains and gears.</>],
        shot: { name: 'tools', alt: 'The Tools page with Calendar, Motor and gearbox, Tap drills and holes and Center distance marked 1 to 4.' },
      },
      {
        title: 'Motor and gearbox calculator',
        body: (
          <>
            The <A to="/calculators">calculator</A> has the team robot’s mechanisms. Your changes stay a draft until you press Save to team robot.
          </>
        ),
        how: [<>The tabs: Robot, Swerve, Motor curves, Voltage map, Motors, and more.</>, <>One card per mechanism, with its gear ratio and status.</>],
        shot: { name: 'tools-calc', alt: 'The calculator on a laptop: the tabs marked 1 and a mechanism card marked 2.' },
      },
      {
        title: 'Tap drills',
        how: [
          <>Type or pick the thread.</>,
          <>Add the wall thickness to check the thread fits.</>,
          <>The tap drill, the clearance hole and the thread depth.</>,
        ],
        shot: { name: 'tools-tap', alt: 'Tap drills for M5: the thread, wall thickness and the tap drill result marked 1 to 3.' },
      },
      {
        title: 'Center distance',
        body: (
          <>
            <A to="/tools/center-distance">Center distance</A> for belts, chains and gears.
          </>
        ),
        how: [
          <>Find a belt for a spacing, or the spacing for a belt you have.</>,
          <>The teeth on each pulley.</>,
          <>The center distance you want. The nearest belts are listed around it.</>,
        ],
        shot: { name: 'tools-center', alt: 'Center distance: what you know, the pulley teeth and the distance marked 1 to 3.' },
      },
    ],
  },
  {
    id: 'handbook',
    title: 'Handbook',
    intro: 'The Handbook is in Hebrew. On a phone, it’s a tile on Home, and in Tools.',
    steps: [
      {
        title: 'Two parts',
        how: [<>The mechanical design handbook.</>, <>FRC information sources: sites, forums, videos and teams to learn from.</>],
        shot: { name: 'handbook', alt: 'The Handbook page with its two parts marked 1 and 2.' },
      },
      {
        title: 'Reading it',
        how: [<>Search inside it.</>, <>Or tap a topic.</>, <>The contents follow you as you read; tap a chapter to jump.</>],
        shot: { name: 'handbook-design', alt: 'The design handbook: search, topics and contents marked 1 to 3.' },
      },
    ],
  },
  {
    id: 'more',
    title: 'Good to know',
    steps: [
      {
        title: 'Notifications',
        body: 'The bell tells you when a part you’re making changes in CAD, a prototype you follow gets a new test or is chosen, a task needs you, or a meeting is about to start.',
        how: [
          <>
            Get them on your phone, even when Steamhub is closed: open <A to="/notifications">Notifications</A> and press <B>Turn on</B>. On an iPhone, first add Steamhub to the home screen (Share, then Add to Home Screen), open it from there, and turn them on.
          </>,
          <>
            <B>Mark all read</B> clears the number.
          </>,
          <>New ones have a dot. Tap one to open what it’s about.</>,
        ],
        shot: { name: 'notifications', alt: 'Notifications: the phone notifications card marked 1, Mark all read marked 2 and an unread notification marked 3.' },
      },
      {
        title: 'No signal in the workshop',
        how: [<>Steamhub still opens and shows what was saved last time. Changes need a connection; this note says when there isn’t one.</>],
        shot: { name: 'offline', alt: 'The No connection note at the top of Stock, marked 1.' },
      },
      {
        title: 'For the admin',
        body: 'People (from the account menu) lists every account.',
        how: [
          <>Shared PC: mark the workshop PC’s account, so Start asks who’s making the part.</>,
          <>Lead: lets someone hand out parts on the board.</>,
          <>Ban an account that shouldn’t be in.</>,
          <>Who can join: only emails on this list can make a new account. Existing accounts keep working.</>,
        ],
        shot: { name: 'people', alt: 'People: Shared PC marked 1 and Ban marked 2.' },
      },
    ],
  },
]
