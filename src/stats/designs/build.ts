import { seededRandom, shuffle } from '../rng'
import { generatorWord } from './fractional'
import type { BaseDesign, PointKind } from './types'
import { definingRelation, wordLength, wordName, type Word } from './words'

export interface BlockingOption {
  /**
   * none: one block.
   * replicates: each replicate is its own block (e.g. one per shift).
   * confound: split a two-level design into 2 or 4 blocks by confounding high-order interactions.
   * axial: central composite only; the factorial and axial portions run as separate blocks.
   */
  kind: 'none' | 'replicates' | 'confound' | 'axial'
  /** For confound: 2 or 4. */
  blocks?: number
}

export interface BuildOptions {
  /** Center points added per block (Box–Behnken and CCD need at least one). */
  centerPoints: number
  /** Copies of the whole base design. */
  replicates: number
  blocking: BlockingOption
  randomize: boolean
  seed: number
  /** Indices of hard-to-change factors; runs are grouped so these change as rarely as possible. */
  hardToChange: number[]
}

export interface PlannedRun {
  /** Standard order, 1-based, before randomization. */
  std: number
  /** Run order, 1-based. */
  order: number
  coded: number[]
  kind: PointKind
  /** 1-based. */
  block: number
  /** 1-based. */
  replicate: number
  /** 1-based whole plot when there are hard-to-change factors. */
  wholePlot?: number
}

export interface BuiltDesign {
  base: BaseDesign
  options: BuildOptions
  runs: PlannedRun[]
  /** Effects confounded with blocks, e.g. ["ABC"]; empty when blocks are not built by confounding. */
  blockConfounding: string[]
  warnings: string[]
}

const isTwoLevel = (b: BaseDesign) => b.type === 'full-factorial' || b.type === 'fractional-factorial'

/**
 * Picks block words for a two-level design: each block word (and, for 4 blocks, their product)
 * must alias only with interactions of three or more factors, so main effects and two-factor
 * interactions stay clear of blocks. Longest words are preferred.
 */
export function chooseBlockWords(k: number, generators: string[], blocks: number): Word[] | null {
  const defining = definingRelation(generators.map(generatorWord))
  const minAliasLength = (w: Word) => Math.min(wordLength(w), ...defining.map((d) => wordLength(w ^ d)))
  const ok = (w: Word) => w !== 0 && !defining.includes(w) && minAliasLength(w) >= 3
  const candidates: Word[] = []
  for (let w = 1; w < 1 << k; w++) if (ok(w)) candidates.push(w)
  candidates.sort((a, b) => minAliasLength(b) - minAliasLength(a) || wordLength(b) - wordLength(a) || a - b)
  if (blocks === 2) return candidates.length ? [candidates[0]] : null
  if (blocks === 4) {
    for (let i = 0; i < candidates.length; i++)
      for (let j = i + 1; j < candidates.length; j++) if (ok(candidates[i] ^ candidates[j])) return [candidates[i], candidates[j]]
  }
  return null
}

function sign(coded: number[], w: Word): number {
  let v = 1
  for (let j = 0; j < coded.length; j++) if ((w >> j) & 1) v *= coded[j]
  return v
}

/**
 * Turns a base design into the run list people execute: replicates, center points, blocks,
 * hard-to-change grouping and a reproducible random order.
 */
