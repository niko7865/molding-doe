export type DesignType = 'full-factorial' | 'fractional-factorial' | 'plackett-burman' | 'box-behnken' | 'central-composite'

/** Where a point sits in the design; analysis and blocking treat these differently. */
export type PointKind = 'factorial' | 'center' | 'axial' | 'edge'

export interface DesignPoint {
  /** Coded levels, one per factor: -1/+1 at the low/high levels, 0 at the center. */
  coded: number[]
  kind: PointKind
}

/** The base design before center points, replicates, blocks and run order are applied. */
export interface BaseDesign {
  type: DesignType
  k: number
  points: DesignPoint[]
  /** Fractional factorials: generators such as "E=ABCD". */
  generators?: string[]
  /** Two-level designs: the resolution (Infinity for a full factorial). */
  resolution?: number
  /** Central composite: distance of the axial points from the center, in coded units. */
  alpha?: number
}
