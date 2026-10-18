import { buildDesign, fromCoded, toCoded, type AlphaKind, type BaseDesign, type DesignPoint } from '../stats'
import { decode } from './analysis'
import { baseDesignFor, designIsStale, emptyResults, type DesignDraft } from './design'
import { checkMachineLimits, type LimitViolation } from './presets'
import { newId, type DesignSpec, type Factor, type Run, type Study } from './schema'

/**
 * Sequential growth: add a stage of runs to a design that has already been run, keeping the
 * earlier results. Each stage goes in its own block, so a shift between stages (another day,
 * another material lot) is absorbed by the block term instead of biasing the effects.
 */

export type GrowthKind = 'foldover' | 'axial' | 'region'
type Stage = NonNullable<DesignSpec['stages']>[number]

export interface GrowthChoice {
  kind: GrowthKind
  label: string
  purpose: string
  available: boolean
  /** Why it isn't available, or a caution when it is. */
  note?: string
}

export interface GrowthOptions {
  kind: GrowthKind
  centerPoints: number
  randomize: boolean
  seed: number
  /** Axial points: rotatable (α = n_F^¼) or face-centered (α = 1). */
  alpha?: AlphaKind
  /** New region: the design to run there. */
  draft?: DesignDraft
  /** New region: new half-range as a fraction of the current one. */
  shrink?: number
}

export interface GrowthPreview {
  study: Study
  added: Run[]
  /** New region: earlier runs still inside the new ranges (reused) and outside them (kept, not analyzed). */
  reused: number
  archived: number
  violations: { order: number; items: LimitViolation[] }[]
  warnings: string[]
}

const active = (study: Study) => study.runs.filter((r) => !r.archived)

export function stagesOf(study: Study): Stage[] {
  const d = study.design
  if (!d) return []
  return d.stages ?? [{ kind: 'initial', block: 1, runs: study.runs.length, createdAt: d.createdAt }]
}

function hasFinishedRuns(study: Study) {
  return study.runs.some((r) => r.status === 'done')
}

export function growthChoices(study: Study): GrowthChoice[] {
  const d = study.design
  if (!d) return []
  const stages = stagesOf(study)
  const k = d.factorIds.length
  const stale = designIsStale(study)
  const blocked = stale ? 'Factors changed since the runs were made, so the design can’t be extended.' : !hasFinishedRuns(study) ? 'Finish some runs first.' : undefined
  const folded = stages.some((s) => s.kind === 'foldover')
  const hasAxial = d.type === 'central-composite' || d.type === 'box-behnken'
  const lowRes = d.type === 'fractional-factorial' && (d.generators ?? []).some((g) => g.split('=')[1]?.length <= 3) && !folded
  return [
    {
      kind: 'foldover',
      label: 'Fold over',
      purpose: 'Repeat the fraction with every sign flipped. Main effects come clear of two-factor interactions.',
      available: !blocked && (d.type === 'fractional-factorial' || d.type === 'plackett-burman') && !folded,
      note: blocked ?? (folded ? 'Already folded over.' : d.type === 'fractional-factorial' || d.type === 'plackett-burman' ? undefined : 'Only for fractional factorial and Plackett–Burman designs.'),
    },
    {
      kind: 'axial',
      label: 'Add axial points',
      purpose: 'Turn the factorial into a central composite design, so the model can capture curvature.',
      available: !blocked && (d.type === 'full-factorial' || d.type === 'fractional-factorial') && k >= 2 && k <= 6,
      note:
        blocked ??
        (hasAxial
          ? 'The design already has curvature points.'
          : d.type === 'plackett-burman'
            ? 'Fold over a Plackett–Burman design, or start a response surface design, instead.'
            : lowRes
              ? 'The fraction aliases two-factor interactions with each other; fold it over first so the quadratic model can be estimated.'
              : undefined),
    },
    {
      kind: 'region',
      label: 'Move to a new region',
      purpose: 'Center a new, narrower design on the optimum found so far. Earlier runs inside the new ranges are reused.',
      available: !blocked && !!study.analysis?.optimum,
      note: blocked ?? (study.analysis?.optimum ? undefined : 'Find the best settings on the Analyze tab first, then choose “Confirm these settings”.'),
    },
  ]
}

function designFactors(study: Study): Factor[] {
  return study.design!.factorIds.map((id) => study.factors.find((f) => f.id === id)!)
}

/** Runs for one stage, numbered after the existing runs and placed in a new block. */
function stageRuns(study: Study, base: BaseDesign, opts: GrowthOptions, now: Date): Run[] {
  const factors = designFactors(study)
  const built = buildDesign(base, {
    centerPoints: opts.centerPoints,
    replicates: 1,
    blocking: { kind: 'none' },
    randomize: opts.randomize,
    seed: opts.seed,
    hardToChange: factors.flatMap((f, j) => (f.hardToChange ? [j] : [])),
  })
  const max = (pick: (r: Run) => number | undefined) => Math.max(0, ...study.runs.map((r) => pick(r) ?? 0))
  const order = max((r) => r.order)
  const std = max((r) => r.std)
  const plot = max((r) => r.wholePlot)
  const block = Math.max(1, ...study.runs.map((r) => r.block ?? 1)) + 1
  const stage = stagesOf(study).length + 1
  return built.runs.map((r) => ({
    id: newId(),
    order: order + r.order,
    std: std + r.std,
    coded: r.coded,
    kind: r.kind,
    block,
    stage,
    wholePlot: r.wholePlot === undefined ? undefined : plot + r.wholePlot,
    settings: Object.fromEntries(factors.map((f, j) => [f.id, fromCoded(r.coded[j], f.low, f.high)])),
    results: emptyResults(study),
    status: 'pending',
    notes: '',
    updatedAt: now.toISOString(),
  }))
}

