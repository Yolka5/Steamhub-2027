// Loose types for Tom's engine (engine.js). Only what Steamhub calls is typed in any detail.

export type Vec3 = [number, number, number]

export interface Edge {
  kind: 'line' | 'circle' | 'spline' | 'other'
  pts: Vec3[]
  center?: Vec3
  axis?: Vec3
  radius?: number
  full?: boolean
  id: number
}

export interface Face {
  kind: 'plane' | 'cyl' | 'cone' | 'other'
  loops: Vec3[][]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any
}

/** Part geometry in its own frame: X longest, Z thinnest, origin at the bounding-box corner. */
export interface Framed {
  edges: Edge[]
  faces: Face[]
  size: Vec3
}

export interface Raw {
  edges: Edge[]
  faces: Face[]
}

export interface Info {
  cls: 'plate' | 'tube' | 'long' | 'round' | 'print' | 'block' | 'manual'
  axis?: number
}

export interface ProjectItem {
  sig: string
  name: string
  qty: number
  size: number[]
  g: Raw
  G?: Framed
  info?: Info
  custom: boolean
  bad?: boolean
  method: string
  material: string
  notes: string
  partNo: string
  pd: number
  solids: number[]
}

export interface TitleBlock {
  team?: string
  subsystem?: string
  name?: string
  partNo?: string
  version?: string
  material?: string
  tolerance?: string
  drawnBy?: string
  maker?: string
  qty?: number
  notes?: string[]
}

export interface DrawingOps {
  pdfStream(): string
}

export interface ProjectedView {
  vis: [number, number][][]
  hid: [number, number][][]
  bb: [number, number, number, number]
}

export class StepFile {
  constructor(text: string)
  raw: Map<number, [string, string]>
  scale: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(id: number | { ref: number }): { t: string; a: any }
  type(id: number | { ref: number }): string | null
  ofType(t: string): number[]
}

export const VIEWS: Record<'front' | 'back' | 'top' | 'bottom' | 'right' | 'left', unknown>
export const METHODS: string[]
export const SCALES: number[]

export function buildProject(
  S: StepFile,
  opts?: { firstNo?: string; saved?: Record<string, unknown> },
  onProgress?: (t: string) => void,
): Promise<{ items: ProjectItem[]; rootName: string }>
export function partFrame(g: Raw): unknown
export function toFrame(g: Raw, F: unknown): Framed
export function classifyPart(G: Framed, name: string): Info
/** Wall thickness of a rectangular tube in its frame, or null. */
export function tubeWall(G: Framed): number | null
export function computeViews(G: Framed, info: Info): unknown
export function makeDrawing(
  G: Framed,
  info: Info,
  tb: TitleBlock,
  pre?: unknown,
): { doc: DrawingOps; svg: string; scale: number; cls: string; template: string }
export function projectView(G: Framed, view: unknown): ProjectedView
export function isoView(flip: boolean): unknown
export function buildPDFz(pages: DrawingOps[], title: string): Promise<Uint8Array>
export function buildZip(files: { name: string; data: Uint8Array | string }[]): Uint8Array
export function safeName(s: string): string
export function fmt(v: number): string
export class Svg implements DrawingOps {
  ops: Record<string, unknown>[]
  text(x: number, y: number, s: string, size?: number, anchor?: string, rot?: number): void
  line(x1: number, y1: number, x2: number, y2: number, w?: number): void
  poly(pts: number[][], w?: number): void
  path(loops: number[][][], fill: string, stroke: string, w: number): void
  pdfStream(): string
}

// ----- Phase 5: assembly scene, bolts and build order (loosely typed; see worker.ts for the shapes kept) -----
/* eslint-disable @typescript-eslint/no-explicit-any */
export function buildScene(P: any): any
export function findJoints(P: any): any[]
export function buildSequence(P: any, scene: any, joints: any[], sec: any): any
export function renderScene(scene: any, opts: any): any
export function jointHardware(j: any, type?: string): { items: [string, number][]; text: string; ok: boolean }
export function setHardwareStock(cfg: { metric?: number[]; inch?: number[]; nut?: 'nylock' | 'plain' } | null | undefined): void
export function wrapText(t: string, size: number, maxW: number): string[]
/** Width of Helvetica text in mm at a size in mm, for laying out PDF text. */
export function textW(s: string, size: number): number
export const HW: { lengths: number[]; inchLengths: number[]; nutKind: string; [k: string]: any }
/* eslint-enable @typescript-eslint/no-explicit-any */
