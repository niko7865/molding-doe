import { z } from 'zod'

export const SCHEMA_VERSION = 1

const quantity = z.enum([
  'temperature',
  'pressure',
  'speed',
  'time',
  'volume',
  'force',
  'rotation',
  'mass',
  'length',
  'none',
])

/** Press capability. Every limit is optional; missing ones are simply not checked. All in metric. */
export const machineProfileSchema = z.object({
  name: z.string(),
  /** Maximum plastic (not hydraulic) injection pressure, bar. */
  maxInjectionPressure: z.number().positive().optional(),
  /** Maximum injection speed, mm/s. */
  maxInjectionSpeed: z.number().positive().optional(),
  /** Maximum shot volume, cm³. */
  maxShotVolume: z.number().positive().optional(),
  /** Clamp force, kN. */
  clampForce: z.number().positive().optional(),
  /** Maximum screw speed, rpm. */
  maxScrewRpm: z.number().positive().optional(),
})

export const factorSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Key into FACTOR_PRESETS when the factor came from the library. */
  preset: z.string().optional(),
  quantity,
  /** Low and high levels, stored in metric. */
  low: z.number(),
  high: z.number(),
  /** Slow to stabilize (e.g. mold temperature); runs are grouped by it. */
  hardToChange: z.boolean(),
})

export const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * continuous: a measurement (weight, dimension, cycle time).
   * rating: a 1–5 defect severity.
   * passfail: the number of defective shots out of `shots`.
   */
  kind: z.enum(['continuous', 'rating', 'passfail']),
  quantity,
  /** Shots inspected per run, for passfail responses. */
  shots: z.number().int().positive().optional(),
  /** Measured once per cavity, or once per shot (e.g. cycle time). */
  perCavity: z.boolean(),
})

export const runSchema = z.object({
  id: z.string(),
  /** Position in the randomized run order, starting at 1. */
  order: z.number().int().positive(),
  /** Factor id → setpoint, metric. */
  settings: z.record(z.string(), z.number()),
  /** Response id → one value per cavity (or a single value when not per cavity); null = not yet measured. */
  results: z.record(z.string(), z.array(z.number().nullable())),
  status: z.enum(['pending', 'done', 'aborted']),
  abortReason: z.string().optional(),
  notes: z.string(),
  /** ISO timestamp of the last change to this run. */
  updatedAt: z.string(),
})

export const studySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  units: z.enum(['metric', 'imperial']),
  /** Number of cavities in the mold. */
  cavities: z.number().int().positive(),
  machine: machineProfileSchema.nullable(),
  factors: z.array(factorSchema),
  responses: z.array(responseSchema),
  runs: z.array(runSchema),
})

export type MachineProfile = z.infer<typeof machineProfileSchema>
export type Factor = z.infer<typeof factorSchema>
export type Response = z.infer<typeof responseSchema>
export type Run = z.infer<typeof runSchema>
export type Study = z.infer<typeof studySchema>

export function newId(): string {
  return crypto.randomUUID()
}

export function createStudy(name: string, now = new Date()): Study {
  const ts = now.toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    goal: '',
    createdAt: ts,
    updatedAt: ts,
    units: 'metric',
    cavities: 1,
    machine: null,
    factors: [],
    responses: [],
    runs: [],
  }
}
