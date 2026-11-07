import type { StepFile } from './engine'

// A standalone STEP file for one part of an assembly, for 3D printing.
// Keeps the original header and every entity the part's shape needs: its product chain,
// the shape representations and their units context. Ids stay as they were (STEP allows gaps).

const REF = /#(\d+)/g

export function partStep(S: StepFile, text: string, pd: number): string | null {
  const roots: number[] = []
  const pdsIds = S.ofType('PRODUCT_DEFINITION_SHAPE').filter((i) => S.get(i).a[2]?.ref === pd)
  if (!pdsIds.length) return null
  const reps = new Set<number>()
  for (const pds of pdsIds) {
    roots.push(pds)
    for (const sdr of S.ofType('SHAPE_DEFINITION_REPRESENTATION')) {
      const a = S.get(sdr).a
      if (a[0]?.ref === pds) {
        roots.push(sdr)
        reps.add(a[1].ref)
      }
    }
  }
  // Shape representations linked to the part's own one hold the actual solids.
  for (const srr of S.ofType('SHAPE_REPRESENTATION_RELATIONSHIP')) {
    const a = S.get(srr).a
    if (reps.has(a[2]?.ref) || reps.has(a[3]?.ref)) roots.push(srr)
  }
  if (roots.length < 2) return null

  const keep = new Set<number>()
  const stack = [...roots]
  while (stack.length) {
    const id = stack.pop()!
    if (keep.has(id)) continue
    const raw = S.raw.get(id)
    if (!raw) continue
    keep.add(id)
    for (const m of raw[1].matchAll(REF)) {
      const r = +m[1]
      if (!keep.has(r)) stack.push(r)
    }
  }

  const hs = text.indexOf('HEADER;')
  const he = text.indexOf('ENDSEC;', hs)
  const header = hs >= 0 && he > hs ? text.slice(hs, he + 7) : "HEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;"
  const lines = [...keep]
    .sort((a, b) => a - b)
    .map((id) => {
      const [t, args] = S.raw.get(id)!
      return t === 'COMPLEX' ? `#${id}=(${args});` : `#${id}=${t}${args};`
    })
  return `ISO-10303-21;\n${header}\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`
}
