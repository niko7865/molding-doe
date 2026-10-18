import {
  boxBehnkenDesign,
  buildDesign,
  centralCompositeDesign,
  fractionalFactorialDesign,
  fractionOptions,
  fromCoded,
  fullFactorialDesign,
  newSeed,
  plackettBurmanDesign,
  plackettBurmanRuns,
  romanResolution,
  type BaseDesign,
  type BuiltDesign,
} from '../stats'
import { checkMachineLimits, type LimitViolation } from './presets'
import { newId, type DesignSpec, type Run, type Study } from './schema'

export type DesignDraft = Omit<DesignSpec, 'factorIds' | 'createdAt'>

export interface DesignChoice {
  key: string
  label: string
  /** Base runs before center points and replicates. */
  runs: number
  purpose: string
  draft: Pick<DesignDraft, 'type' | 'generators' | 'pbRuns' | 'alpha'>
}

/** Every design that fits k factors, roughly from screening to response surface. */
export function designChoices(k: number): DesignChoice[] {
  const out: DesignChoice[] = []
  if (k >= 2 && k <= 7) {
    out.push({ key: 'full', label: `Full factorial 2^${k}`, runs: 2 ** k, purpose: 'Every main effect and interaction, no aliasing.', draft: { type: 'full-factorial' } })
  }
  for (const f of fractionOptions(k)) {
    out.push({
      key: `frac-${f.p}`,
      label: `Fractional factorial 2^(${k}-${f.p}), resolution ${romanResolution(f.resolution)}`,
      runs: f.runs,
      purpose:
        f.resolution >= 5
          ? 'Main effects and two-factor interactions are clear of each other.'
          : f.resolution === 4
            ? 'Main effects are clear; two-factor interactions are aliased with each other.'
            : 'Screening only: main effects are aliased with two-factor interactions.',
      draft: { type: 'fractional-factorial', generators: f.generators },
    })
  }
  const pb = k >= 4 ? plackettBurmanRuns(k) : null
  if (pb) {
    out.push({ key: `pb-${pb}`, label: `Plackett–Burman, ${pb} runs`, runs: pb, purpose: 'Screening many factors for main effects only.', draft: { type: 'plackett-burman', pbRuns: pb } })
  }
  if (k >= 3 && k <= 7) {
    out.push({ key: 'bbd', label: 'Box–Behnken', runs: boxBehnkenDesign(k).points.length, purpose: 'Curvature and optimization; never runs all factors at their extremes at once.', draft: { type: 'box-behnken' } })
  }
  if (k >= 2 && k <= 6) {
    const n = centralCompositeDesign(k).points.length
    out.push({ key: 'ccd-r', label: 'Central composite, rotatable', runs: n, purpose: 'Curvature and optimization; axial runs go beyond the low/high levels.', draft: { type: 'central-composite', alpha: 'rotatable' } })
    out.push({ key: 'ccd-f', label: 'Central composite, face-centered', runs: n, purpose: 'Curvature and optimization while staying inside the low/high levels.', draft: { type: 'central-composite', alpha: 'face-centered' } })
  }
  return out
}

export function choiceKey(d: Pick<DesignDraft, 'type' | 'generators' | 'pbRuns' | 'alpha'>, k: number): string | undefined {
  return designChoices(k).find(
    (c) =>
      c.draft.type === d.type &&
      (c.draft.generators ?? []).join() === (d.generators ?? []).join() &&
      c.draft.pbRuns === d.pbRuns &&
      c.draft.alpha === d.alpha,
  )?.key
}

export function defaultDraft(k: number): DesignDraft {
  const choices = designChoices(k)
  // Full factorial up to 4 factors; otherwise the smallest fraction that keeps main effects clear.
  const pick =
    (k <= 4 && choices.find((c) => c.key === 'full')) ||
    choices.filter((c) => c.draft.type === 'fractional-factorial' && !c.label.endsWith('III')).sort((a, b) => a.runs - b.runs)[0] ||
    choices[0]
  return {
    ...(pick?.draft ?? { type: 'full-factorial' }),
    centerPoints: 3,
    replicates: 1,
    blocking: { kind: 'none' },
    randomize: true,
    seed: newSeed(),
  }
}

