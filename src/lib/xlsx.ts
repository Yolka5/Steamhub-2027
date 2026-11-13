// Reads the first sheet of an .xlsx file into rows of text, in the browser, with no library: an
// .xlsx is a zip of XML files, and the browser can inflate zip entries itself (DecompressionStream).
// Enough for Monday's board exports; formulas come in as their last saved value.

const td = new TextDecoder()

async function inflate(bytes: Uint8Array, method: number) {
  if (method === 0) return td.decode(bytes)
  if (method !== 8) throw new Error('This Excel file is packed in a way Steamhub cannot read')
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).text()
}

/** The files inside a zip, by name, unpacked on demand. */
function zipEntries(buf: ArrayBuffer) {
  const v = new DataView(buf)
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file')
  const count = v.getUint16(eocd + 10, true)
  let at = v.getUint32(eocd + 16, true)
  const out = new Map<string, () => Promise<string>>()
  for (let n = 0; n < count; n++) {
    if (v.getUint32(at, true) !== 0x02014b50) break
    const method = v.getUint16(at + 10, true)
    const size = v.getUint32(at + 20, true)
    const nameLen = v.getUint16(at + 28, true)
    const extraLen = v.getUint16(at + 30, true)
    const commentLen = v.getUint16(at + 32, true)
    const local = v.getUint32(at + 42, true)
    const name = td.decode(new Uint8Array(buf, at + 46, nameLen))
    out.set(name, () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
      return inflate(new Uint8Array(buf, start, size), method)
    })
    at += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const col = (ref: string) => {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Dates saved as Excel day numbers come back as YYYY-MM-DD. */
const DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57])
function serialDay(n: number) {
  const ms = Math.round((n - 25569) * 86_400_000)
  return new Date(ms).toISOString().slice(0, 10)
}

export async function readXlsx(file: File): Promise<string[][]> {
  const files = zipEntries(await file.arrayBuffer())
  const get = async (name: string) => (files.has(name) ? xml(await files.get(name)!()) : null)
  const strings: string[] = []
  const shared = await get('xl/sharedStrings.xml')
  for (const si of Array.from(shared?.getElementsByTagName('si') ?? [])) strings.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''))

  // Which cell styles are dates.
  const dateStyles = new Set<number>()
  const styles = await get('xl/styles.xml')
  if (styles) {
    const custom = new Map(Array.from(styles.getElementsByTagName('numFmt')).map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '']))
    const xfs = styles.getElementsByTagName('cellXfs')[0]
    Array.from(xfs?.getElementsByTagName('xf') ?? []).forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId') ?? 0)
      const code = custom.get(id)
      if (DATE_FORMATS.has(id) || (code && /[dmy]/i.test(code.replace(/"[^"]*"/g, '')) && !/[h]/i.test(code))) dateStyles.add(i)
    })
  }

  // The first sheet in the workbook's order.
  const wb = await get('xl/workbook.xml')
  const rels = await get('xl/_rels/workbook.xml.rels')
  const firstId = wb?.getElementsByTagName('sheet')[0]?.getAttribute('r:id')
  const target = Array.from(rels?.getElementsByTagName('Relationship') ?? []).find((r) => r.getAttribute('Id') === firstId)?.getAttribute('Target')
  const path = target ? `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}` : 'xl/worksheets/sheet1.xml'
  const sheet = (await get(path)) ?? (await get('xl/worksheets/sheet1.xml'))
  if (!sheet) throw new Error('No sheet found in this file')

  const rows: string[][] = []
  for (const r of Array.from(sheet.getElementsByTagName('row'))) {
    const i = Number(r.getAttribute('r') ?? rows.length + 1) - 1
    const row: string[] = []
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const t = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let text = ''
      if (t === 's') text = strings[Number(v)] ?? ''
      else if (t === 'inlineStr') text = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('')
      else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE'
      else if (t !== 'str' && t !== 'e' && v && dateStyles.has(Number(c.getAttribute('s') ?? -1))) text = serialDay(Number(v))
      else text = v
      row[col(c.getAttribute('r') ?? 'A1')] = text.trim()
    }
    rows[i] = Array.from(row, (x) => x ?? '')
  }
  return Array.from(rows, (x) => x ?? [])
}
