// Every picture in the guide: where to go, what to do first, and how much of the screen to keep.
// Phone shots are 390 px wide; `desk` ones are a 1280 px laptop. `height` keeps the top of the
// screen only, `clip` keeps one element. Each shot is taken in light and dark.

const typeInto = async (page, label, text) => {
  const f = page.getByLabel(label, { exact: false }).first()
  await f.fill(text)
}

export const SHOTS = [
  // Getting in
  { name: 'signin', path: '/', signedOut: true, clip: '.gate__box', pad: 24 },
  { name: 'home', path: '/', height: 620 },
  { name: 'home-desk', path: '/', desk: true },
  { name: 'tabbar', path: '/', clip: '.tabbar' },

  // Stock
  { name: 'stock-find', path: '/stock?q=20x40x1%20700', height: 760 },
  {
    name: 'stock-reserve',
    path: '/stock?q=20x40x1%20700',
    act: async (page) => {
      await page.getByRole('button', { name: 'Reserve' }).first().click()
      await page.waitForTimeout(400)
    },
  },
  { name: 'stock-piece', path: '/stock/PR-002', height: 560 },
  {
    name: 'stock-add',
    path: '/stock/add',
    act: async (page) => {
      await page.getByRole('radio', { name: 'Profile' }).click()
      const dims = page.locator('.dims input')
      await dims.nth(0).fill('20')
      await dims.nth(1).fill('40')
      await dims.nth(2).fill('1')
      await typeInto(page, 'Length (mm)', '600')
      await page.locator('.add-preview').scrollIntoViewIfNeeded()
      await page.mouse.wheel(0, 120)
    },
  },
  { name: 'stock-cut', path: '/stock/cut?size=20x40x1&len=700%20x2%2C%20350', height: 760 },
  { name: 'stock-plates', path: '/stock/plates', height: 700 },

  // Manufacturing
  { name: 'make-list', path: '/manufacturing', height: 760 },
  { name: 'make-rows', path: '/manufacturing', clip: '.mfg-group', pad: 12, maxHeight: 480, css: '.tabbar,.topbar{display:none!important}' },
  { name: 'make-part', path: (ids) => `/manufacturing/p/${ids.part(3002)}`, height: 720, wait: 1500 },
  {
    name: 'make-drawings',
    path: '/manufacturing',
    act: async (page) => {
      await page.locator('.mfg-group__print').first().click()
      await page.waitForTimeout(600)
    },
  },
  {
    name: 'make-map',
    path: '/manufacturing',
    desk: true,
    act: async (page) => {
      await page.locator('.wmap-handle').click()
      await page.waitForTimeout(900)
    },
  },
  { name: 'make-subsystem', path: (ids) => `/manufacturing/s/${ids.sub(3)}`, height: 800, wait: 1200 },
  { name: 'make-robots', path: '/manufacturing/robots', height: 420 },
  { name: 'make-wishlist', path: '/manufacturing/wishlist', height: 640 },

  // Prototypes
  { name: 'proto-list', path: '/prototypes', height: 720 },
  { name: 'proto-record', path: '/prototypes/record', height: 520 },
  { name: 'proto-test', path: (ids) => `/prototypes/${ids.proto.dbl}/test` },
  { name: 'proto-page', path: (ids) => `/prototypes/${ids.proto.dbl}`, height: 800 },
  { name: 'proto-compare', path: (ids) => `/prototypes/compare?ids=${ids.proto.dbl},${ids.proto.sgl}`, desk: true },

  // Search
  {
    name: 'search',
    path: '/',
    desk: true,
    clip: '.palette',
    act: async (page) => {
      await page.keyboard.press('Control+k')
      await page.keyboard.type('20x40x1 700')
      await page.waitForTimeout(300)
    },
  },
  {
    name: 'search-part',
    path: '/',
    desk: true,
    clip: '.palette',
    act: async (page) => {
      await page.keyboard.press('Control+k')
      await page.keyboard.type('300')
      await page.waitForTimeout(600)
    },
  },

  // Tools and handbook
  { name: 'tools', path: '/tools', height: 760 },
  { name: 'tools-calc', path: '/calculators', desk: true },
  { name: 'tools-tap', path: '/tools/tap-drills?t=M5', height: 700 },
  { name: 'handbook', path: '/handbook', height: 520 },
  { name: 'handbook-design', path: '/handbook/design', height: 760 },
  { name: 'notifications', path: '/notifications', height: 380 },
]