export function baseDesignFor(draft: DesignDraft, k: number): BaseDesign {
  switch (draft.type) {
    case 'full-factorial':
      return fullFactorialDesign(k)
    case 'fractional-factorial':
      return fractionalFactorialDesign(k, draft.generators ?? [])
    case 'plackett-burman':
      return plackettBurmanDesign(k, draft.pbRuns)
    case 'box-behnken':
      return boxBehnkenDesign(k)
    case 'central-composite':
      return centralCompositeDesign(k, draft.alpha ?? 'rotatable')
  }
}

export interface DesignPreview {
  built: BuiltDesign
  runs: Run[]
  /** Runs that ask for more than the press allows. */
  violations: { order: number; items: LimitViolation[] }[]
  /** Factors whose axial settings go beyond the entered low/high levels. */
  beyondRange: string[]
}

function emptyResults(study: Study): Run['results'] {
  return Object.fromEntries(study.responses.map((r) => [r.id, new Array(r.perCavity ? study.cavities : 1).fill(null)]))
}

/** The runs a draft would produce, with actual setpoints, checked against the press. */
export function previewDesign(study: Study, draft: DesignDraft, now = new Date()): DesignPreview {
  const factors = study.factors
  const k = factors.length
  if (k < 2) throw new Error('Add at least two factors')
  const built = buildDesign(baseDesignFor(draft, k), {
    centerPoints: draft.centerPoints,
    replicates: draft.replicates,
    blocking: draft.blocking,
    randomize: draft.randomize,
    seed: draft.seed,
    hardToChange: factors.flatMap((f, j) => (f.hardToChange ? [j] : [])),
  })
  const ts = now.toISOString()
  const runs: Run[] = built.runs.map((r) => ({
    id: newId(),
    order: r.order,
    std: r.std,
    coded: r.coded,
    kind: r.kind,
    block: r.block,
    wholePlot: r.wholePlot,
    settings: Object.fromEntries(factors.map((f, j) => [f.id, fromCoded(r.coded[j], f.low, f.high)])),
    results: emptyResults(study),
    status: 'pending',
    notes: '',
    updatedAt: ts,
  }))
  const violations = runs
    .map((r) => ({ order: r.order, items: checkMachineLimits(factors, r.settings, study.machine) }))
    .filter((v) => v.items.length > 0)
  const beyondRange = factors.filter((_, j) => built.runs.some((r) => Math.abs(r.coded[j]) > 1 + 1e-9)).map((f) => f.name)
  return { built, runs, violations, beyondRange }
}

/** Replaces the study's runs with a new design. Callers confirm first if existing runs have results. */
export function applyDesign(study: Study, draft: DesignDraft, preview: DesignPreview, now = new Date()): Study {
  return {
    ...study,
    design: { ...draft, factorIds: study.factors.map((f) => f.id), createdAt: now.toISOString() },
    runs: preview.runs,
  }
}

export function hasResults(study: Study): boolean {
  return study.runs.some((r) => r.status !== 'pending' || Object.values(r.results).some((v) => v.some((x) => x !== null)))
}

/** Whether factors were added, removed or reordered since the runs were generated. */
export function designIsStale(study: Study): boolean {
  if (!study.design) return false
  return study.factors.map((f) => f.id).join() !== study.design.factorIds.join()
}

/**
 * Keeps every run's result arrays in step with the responses and cavity count: adds arrays for
 * new responses, drops removed ones, and pads or trims per-cavity values. Existing values are kept.
 */
export function syncResults(study: Study): Study {
  const runs = study.runs.map((r) => {
    const results: Run['results'] = {}
    for (const resp of study.responses) {
      const size = resp.perCavity ? study.cavities : 1
      const old = r.results[resp.id] ?? []
      results[resp.id] = Array.from({ length: size }, (_, i) => old[i] ?? null)
    }
    return { ...r, results }
  })
  return { ...study, runs }
}
