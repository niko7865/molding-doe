export type SectionId = 'study' | 'guide' | 'design' | 'run' | 'analyze' | 'report'

export interface Section {
  id: SectionId
  label: string
  summary: string
}

/** Top-level workflow, in the order a study normally moves through it. */
export const SECTIONS: Section[] = [
  { id: 'study', label: 'Study', summary: 'Open, save and merge study files; set machine and units.' },
  { id: 'guide', label: 'Pre-DOE guide', summary: 'Viscosity curve, cavity balance, pressure drop, gate seal, cooling time, process window.' },
  { id: 'design', label: 'Design', summary: 'Pick factors and a design; set center points, replicates, blocks and randomization.' },
  { id: 'run', label: 'Run', summary: 'Step through runs at the press and record responses per cavity.' },
  { id: 'analyze', label: 'Analyze', summary: 'Effects, ANOVA, diagnostics, surfaces, optimizer and confirmation.' },
  { id: 'report', label: 'Report', summary: 'Printable report and CSV/Excel export.' },
]
