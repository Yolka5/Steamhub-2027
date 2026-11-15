// Checks the handbook's smart search: what people type, and the chapter it should find.
// Run: npx tsx scripts/verify-search.ts
import handbook from '../src/content/handbook.json'
import { makeHandbookSearch, type HbSection } from '../src/lib/handbookSearch'

const sections = handbook.sections as HbSection[]
const search = makeHandbookSearch(sections)

/** query, a chapter that must be in the results (or null for "nothing"), and the top result if it matters. */
const CASES: [string, string | null, string?][] = [
  ['חוט', 's3'],
  ['חבל', 's3'],
  ['חבלים', 's4'],
  ['בחוטים', 's3'],
  ['rope', 's3'],
  ['זיוות', 's8', 's8'],
  ['זיות', 's8'],
  ['ציר', 's8'],
  ['pivot', 's8'],
  ['אינטייק', 's6'],
  ['דריבלר', 's6'],
  ['דריבלרים', 's6'],
  ['דריבר', 's6'],
  ['ברגים', 's9'],
  ['בורג', 's9'],
  ['צק ליסט', 's9', 's9'],
  ['צ׳ק ליסט', 's9', 's9'],
  ['צ’ק ליסט', 's9', 's9'],
  ['checklist', 's9'],
  ['סלאפ דאון', 's7', 's7'],
  ['slapdown', 's7'],
  ['סלפדאון', 's7'],
  ['מעלית', 's2'],
  ['אלווייטור', 's2'],
  ['טפס', 's3'],
  ['קליימב', 's3'],
  ['טלסקופ', 's4', 's4'],
  ['מיסבים', 's3'],
  ['bearing', 's3'],
  ['גלגלות', 's3'],
  ['פולי', 's5'],
  ['לקסן', 's7'],
  ['שרשרת', 's8'],
  ['מותחן', 's8'],
  ['2025', 's3'],
  ['1690', 's3'],
  ['טיפוס חוט', 's3'],
  ['חבל טיפוס', 's3'],
  ['TBA', 's12'],
  ['chief delphi', 's12'],
  ['יוטיוב', 's18'],
  ['וידאו', 's18'],
  ['סרטונים', 's18'],
  ['מחשבון', 's11'],
  ['דריב', 's6'],
  ['ט', 's3'],
  ['פיצה', null],
  ['qwertyu', null],
]

let fails = 0
for (const [q, want, top] of CASES) {
  const r = search(q)
  const chapters = [...new Set([...r.scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id.split(':')[0]))]
  const ok = want === null ? chapters.length === 0 : chapters.includes(want) && (!top || chapters[0] === top)
  const note = r.notes.map((n) => `${n.typed} → ${n.shown.join(', ')}`).join(' · ')
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${q.padEnd(14)} ${chapters.slice(0, 6).join(' ')}${note ? `   (${note})` : ''}`)
  if (!ok) fails++
}
console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
