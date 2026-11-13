import { isOpen, queueSort, type Machine, type Part } from './mfg'

// Which machines the Calendar's CNC and Workshop groups stand for, and their open parts.
export const CNC_MACHINES: Machine[] = ['CNC']
export const WORKSHOP_MACHINES: Machine[] = ['Mill', 'Lathe', '3D print']

export function openParts(tasks: Part[], machines: Machine[]) {
  return tasks.filter((p) => isOpen(p) && machines.includes(p.machine)).sort(queueSort)
}
