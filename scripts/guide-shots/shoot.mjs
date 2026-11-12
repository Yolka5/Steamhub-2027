// Takes the screenshots for the in-app guide (/guide) from the real app, with demo data.
//
//   npm run dev -- --port 5199 &          (any running Steamhub dev server)
//   node scripts/guide-shots/shoot.mjs [--base http://localhost:5199] [name ...]
//
// Supabase is never called: a demo session is injected and every REST, RPC, storage and auth
// request is answered by mock.mjs from seed.mjs, so nothing touches the team's data. Shots land
// in public/guide/ as WebP (needs Playwright; cwebp is used when installed, PNG otherwise).
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMock } from './mock.mjs'
import { ME, seed } from './seed.mjs'
import { SHOTS as DEFAULT_SHOTS } from './shots.mjs'

// Playwright is not a project dependency; a global install is found through require.
const { chromium } = createRequire(import.meta.url)('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

const args = process.argv.slice(2)
const baseAt = args.indexOf('--base')
const BASE = baseAt >= 0 ? args.splice(baseAt, 2)[1] : 'http://localhost:5199'
const outAt = args.indexOf('--out')
const OUT = outAt >= 0 ? args.splice(outAt, 2)[1] : null
const listAt = args.indexOf('--list')
const LIST = listAt >= 0 ? args.splice(listAt, 2)[1] : null
const only = new Set(args)

// --list and --out are for checking other pages with the same demo data (not the guide's pictures).
const SHOTS = LIST ? (await import(LIST)).SHOTS : DEFAULT_SHOTS
const out = OUT ?? join(root, 'public/guide')
mkdirSync(out, { recursive: true })
/** Each shot's size in CSS px, so the guide reserves the space before the picture loads. */
const manifest = join(root, 'src/content/guide-shots.json')

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim())),
)
const SUPA = env.VITE_SUPABASE_URL
const ref = new URL(SUPA).hostname.split('.')[0]

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600 * 24
const user = {
  id: ME.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: ME.email,
  app_metadata: { provider: 'google' },
  user_metadata: { full_name: ME.name, name: ME.name },
  created_at: '2026-11-01T00:00:00Z',
}
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME.id, role: 'authenticated', aud: 'authenticated', exp, email: ME.email })}.demo`
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'demo', user }

const SCALE = Number(process.env.SCALE ?? 0) || null
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE ?? 2, isMobile: true, hasTouch: true }
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: SCALE ?? 1.5 }

async function context(browser, s) {
  const { db, files, ids } = seed()
  const mock = createMock({ db, files, me: ME })
  const ctx = await browser.newContext({
    ...(s.desk ? DESK : PHONE),
    ...(s.viewport ? { viewport: s.viewport } : {}),
    colorScheme: s.dark ? 'dark' : 'light',
    serviceWorkers: 'block',
    timezoneId: 'Asia/Jerusalem',
    locale: 'en-GB',
  })
  await ctx.addInitScript(
    ([key, sess, signedIn, dark]) => {
      if (signedIn) localStorage.setItem(key, JSON.stringify(sess))
      else localStorage.removeItem(key)
      localStorage.setItem('theme', dark ? 'dark' : 'light')
      sessionStorage.setItem('hero-played', '1')
      // Fixed clock, so "40 min ago" reads the same on every run.
      const fixed = Date.parse('2026-11-12T16:30:00Z')
      const offset = fixed - Date.now()
      const RealDate = Date
      class FixedDate extends RealDate {
        constructor(...a) {
          super(...(a.length ? a : [RealDate.now() + offset]))
        }
        static now() {
          return RealDate.now() + offset
        }
      }
      globalThis.Date = FixedDate
    },
    [`sb-${ref}-auth-token`, session, s.signedOut !== true, !!s.dark],
  )
  await ctx.routeWebSocket(/realtime/, () => {})
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request()
    const url = req.url()
    const headers = req.headers()
    let body = null
    try {
      body = req.postDataJSON()
    } catch {
      body = null
    }
    let res
    if (url.includes('/rest/v1/')) res = mock.rest(req.method(), url, headers, body)
    else if (url.includes('/storage/v1/')) res = mock.storage(req.method(), url)
    else if (url.includes('/auth/v1/user')) res = { status: 200, json: user }
    else if (url.includes('/auth/v1/token')) res = { status: 200, json: session }
    else if (url.includes('/functions/v1/')) res = { status: 200, json: { ok: true } }
    else res = { status: 200, json: {} }
    const h = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...(res.headers ?? {}) }
    if (res.raw) return route.fulfill({ status: res.status, headers: h, body: res.raw })
    return route.fulfill({ status: res.status, headers: { ...h, 'content-type': 'application/json' }, body: res.json == null ? '' : JSON.stringify(res.json) })
  })
  return { ctx, ids }
}

/** PNG to WebP: cwebp when installed, else Python's Pillow, else the PNG stays. */
function toWebp(png, webp) {
  for (const [cmd, args] of [
    ['cwebp', ['-quiet', '-q', '80', png, '-o', webp]],
    ['python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], quality=80, method=6)', png, webp]],
  ]) {
    try {
      execFileSync(cmd, args, { stdio: 'ignore' })
      rmSync(png)
      return webp
    } catch {
      /* try the next one */
    }
  }
  return png
}

const sizes = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : {}
const browser = await chromium.launch()
const failed = []
for (const s of SHOTS) {
  if (only.size && !only.has(s.name)) continue
  for (const dark of s.themes ?? [false, true]) {
    const name = dark ? `${s.name}-dark` : s.name
    const { ctx, ids } = await context(browser, { ...s, dark })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    try {
      const path = typeof s.path === 'function' ? s.path(ids) : s.path
      await page.goto(BASE + path, { waitUntil: 'networkidle' })
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' })
      if (s.css) await page.addStyleTag({ content: s.css })
      if (s.act) await s.act(page, ids)
      await page.waitForTimeout(s.wait ?? 500)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (wide > 0) errors.push(`scrolls sideways by ${wide} px`)
      const png = join(out, `${name}.png`)
      const vp = page.viewportSize()
      let clip
      if (s.clip) {
        const box = await page.locator(s.clip).first().boundingBox()
        const pad = s.pad ?? 0
        clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(vp.width, box.width + 2 * pad), height: Math.min(s.maxHeight ?? Infinity, box.height + 2 * pad) }
      } else if (s.height) clip = { x: 0, y: 0, width: vp.width, height: s.height }
      await page.screenshot({ path: png, clip, fullPage: !!s.full, animations: 'disabled' })
      if (!dark) {
        const w = Math.round(clip?.width ?? vp.width)
        const h = Math.round(clip?.height ?? vp.height)
        sizes[s.name] = [w, h]
      }
      const file = OUT ? png : toWebp(png, join(out, `${name}.webp`))
      console.log(`ok   ${name} ${file.endsWith('.png') ? '(png)' : ''}${errors.length ? `  (page errors: ${errors.join(' | ')})` : ''}`)
    } catch (e) {
      failed.push(name)
      console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`)
    }
    await ctx.close()
  }
}
await browser.close()
if (!OUT) writeFileSync(manifest, `${JSON.stringify(sizes, null, 2)}\n`)
if (failed.length) process.exitCode = 1
