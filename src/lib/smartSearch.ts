// Forgiving search for Hebrew (and English) text. A word in the query finds a document when:
//   1. it's in the text as typed, or as the same word with a prefix or a plural (בחוטים finds חוט),
//   2. a word that means the same is in the text (חבל finds חוט, from a synonym list),
//   3. nothing else matched and it's a letter or two off a word in the text (זיות finds זיוות).
// Every word of the query has to find something. Exact beats synonym beats typo.

export interface SearchDoc {
  id: string
  /** Titles: a hit here counts most. */
  title: string[]
  /** Tags and names: a hit here counts more than in the text. */
  strong: string[]
  body: string[]
}

/** A query word, after expansion. */
interface Term {
  /** What was typed, normalized. Matches as a substring, so half-typed words still work. */
  typed: string
  /** Forms of what was typed (prefixes and plurals off). */
  own: Set<string>
  /** Forms of words that mean the same. */
  syn: Set<string>
  /** Synonyms that are more than one word, padded with spaces. */
  phrases: string[]
  /** Forms of words in the text that are close to what was typed (only when nothing else matched). */
  fixed: Set<string>
}

/** "Showing results for": what was typed, and what was searched instead. */
export interface SearchNote {
  typed: string
  shown: string[]
}

export interface SearchResult {
  /** Doc id to score. Only docs that match every query word are in it. */
  scores: Map<string, number>
  notes: SearchNote[]
  terms: Term[]
}

// ---------- Normalizing ----------

const FINALS: Record<string, string> = { ם: 'מ', ן: 'נ', ץ: 'צ', ף: 'פ', ך: 'כ' }
const WORD = /[\p{L}\p{N}]+(?:[.:/][\p{N}]+)*/gu
const WORD_RAW = /[\p{L}\p{N}'’׳״"]+(?:[.:/][\p{N}]+)*/gu

/** Lowercase, no niqqud, no geresh or quotes, no final letters. */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/['’‘`׳״"]/g, '')
    .replace(/[םןץףך]/g, (c) => FINALS[c])
}

const words = (s: string) => normalize(s).match(WORD) ?? []
const isHebrew = (w: string) => /[א-ת]/.test(w)
const hasDigit = (w: string) => /\d/.test(w)

const PREFIX = 'והבלמשכ'
const MIN_STEM = 3

/** The forms a word could be: as is, without one or two prefix letters, without a plural or feminine ending. */
export function forms(w: string, prefixes = true): string[] {
  const out = new Set([w])
  if (!isHebrew(w)) {
    if (w.length > 3 && w.endsWith('s')) out.add(w.slice(0, -1))
    return [...out]
  }
  const heads = [w]
  if (prefixes) for (let i = 1; i <= 2 && PREFIX.includes(w[i - 1]) && w.length - i >= MIN_STEM; i++) heads.push(w.slice(i))
  for (const h of heads) {
    out.add(h)
    const m = h.match(/^(.+?)(ים|ות|ה|ת)$/)
    if (m && m[1].length >= MIN_STEM) out.add(m[1])
  }
  return [...out]
}

// ---------- Typos ----------

/** How many letters a word can be off: none for short words or numbers, one, two for long words. */
const slack = (w: string) => (hasDigit(w) || w.length < 4 ? 0 : w.length < 7 ? 1 : 2)

/** Edit distance with swapped letters counting as one, giving up past `max`. */
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      best = Math.min(best, d[i][j])
    }
    if (best > max) return max + 1
  }
  return d[a.length][b.length]
}

const close = (a: string, b: string) => {
  const max = slack(a)
  return max > 0 && !hasDigit(b) && distance(a, b, max) <= max
}

// ---------- Index ----------

interface Level {
  /** The words, space separated and padded, so ` word ` matches whole words. */
  text: string
  forms: Set<string>
}

const level = (parts: string[]): Level => {
  const ws = words(parts.join(' '))
  return { text: ` ${ws.join(' ')} `, forms: new Set(ws.flatMap((w) => forms(w))) }
}

const hits = (set: Set<string>, keys: Iterable<string>) => {
  for (const k of keys) if (set.has(k)) return true
  return false
}

/** How well a term matches one level of a doc: 1 typed, 0.7 synonym, 0.5 typo, 0 not at all. */
function tier(t: Term, l: Level) {
  if (l.text.includes(t.typed) || hits(l.forms, t.own)) return 1
  if (hits(l.forms, t.syn) || t.phrases.some((p) => l.text.includes(p))) return 0.7
  if (hits(l.forms, t.fixed)) return 0.5
  return 0
}

