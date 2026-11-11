import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Files from public/ the app needs to open offline. Fonts and images not listed are saved on first use. */
const PUBLIC_PRECACHE = [
  '/manifest.webmanifest',
  '/favicon-64.png',
  '/logo-144.webp',
  '/logo-dark-144.webp',
  '/fonts/NightMachine.woff2',
  '/fonts/instrument-sans-latin.woff2',
  '/fonts/newsreader-latin.woff2',
]

/**
 * Writes dist/sw.js from sw/sw.js with this build's file list. The version is a hash of those
 * files, so every deploy that changes the app gives phones a new worker to install.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'steamhub-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      // Every code file (the app, KaTeX, the video tools, the STEP reader) and KaTeX's woff2 fonts.
      // Lazy files are saved too: a tab left open across a deploy otherwise can't load them, since
      // the old file names are gone from the server. They install in the background.
      const assets = readdirSync(join(outDir, 'assets'))
        .filter((f) => /\.(js|css)$/.test(f) || /^KaTeX_.+\.woff2$/.test(f))
        .map((f) => `/assets/${f}`)
      const precache = ['/index.html', ...assets, ...PUBLIC_PRECACHE]
      const template = readFileSync('sw/sw.js', 'utf8')
      const version = createHash('sha256')
        .update(template)
        .update(precache.join('\n'))
        .update(readFileSync(join(outDir, 'index.html')))
        .digest('hex')
        .slice(0, 12)
      const sw = template.replace("'__VERSION__'", JSON.stringify(version)).replace('__PRECACHE__', JSON.stringify(precache))
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
})
