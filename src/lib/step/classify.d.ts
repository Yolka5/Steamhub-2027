import type { Framed } from './engine'

export type Step = 'CNC' | 'Lathe' | 'Mill' | '3D print' | 'Bend' | 'Bought'

/** Made or bought, and the machines in order, from shape and name (classify.js). */
export function guessRoute(G: Framed | null, name: string): { route: Step[]; cls: string | null; why: string }
export function nameSays(name: string): 'print' | 'made' | 'bought' | null
export function roundAxis(G: Framed | null): 0 | 1 | 2 | null
