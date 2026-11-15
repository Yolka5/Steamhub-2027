// The handbook's smart search: one doc per block of a chapter, with the synonym list.
import { HANDBOOK_SYNONYMS } from '../content/handbookSynonyms'
import { createSearch, type SearchDoc } from './smartSearch'

export interface HbLink {
  title: string
  href: string
  note: string
}
export interface HbBlock {
  title: string
  tags: string[]
  html: string
  checklist?: string[]
  links?: HbLink[]
}
export interface HbSection {
  id: string
  title: string
  blocks: HbBlock[]
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, ' ')

/** A block's id in the search: chapter id and position. */
export const blockId = (s: HbSection, i: number) => `${s.id}:${i}`

export function makeHandbookSearch(sections: HbSection[]) {
  const docs: SearchDoc[] = sections.flatMap((s) =>
    s.blocks.map((b, i) => ({
      id: blockId(s, i),
      title: [s.title, b.title],
      strong: [...b.tags, ...(b.links ?? []).map((l) => l.title)],
      body: [plain(b.html), ...(b.checklist ?? []).map(plain), ...(b.links ?? []).map((l) => l.note)],
    })),
  )
  return createSearch(docs, HANDBOOK_SYNONYMS)
}