function withStage(study: Study, kind: GrowthKind, added: Run[], spec: Partial<DesignSpec>, now: Date, note?: string): Study {
  const stages = stagesOf(study)
  const stage: Stage = { kind, block: added[0]?.block ?? 1, runs: added.length, createdAt: now.toISOString(), note }
  return {
    ...study,
    design: { ...study.design!, ...spec, stages: [...stages, stage] },
    runs: [...study.runs.map((r) => (r.stage ? r : { ...r, stage: 1 })), ...added],
  }
}

function violationsOf(study: Study, runs: Run[]) {
  return runs.map((r) => ({ order: r.order, items: checkMachineLimits(study.factors, r.settings, study.machine) })).filter((v) => v.items.length > 0)
}

/** Distinct factorial corners among the runs being analyzed. */
function factorialCount(study: Study): number {
  return new Set(active(study).flatMap((r) => (r.kind === 'factorial' && r.coded ? [r.coded.join()] : []))).size
}

/** "Nice" bounds: rounded to two significant digits of the half-range. */
function roundRange(center: number, half: number): [number, number] {
  // Round the center and half-width to a step that reads well on the press, keeping the range symmetric.
  const step = 10 ** Math.floor(Math.log10(half)) / 2
  const r = (v: number) => Number((Math.round(v / step) * step).toPrecision(12))
  const c = r(center)
  const h = Math.max(step, r(half))
  return [Number((c - h).toPrecision(12)), Number((c + h).toPrecision(12))]
}

export function previewGrowth(study: Study, opts: GrowthOptions, now = new Date()): GrowthPreview {
  const d = study.design
  if (!d) throw new Error('Create runs on the Design tab first.')
  const k = d.factorIds.length
  const warnings: string[] = []

  if (opts.kind === 'foldover') {
    const base = baseDesignFor(d, k)
    const points: DesignPoint[] = base.points.map((p) => ({ coded: p.coded.map((v) => -v || 0), kind: p.kind }))
    const added = stageRuns(study, { ...base, points }, opts, now)
    const next = withStage(study, 'foldover', added, {}, now)
    return { study: next, added, reused: 0, archived: 0, violations: violationsOf(study, added), warnings }
  }

  if (opts.kind === 'axial') {
    const alphaKind = opts.alpha ?? 'rotatable'
    const nF = factorialCount(study)
    const alpha = alphaKind === 'face-centered' ? 1 : Math.pow(nF, 0.25)
    const points: DesignPoint[] = []
    for (let j = 0; j < k; j++)
      for (const s of [-1, 1]) {
        const coded = new Array(k).fill(0)
        coded[j] = s * alpha
        points.push({ coded, kind: 'axial' })
      }
    const added = stageRuns(study, { type: 'central-composite', k, points, alpha }, opts, now)
    if (opts.centerPoints < 1) warnings.push('Add at least one center point to the axial stage, so the two blocks can be tied together.')
    if (alpha > 1) warnings.push(`Axial points sit at ±${alpha.toFixed(3)} in coded units, beyond the low and high levels. Check the press and part can run there, or use face-centered.`)
    const next = withStage(study, 'axial', added, { type: 'central-composite', alpha: alphaKind }, now, `α = ${alpha.toFixed(3)}`)
    return { study: next, added, reused: 0, archived: 0, violations: violationsOf(study, added), warnings }
  }

  // New region around the optimum.
  const optimum = study.analysis?.optimum
  if (!optimum) throw new Error('Find the best settings on the Analyze tab first.')
  if (!opts.draft) throw new Error('Choose a design for the new region.')
  const shrink = opts.shrink ?? 0.5
  const center = decode(study, optimum)
  const factors = study.factors.map((f) => {
    if (!(f.id in center)) return f
    const [low, high] = roundRange(center[f.id], ((f.high - f.low) / 2) * shrink)
    return { ...f, low, high }
  })
  const recoded: Study = {
    ...study,
    factors,
    runs: study.runs.map((r) => ({ ...r, coded: d.factorIds.map((id) => toCoded(r.settings[id], factors.find((f) => f.id === id)!.low, factors.find((f) => f.id === id)!.high)) })),
  }
  const regionBase = baseDesignFor(opts.draft, k)
  const reach = Math.max(1, ...regionBase.points.flatMap((p) => p.coded.map(Math.abs)))
  const rotatable = opts.draft.type === 'central-composite' && opts.draft.alpha !== 'face-centered'
  const covered = (c: number[]) => (rotatable ? Math.hypot(...c) <= reach + 1e-9 : c.every((v) => Math.abs(v) <= reach + 1e-9))
  let reused = 0
  let archived = 0
  const kept = recoded.runs.map((r) => {
    if (r.archived) return r
    if (covered(r.coded!)) {
      if (r.status === 'done') reused++
      return r
    }
    archived++
    return { ...r, archived: true }
  })
  const base: Study = { ...recoded, runs: kept }
  const added = stageRuns(base, regionBase, opts, now)
  const next = withStage(base, 'region', added, { ...opts.draft, factorIds: d.factorIds }, now, `${Math.round(shrink * 100)}% of the previous ranges`)
  // The optimum and confirmation belong to the old coding; goals and model choices carry over.
  next.analysis = study.analysis ? { series: study.analysis.series } : undefined
  if (archived) warnings.push(`${archived} earlier run${archived === 1 ? ' falls' : 's fall'} outside the new ranges. ${archived === 1 ? 'It stays' : 'They stay'} in the study and the report but ${archived === 1 ? 'is' : 'are'} left out of the analysis.`)
  return { study: next, added, reused, archived, violations: violationsOf(next, added), warnings }
}