export function buildDesign(base: BaseDesign, options: BuildOptions): BuiltDesign {
  const warnings: string[] = []
  const k = base.k
  const replicates = Math.max(1, Math.floor(options.replicates))
  const centers = Math.max(0, Math.floor(options.centerPoints))
  let blockConfounding: string[] = []

  // 1. Assign each base point a block within its replicate.
  let blockWords: Word[] = []
  let blocksPerReplicate = 1
  if (options.blocking.kind === 'confound') {
    const n = options.blocking.blocks ?? 2
    if (!isTwoLevel(base)) {
      warnings.push('Blocking by confounding needs a two-level factorial; using one block.')
    } else {
      const words = chooseBlockWords(k, base.generators ?? [], n)
      if (!words) {
        warnings.push(`This design is too small for ${n} blocks without confounding a main effect or two-factor interaction; using one block.`)
      } else {
        blockWords = words
        blocksPerReplicate = n
        blockConfounding = (n === 4 ? [words[0], words[1], words[0] ^ words[1]] : words).map(wordName)
      }
    }
  } else if (options.blocking.kind === 'axial') {
    if (base.type !== 'central-composite') warnings.push('Axial blocking applies only to central composite designs; using one block.')
    else blocksPerReplicate = 2
  } else if (options.blocking.kind === 'replicates' && replicates < 2) {
    warnings.push('Blocking by replicate needs at least two replicates; using one block.')
  }

  const blockWithin = (coded: number[], kind: PointKind): number => {
    if (blockWords.length) return blockWords.reduce((b, w, i) => b + (sign(coded, w) > 0 ? 1 << i : 0), 0)
    if (blocksPerReplicate === 2 && options.blocking.kind === 'axial') return kind === 'axial' ? 1 : 0
    return 0
  }

  const runs: Omit<PlannedRun, 'order' | 'wholePlot'>[] = []
  let std = 0
  for (let rep = 1; rep <= replicates; rep++) {
    const blockOf = (within: number) => {
      if (options.blocking.kind === 'replicates') return replicates >= 2 ? rep : 1
      return (rep - 1) * blocksPerReplicate + within + 1
    }
    for (const p of base.points) {
      runs.push({ std: ++std, coded: [...p.coded], kind: p.kind, block: blockOf(blockWithin(p.coded, p.kind)), replicate: rep })
    }
    // Centers go into every block of this replicate so block effects don't bias curvature.
    const blockIds = new Set(runs.filter((r) => r.replicate === rep).map((r) => r.block))
    for (const b of [...blockIds].sort((x, y) => x - y)) {
      for (let c = 0; c < centers; c++) runs.push({ std: ++std, coded: new Array(k).fill(0), kind: 'center', block: b, replicate: rep })
    }
  }
  if ((base.type === 'box-behnken' || base.type === 'central-composite') && centers === 0) {
    warnings.push('Response-surface designs need center points to estimate curvature and pure error; add at least 3.')
  }

  // 2. Order runs within each block: randomized, grouped by hard-to-change settings.
  const random = seededRandom(options.seed)
  const htc = options.hardToChange.filter((j) => j >= 0 && j < k)
  const ordered: PlannedRun[] = []
  let wholePlot = 0
  const blocks = [...new Set(runs.map((r) => r.block))].sort((a, b) => a - b)
  for (const b of blocks) {
    const inBlock = runs.filter((r) => r.block === b)
    if (htc.length === 0) {
      const seq = options.randomize ? shuffle(inBlock, random) : inBlock
      seq.forEach((r) => ordered.push({ ...r, order: 0 }))
      continue
    }
    // Group by the hard-to-change settings, then split each group into two whole plots when it is
    // large enough, so the whole-plot error has degrees of freedom (a proper split-plot).
    const groups = new Map<string, typeof inBlock>()
    for (const r of inBlock) {
      const key = htc.map((j) => r.coded[j]).join(',')
      groups.set(key, [...(groups.get(key) ?? []), r])
    }
    const subplot = [...Array(k).keys()].filter((j) => !htc.includes(j))
    const subplotWord = subplot.reduce((w, j) => w | (1 << j), 0)
    const plots: (typeof inBlock)[] = []
    for (const g of groups.values()) {
      if (g.length < 4 || subplot.length === 0) {
        plots.push(g)
        continue
      }
      // Two-level points split on the highest-order subplot interaction (confounding it with
      // whole plots); centers and other points alternate between the halves.
      const halves: [typeof g, typeof g] = [[], []]
      let alt = 0
      for (const r of g) {
        const twoLevel = subplot.every((j) => Math.abs(r.coded[j]) === 1)
        halves[twoLevel ? (sign(r.coded, subplotWord) > 0 ? 0 : 1) : alt++ % 2].push(r)
      }
      if (halves[0].length && halves[1].length) plots.push(...halves)
      else plots.push(g)
    }
    for (const plot of options.randomize ? shuffle(plots, random) : plots) {
      wholePlot++
      for (const r of options.randomize ? shuffle(plot, random) : plot) ordered.push({ ...r, order: 0, wholePlot })
    }
  }
  ordered.forEach((r, i) => (r.order = i + 1))
  if (htc.length) {
    warnings.push(
      'Runs are grouped by the hard-to-change factors, so this is a split-plot design. Their effects are tested against whole-plot variation, which has fewer degrees of freedom.',
    )
  }
  return { base, options, runs: ordered, blockConfounding, warnings }
}
