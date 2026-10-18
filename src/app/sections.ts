export type SectionId = 'intro' | 'study' | 'guide' | 'design' | 'run' | 'analyze' | 'report'

export interface Section {
  id: SectionId
  label: string
  summary: string
  /** Part of the optional DOE stage; shown only when the study has it switched on. */
  doe?: boolean
}

/** Top-level workflow, in the order a study normally moves through it. */
export const SECTIONS: Section[] = [
  { id: 'intro', label: 'Introduction', summary: 'What the tool is for and how to use it.' },
  { id: 'study', label: 'Study', summary: 'Open, save and merge study files; set mold, press and units.' },
  { id: 'guide', label: 'Molding studies', summary: 'Viscosity curve, cavity balance, pressure drop, gate seal, cooling time, process window.' },
  { id: 'design', label: 'Design', summary: 'Pick factors and a design; set center points, replicates, blocks and randomization.', doe: true },
  { id: 'run', label: 'Run', summary: 'Step through runs at the press and record responses per cavity.', doe: true },
  { id: 'analyze', label: 'Analyze', summary: 'Effects, ANOVA, diagnostics, surfaces, optimizer and confirmation.', doe: true },
  { id: 'report', label: 'Report', summary: 'Printable report and CSV/Excel export.' },
]

/** The numbered workflow steps to show: the DOE ones only when the stage is on. */
export function visibleSections(doe: boolean): Section[] {
  return SECTIONS.filter((s) => s.id !== 'intro' && (doe || !s.doe))
}