/** Builds a search over a fixed set of docs. Call the result with a query. */
export function createSearch(docs: SearchDoc[], synonyms: string[][]) {
  const index = docs.map((d) => ({ id: d.id, title: level(d.title), strong: level(d.strong), body: level(d.body) }))
  const groups = synonyms.map((g) => [...new Set(g.map((m) => words(m).join(' ')))])
  const levels = index.flatMap((d) => [d.title, d.strong, d.body])
  const allForms = new Set(levels.flatMap((l) => [...l.forms]))
  const allText = levels.map((l) => l.text).join(' ')
  // How to show a normalized word: as it was written (final letters and all).
  const shownAs = new Map<string, string>()
  for (const raw of [...docs.flatMap((d) => [...d.title, ...d.strong, ...d.body]), ...synonyms.flat()].flatMap((s) => s.match(WORD_RAW) ?? []))
    if (!shownAs.has(words(raw).join(' '))) shownAs.set(words(raw).join(' '), raw)
  for (const g of synonyms) for (const m of g) shownAs.set(words(m).join(' '), m)
  const show = (w: string) => shownAs.get(w) ?? w
  // Every word in the text with its forms (prefixes left on), for typo fixing.
  const vocab = [...new Set(allText.split(' '))].filter((w) => w && !hasDigit(w)).map((w) => ({ w, forms: forms(w, false) }))

  const score = (t: Term, d: (typeof index)[number]) => Math.max(tier(t, d.title) * 5, tier(t, d.strong) * 3, tier(t, d.body))
  const anyHit = (t: Term) => index.some((d) => score(t, d) > 0)
  const inText = (m: string) => (m.includes(' ') ? allText.includes(` ${m} `) : hits(allForms, forms(m)))

  /** `typed` is normalized; `query` is how it was typed, for the note. */
  function expand(typed: string, query: string): { term: Term; note?: SearchNote } {
    const phrase = typed.includes(' ')
    // Only take prefix letters off what was typed when the word doesn't stand on its own (so מעלית
    // stays מעלית, and doesn't turn into עלית).
    const plain = forms(typed, false)
    const own = new Set(phrase ? [] : hits(allForms, plain) ? plain : forms(typed))
    const term: Term = { typed, own, syn: new Set(), phrases: [], fixed: new Set() }
    const direct = anyHit(term)

    // A group matches when one of its words is a form of what was typed, or (when what was typed
    // isn't in the text) a letter or two off one.
    const matched = groups.filter((g) => g.some((m) => m === typed || (!phrase && !m.includes(' ') && (hits(own, forms(m)) || (!direct && close(typed, m))))))
    for (const g of matched)
      for (const m of g) {
        if (m === typed) continue
        if (m.includes(' ')) term.phrases.push(` ${m} `)
        else for (const f of forms(m)) if (!own.has(f)) term.syn.add(f)
      }
    if (direct) return { term }

    if (matched.length && anyHit(term)) {
      // One word per group: the first that's in the text.
      const shown = matched.map((g) => g.find((m) => m !== typed && inText(m))).filter((m): m is string => !!m)
      return { term, note: { typed: query, shown: [...new Set(shown)].map(show) } }
    }

    // A typo: the closest words in the text. Prefixes stay on, both sides: taking them off makes
    // short made-up words that anything is close to.
    const max = phrase ? 0 : slack(typed)
    if (!max) return { term }
    let best = max + 1
    let found: string[] = []
    for (const v of vocab) {
      let d = max + 1
      for (const a of plain) for (const b of v.forms) d = Math.min(d, distance(a, b, max))
      if (d < best) [best, found] = [d, []]
      if (d === best && d <= max) found.push(v.w)
    }
    for (const w of found) for (const f of forms(w)) term.fixed.add(f)
    return { term, note: found.length ? { typed: query, shown: found.slice(0, 3).map(show) } : undefined }
  }

  return function search(query: string): SearchResult {
    const q = words(query).join(' ')
    if (!q) return { scores: new Map(), notes: [], terms: [] }
    // A query that is a synonym as a whole ("סלאפ דאון", "צ’ק ליסט") is one term; otherwise one per word.
    const parts = q.includes(' ') && groups.some((g) => g.includes(q)) ? [q] : q.split(' ')
    const raw = query.match(WORD_RAW) ?? []
    const expanded = parts.map((p, i) => expand(p, parts.length === raw.length ? raw[i] : query.trim()))
    const terms = expanded.map((e) => e.term)
    const scores = new Map<string, number>()
    for (const d of index) {
      let sum = 0
      for (const t of terms) {
        const s = score(t, d)
        if (!s) {
          sum = 0
          break
        }
        sum += s
      }
      if (sum) scores.set(d.id, sum + (d.title.text.includes(q) ? 3 : 0))
    }
    return { scores, notes: expanded.flatMap((e) => (e.note?.shown.length ? [e.note] : [])), terms }
  }
}

// ---------- Highlighting ----------

function wordHit(raw: string, terms: Term[]) {
  const w = normalize(raw)
  const fs = forms(w)
  return terms.some(
    (t) =>
      (t.typed.length > 1 && w.includes(t.typed)) ||
      t.typed.split(' ').includes(w) ||
      t.phrases.some((p) => p.includes(` ${w} `)) ||
      fs.some((f) => t.own.has(f) || t.syn.has(f) || t.fixed.has(f)),
  )
}

/** Wraps the words a search found in <mark>, in html (tags and entities are left alone). */
export function highlightHtml(html: string, r: SearchResult | null) {
  if (!r?.terms.length) return html
  return html
    .split(/(<[^>]+>|&[#\w]+;)/)
    .map((part, i) => (i % 2 ? part : part.replace(WORD_RAW, (m) => (wordHit(m, r.terms) ? `<mark>${m}</mark>` : m))))
    .join('')
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Same, for plain text: returns html. */
export const highlightText = (text: string, r: SearchResult | null) => highlightHtml(escape(text), r)
