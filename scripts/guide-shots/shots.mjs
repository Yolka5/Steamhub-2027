// Every picture in the guide: where to go, what to do first, how much of the screen to keep,
// and the numbered marks drawn on it. Phone shots are 390 px wide; `desk` ones are a 1280 px
// laptop. `height` keeps the top of the screen, `clip` keeps one element. Each mark is a
// Playwright selector; its number matches the numbered action in the guide's text, and
// `arrow` ('left', 'right', 'up', 'down') says which side an arrow comes in from.

const pause = (page, ms = 500) => page.waitForTimeout(ms)
const click = (sel, ms) => async (page) => {
  await page.locator(sel).first().click()
  await pause(page, ms)
}
/** Scrolls so `sel` sits `top` px below the top of the screen. */
const scrollTo = async (page, sel, top = 70) => {
  await page.locator(sel).first().evaluate((el, t) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - t), top)
  await pause(page, 300)
}
const NO_BARS = '.tabbar,.topbar{display:none!important}'
const NO_TABBAR = '.tabbar{display:none!important}'
const btn = (name) => `role=button[name="${name}"] >> nth=0`
/** A button, link or file label by its words. */
const tap = (name) => `:is(a,button,label):has-text("${name}") >> nth=0`

export const SHOTS = [
  // ----- Getting in -----
  { name: 'signin', path: '/', signedOut: true, clip: '.gate__box', pad: 24, marks: [{ sel: btn('Sign in with Google') }] },
  {
    name: 'tabbar',
    path: '/',
    clip: '.tabbar',
    marks: ['Home', 'Stock', 'Add', 'Make', 'Calendar'].map((t) => ({ sel: `.tabbar >> text=${t}` })),
  },
  {
    name: 'topbar',
    path: '/',
    clip: '.topbar',
    marks: [{ sel: btn('Search') }, { sel: '.topbar .bell' }, { sel: btn('Toggle dark mode') }, { sel: btn('Account') }],
  },
  {
    name: 'home-desk',
    path: '/',
    desk: true,
    marks: [{ sel: '.rail__search' }, { sel: '.rail nav.picks' }, { sel: '.rail .bell' }, { sel: btn('Dark mode') }, { sel: '.rail >> text=Dana Levi' }],
  },
  {
    name: 'account',
    path: '/',
    height: 300,
    act: click(btn('Account')),
    marks: [{ sel: 'text=People and bans' }, { sel: 'text=Sign out' }],
  },

  // ----- Home -----
  {
    name: 'home',
    path: '/',
    height: 620,
    marks: [{ sel: '.hero__search input' }, { sel: btn('Find') }, { sel: 'section:has(h2:has-text("Your tasks"))' }, { sel: 'section:has(h2:has-text("You\'re making"))' }],
  },
  {
    name: 'home-more',
    path: '/',
    viewport: { width: 390, height: 1040 },
    height: 1000,
    css: NO_BARS,
    act: (page) => scrollTo(page, 'text=Team activity', 16),
    marks: [{ sel: 'h2:has-text("Team activity")' }, { sel: '.quick' }, { sel: '.countdown' }, { sel: '.wnow' }],
  },

  // ----- Stock -----
  {
    name: 'stock-find',
    path: '/stock?q=20x40x1%20700',
    height: 760,
    marks: [{ sel: '.finder input[type=search]' }, { sel: 'role=radiogroup[name="Shape"]' }, { sel: '.finder__said' }, { sel: btn('Reserve'), arrow: 'left' }],
  },
  {
    name: 'stock-options',
    path: '/stock?q=20x40x1%20700',
    height: 560,
    act: click('.finder__more summary'),
    marks: [{ sel: 'role=radiogroup[name="Size tolerance"]' }, { sel: 'role=radiogroup[name="View"]' }, { sel: 'label.check:has-text("Show reserved")' }],
  },
  {
    name: 'stock-reserve',
    path: '/stock?q=20x40x1%20700',
    act: click(btn('Reserve')),
    marks: [{ sel: '.ctl:has-text("For which subsystem")' }, { sel: '.ctl:has-text("Planned length")' }, { sel: '.sheet button[type=submit]' }],
  },
  {
    name: 'stock-piece',
    path: '/stock/PR-002',
    height: 560,
    marks: [{ sel: btn('Cut') }, { sel: btn('Release') }, { sel: btn('Mark used') }, { sel: tap('Add photo') }, { sel: btn('Edit details') }],
  },
  {
    name: 'stock-cutsheet',
    path: '/stock/PR-002',
    act: async (page) => {
      await click(btn('Cut'))(page)
      await page.locator('.sheet input').first().fill('696')
      await pause(page)
    },
    marks: [{ sel: '.sheet .ctl' }, { sel: '.sheet button[type=submit]' }],
  },
  {
    name: 'stock-add',
    path: '/stock/add',
    act: async (page) => {
      await page.getByRole('radio', { name: 'Profile' }).click()
      const dims = page.locator('.dims input')
      await dims.nth(0).fill('20')
      await dims.nth(1).fill('40')
      await dims.nth(2).fill('1')
      await page.getByLabel('Length (mm)').fill('600')
      await page.locator('h1').click()
    },
    marks: [{ sel: '.chips' }, { sel: 'role=radiogroup[name="Shape"]' }, { sel: '.dims' }, { sel: '.ctl:has-text("Length (mm)")' }],
  },
  {
    name: 'stock-add-save',
    path: '/stock/add',
    css: NO_TABBAR,
    act: async (page) => {
      await page.getByRole('radio', { name: 'Profile' }).click()
      const dims = page.locator('.dims input')
      await dims.nth(0).fill('20')
      await dims.nth(1).fill('40')
      await dims.nth(2).fill('1')
      await page.getByLabel('Length (mm)').fill('600')
      await page.locator('h1').click()
      await scrollTo(page, '.add-preview', 60)
    },
    marks: [{ sel: '.add-preview' }, { sel: '.photo-btn' }, { sel: 'details.more summary' }, { sel: '.form button[type=submit]' }],
  },
  {
    name: 'stock-add-saved',
    path: '/stock/add',
    css: NO_TABBAR,
    act: async (page) => {
      await page.getByRole('radio', { name: 'Profile' }).click()
      const dims = page.locator('.dims input')
      await dims.nth(0).fill('20')
      await dims.nth(1).fill('40')
      await dims.nth(2).fill('1')
      await page.getByLabel('Length (mm)').fill('600')
      await page.locator('.form button[type=submit]').click()
      await pause(page, 900)
      await scrollTo(page, '.written', 200)
    },
    clip: '.written',
    pad: 28,
    marks: [{ sel: '.written' }],
  },
  {
    name: 'stock-cut',
    path: '/stock/cut?size=20x40x1&len=700%20x2%2C%20350',
    height: 760,
    marks: [{ sel: '.ctl:has-text("Size")' }, { sel: '.ctl:has-text("Lengths in mm")' }, { sel: 'text=/\\d cuts/' }],
  },
  {
    name: 'stock-plates',
    path: '/stock/plates',
    height: 640,
    marks: [{ sel: btn('Add plate') }, { sel: btn('Sync from sheet') }, { sel: 'text=End mills >> nth=0' }, { sel: 'text=Low stock' }],
  },
  { name: 'stock-mech', path: '/stock/mechanisms', height: 560, marks: [{ sel: 'text=1 Drivetrain' }] },

  // ----- Manufacturing -----
  {
    name: 'make-list',
    path: '/manufacturing',
    height: 760,
    marks: [{ sel: btn('Map') }, { sel: 'nav[aria-label="Manufacturing"]' }, { sel: '.mfg-filters-fold summary' }, { sel: '.mfg-group__print' }],
  },
  {
    name: 'make-filters',
    path: '/manufacturing',
    height: 520,
    act: click('.mfg-filters-fold summary'),
    marks: [{ sel: 'role=radiogroup[name="Machine"]' }, { sel: '.mfg-filters__sub' }, { sel: 'label.check:has-text("Show done")' }],
  },
  {
    name: 'make-rows',
    path: '/manufacturing',
    clip: '.mfg-group',
    pad: 12,
    maxHeight: 480,
    css: NO_BARS,
    marks: [{ sel: btn('Start') }, { sel: btn('Done') }, { sel: '.mfg-group >> text=Urgent' }],
  },
  {
    name: 'make-who',
    path: '/manufacturing',
    user: 'pc',
    act: click(btn('Start')),
    marks: [{ sel: '.sheet input >> nth=0' }, { sel: '.sheet >> text=Ariel Cohen' }, { sel: '.sheet input >> nth=1' }],
  },
  {
    name: 'make-undo',
    path: '/manufacturing',
    act: async (page) => {
      await page.locator('role=button[name="Done"]').nth(1).click()
      await pause(page, 700)
    },
    marks: [{ sel: btn('Undo'), arrow: 'up' }],
  },
  {
    name: 'make-part',
    path: (ids) => `/manufacturing/p/${ids.part(3002)}`,
    height: 720,
    wait: 1500,
    marks: [{ sel: btn("I'll make it") }, { sel: btn('Done') }, { sel: '.paper' }, { sel: btn('Drawing PDF') }, { sel: btn('DXF') }],
  },
  {
    name: 'make-part-more',
    path: (ids) => `/manufacturing/p/${ids.part(3001)}`,
    viewport: { width: 390, height: 1000 },
    css: NO_BARS,
    wait: 1200,
    act: (page) => scrollTo(page, '.part__side', 16),
    marks: [{ sel: '.part__side dl' }, { sel: 'h2:has-text("History")' }],
  },
  {
    name: 'make-drawings',
    path: '/manufacturing',
    act: click('.mfg-group__print', 700),
    marks: [{ sel: '.sheet label >> nth=0' }, { sel: 'role=button[name=/Download PDF/]' }, { sel: 'role=button[name=/DXF for CNC/]' }],
  },
  {
    name: 'make-map',
    path: '/manufacturing',
    desk: true,
    act: click('.wmap-handle', 900),
    marks: [{ sel: '.wmap' }, { sel: '.wpanel__rooms' }, { sel: 'role=tab[name="History"]' }],
  },
  {
    name: 'make-map-history',
    path: '/manufacturing',
    desk: true,
    act: async (page) => {
      await click('.wmap-handle', 900)(page)
      await click('role=tab[name="History"]', 900)(page)
    },
    marks: [{ sel: '.wpanel__history' }],
  },
  {
    name: 'make-robots',
    path: '/manufacturing/robots',
    height: 360,
    marks: [{ sel: '.rows >> text=2027 V1' }, { sel: btn('New robot') }],
  },
  {
    name: 'make-subsystem',
    path: (ids) => `/manufacturing/s/${ids.sub(3)}`,
    viewport: { width: 390, height: 1240 },
    css: NO_TABBAR,
    height: 1200,
    wait: 1200,
    marks: [{ sel: '.ctl:has-text("Lead")' }, { sel: 'h2:has-text("Prototypes")' }, { sel: 'text=Drop the assembly STEP here' }],
  },
  {
    name: 'make-onshape',
    path: (ids) => `/manufacturing/s/${ids.sub(5)}`,
    wait: 1200,
    clip: '.mfg-help',
    pad: 12,
    css: NO_BARS,
  },
  {
    name: 'make-release',
    path: (ids) => `/manufacturing/s/${ids.sub(3)}`,
    wait: 1200,
    css: NO_TABBAR,
    act: async (page) => {
      await scrollTo(page, '.sp-row:has-text("Hopper side wall")', 220)
      await page.locator('.sp-row:has-text("Hopper side wall") .sp-row__pick').check()
      await page.locator('.sp-row:has-text("Hopper standoff") .sp-row__pick').check()
      await pause(page, 600)
    },
    marks: [
      { sel: '.sp-row:has-text("Hopper side wall") .sp-row__pick', arrow: 'right' },
      { sel: '.mfg-actionbar button.q-btn--main' },
      { sel: '.mfg-actionbar >> text=Urgent' },
    ],
  },
  {
    name: 'make-wishlist',
    path: '/manufacturing/wishlist',
    height: 640,
    marks: [{ sel: btn('Add item') }, { sel: btn('Copy for Google Sheets') }, { sel: btn('Bought') }],
  },
  {
    name: 'make-wish-add',
    path: '/manufacturing/wishlist',
    act: click(btn('Add item')),
    marks: [{ sel: '.sheet .ctl:has-text("Item")' }, { sel: '.sheet .ctl:has-text("For which subsystem")' }, { sel: '.sheet button[type=submit]' }],
  },

  // ----- Prototypes -----
  {
    name: 'proto-list',
    path: '/prototypes',
    height: 720,
    marks: [{ sel: 'text=Record a test >> nth=0' }, { sel: btn('New prototype') }, { sel: 'role=radiogroup >> nth=0' }, { sel: 'text=Season summary' }, { sel: tap('Compare') }],
  },
  {
    name: 'proto-new',
    path: '/prototypes',
    act: click(btn('New prototype')),
    marks: [{ sel: '.sheet .ctl:has-text("Name")' }, { sel: '.sheet .ctl:has-text("Subsystem")' }, { sel: '.sheet .ctl:has-text("Concept")' }, { sel: '.sheet button[type=submit]' }],
  },
  {
    name: 'proto-record',
    path: '/prototypes/record',
    height: 520,
    marks: [{ sel: 'text=Double roller' }, { sel: "text=It's a new prototype" }],
  },
  {
    name: 'proto-test',
    path: (ids) => `/prototypes/${ids.proto.dbl}/test`,
    marks: [{ sel: tap('Film') }, { sel: tap('Choose file') }, { sel: 'text=Paste a YouTube' }, { sel: 'h2:has-text("Parameters")' }],
  },
  {
    name: 'proto-test-end',
    path: (ids) => `/prototypes/${ids.proto.dbl}/test`,
    css: NO_TABBAR,
    act: async (page) => {
      await scrollTo(page, 'h2:has-text("How it went")', 70)
      await page.getByRole('radio', { name: 'Worked' }).click()
      await pause(page)
    },
    marks: [{ sel: '[role=radiogroup]:has-text("Worked")' }, { sel: '.ctl:has-text("Score")' }, { sel: btn('Save test') }],
  },
  {
    name: 'proto-page',
    path: (ids) => `/prototypes/${ids.proto.dbl}`,
    height: 800,
    marks: [{ sel: tap('New test') }, { sel: tap('Compare') }, { sel: 'role=radiogroup >> nth=0' }, { sel: '.pt-test__changes >> nth=0' }],
  },
  {
    name: 'proto-blocks',
    path: (ids) => `/prototypes/${ids.proto.dbl}`,
    viewport: { width: 390, height: 1000 },
    css: NO_BARS,
    act: (page) => scrollTo(page, '.pt-blocks', 16),
    marks: [{ sel: '.pt-block >> nth=0' }, { sel: '.pt-block >> nth=1' }, { sel: '.pt-block >> nth=2' }],
  },
  {
    name: 'proto-compare',
    path: (ids) => `/prototypes/compare?ids=${ids.proto.dbl},${ids.proto.sgl}`,
    desk: true,
    marks: [{ sel: btn('Play together') }, { sel: 'tr:has-text("Test") >> nth=0' }, { sel: 'tr:has-text("Compression")' }],
  },
  { name: 'proto-summary', path: '/prototypes/summary?sub=3', height: 760 },
  { name: 'proto-library', path: '/prototypes/library', height: 640, marks: [{ sel: btn('New') }] },

  // ----- Calendar -----
  {
    name: 'cal-board',
    path: '/calendar',
    marks: [{ sel: '[aria-label="Calendar views"]' }, { sel: ':is(.cal-filters summary, summary:has-text("Filters"), .cal-filters) >> nth=0' }, { sel: '.cal-group >> nth=0' }, { sel: '.cal-group >> nth=0 >> role=button[name="Task"]' }],
    height: 844,
  },
  {
    name: 'cal-rows',
    path: '/calendar',
    css: NO_BARS,
    act: (page) => scrollTo(page, '.cal-group:has-text("3 Intake")', 260),
    clip: '.cal-group:has-text("3 Intake")',
    pad: 12,
    marks: [
      { sel: '.cal-group:has-text("3 Intake") .cal-row >> nth=0 >> button >> nth=0' },
      { sel: '.cal-group:has-text("3 Intake") .cal-row__title >> nth=0' },
      { sel: '.cal-group:has-text("3 Intake") >> text=High' },
      { sel: '.cal-group:has-text("3 Intake") >> text=/waits for/' },
    ],
  },
  {
    name: 'cal-new',
    path: '/calendar',
    css: NO_BARS,
    clip: '.cal-group:has-text("3 Intake")',
    pad: 12,
    act: async (page) => {
      await scrollTo(page, '.cal-group:has-text("3 Intake")', 260)
      await page.locator('.cal-group:has-text("3 Intake") >> role=button[name="Task"]').click()
      await pause(page, 300)
      await page.keyboard.type('Roller test thu high @noa')
      await pause(page, 500)
    },
    marks: [{ sel: '.cal-group:has-text("3 Intake") .cal-quick input' }, { sel: '.cal-group:has-text("3 Intake") .cal-quick >> role=button[name="Add"]' }],
  },
  {
    name: 'cal-task',
    path: '/calendar',
    act: click('.cal-group:has-text("3 Intake") .cal-row__title >> nth=1', 800),
    marks: [
      { sel: '.sheet [aria-label="Status"]' },
      { sel: '.sheet :text-is("Dates") >> xpath=following-sibling::*[1]' },
      { sel: '.sheet :text-is("Owners") >> xpath=following-sibling::*[1]' },
      { sel: '.sheet :text-is("Waits for") >> xpath=following-sibling::*[1]' },
    ],
  },
  {
    name: 'cal-group',
    path: (ids) => `/calendar/g/${ids.group('Intake')}`,
    height: 760,
    marks: [{ sel: tap("Today") }, { sel: '[aria-label="Show"]' }, { sel: 'main input.field >> nth=0' }],
  },
  {
    name: 'cal-phases',
    path: (ids) => `/calendar/g/${ids.group('Intake')}`,
    viewport: { width: 390, height: 1240 },
    css: NO_TABBAR,
    height: 1200,
    act: click('[aria-label="Show"] >> text=Phases', 700),
    marks: [{ sel: 'h2:has-text("Phases")' }, { sel: btn('Finish') }, { sel: '[aria-label="New phase name"]' }],
  },
  {
    name: 'cal-plan',
    path: '/calendar?view=gantt',
    height: 760,
    act: (page) => scrollTo(page, 'main :text-is("Intake")', 300),
    marks: [{ sel: '[aria-label="Calendar views"] >> text=Plan' }, { sel: 'main :text-is("Intake") >> xpath=ancestor::*[contains(@class,"cal")][1]' }],
  },
  {
    name: 'cal-update',
    path: '/calendar/update',
    height: 620,
    marks: [{ sel: '[aria-label="Group"]' }, { sel: 'textarea' }, { sel: 'main button[type=submit]' }],
  },
  {
    name: 'cal-summary',
    path: '/calendar/summary',
    height: 700,
    marks: [{ sel: '[aria-label="Day before"]' }, { sel: tap('Copy as text') }],
  },
  {
    name: 'cal-month',
    path: '/calendar?view=calendar',
    height: 760,
    marks: [{ sel: tap('Event') }, { sel: '.cal-agenda >> nth=0' }],
  },
  {
    name: 'cal-event',
    path: '/calendar?view=calendar',
    act: click(tap('Event'), 800),
    marks: [{ sel: '.sheet [aria-label="Kind"]' }, { sel: '.sheet [aria-label="Repeat days"]' }, { sel: '.sheet [aria-label="Reminders"]' }],
  },
  {
    name: 'cal-gantt',
    path: '/calendar',
    desk: true,
    act: click('[aria-label="Calendar views"] >> text=Gantt', 1200),
    marks: [{ sel: '.gantt__phase >> nth=0' }, { sel: '.gantt__today' }],
  },

  // ----- Search -----
  {
    name: 'search',
    path: '/',
    desk: true,
    clip: '.palette',
    act: async (page) => {
      await page.keyboard.press('Control+k')
      await page.keyboard.type('20x40x1 700')
      await pause(page, 300)
    },
    marks: [{ sel: '.palette__input' }, { sel: '.palette .pick >> nth=0' }],
  },
  {
    name: 'search-part',
    path: '/',
    desk: true,
    clip: '.palette',
    act: async (page) => {
      await page.keyboard.press('Control+k')
      await page.keyboard.type('300')
      await pause(page, 600)
    },
    marks: [{ sel: '.palette .pick >> nth=0' }],
  },
  {
    name: 'search-phone',
    path: '/',
    act: async (page) => {
      await page.locator(btn('Search')).click()
      await page.keyboard.type('M5')
      await pause(page)
    },
    clip: '.palette',
    marks: [{ sel: '.palette .pick >> nth=0' }],
  },

  // ----- Tools and handbook -----
  {
    name: 'tools',
    path: '/tools',
    height: 760,
    marks: [{ sel: '.tool >> nth=0' }, { sel: '.tool >> nth=1' }, { sel: '.tool >> nth=2' }, { sel: '.tool >> nth=3' }],
  },
  {
    name: 'tools-calc',
    path: '/calculators',
    desk: true,
    marks: [{ sel: '.calc-tabs' }, { sel: '.calc-section >> nth=0' }],
  },
  {
    name: 'tools-tap',
    path: '/tools/tap-drills?t=M5',
    height: 700,
    marks: [{ sel: '.ctl:has-text("Thread")' }, { sel: '.ctl:has-text("Wall thickness")' }, { sel: 'text="Tap drill" >> xpath=..' }],
  },
  {
    name: 'tools-center',
    path: '/tools/center-distance',
    height: 780,
    marks: [{ sel: 'role=radiogroup >> nth=0' }, { sel: 'label.num-field:has-text("Pulley 1 teeth")' }, { sel: 'label.num-field:has-text("Center distance you want")' }],
  },
  {
    name: 'handbook',
    path: '/handbook',
    height: 460,
    marks: [{ sel: 'main a >> nth=0' }, { sel: 'main a >> nth=1' }],
  },
  {
    name: 'handbook-design',
    path: '/handbook/design',
    height: 760,
    marks: [{ sel: '.hb-search' }, { sel: '.hb-head .chips' }, { sel: '.hb-toc' }],
  },

  // ----- Good to know -----
  {
    name: 'notifications',
    path: '/notifications',
    height: 420,
    marks: [{ sel: '[aria-label="Phone notifications"]' }, { sel: btn('Mark all read') }, { sel: 'main li >> nth=0' }],
  },
  {
    name: 'offline',
    path: '/stock',
    offline: true,
    height: 300,
    act: async (page) => {
      await page.evaluate(() => window.dispatchEvent(new Event('offline')))
      await pause(page, 800)
    },
    marks: [{ sel: '.app-status' }],
  },
  {
    name: 'people',
    path: '/people',
    height: 560,
    marks: [{ sel: btn('Shared PC') }, { sel: btn('Ban') }],
  },
]
