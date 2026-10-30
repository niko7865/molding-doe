import type { GuideKey } from '../guide/studies'
import { outsideRange, type Range, type TemperatureKind } from './material'
import { newId, type CustomSetting, type Guide, type Study } from './schema'

/** The six studies in the order they are run (matches GUIDE_STUDIES). */
export const GUIDE_ORDER: GuideKey[] = ['viscosity', 'balance', 'pressureDrop', 'gateSeal', 'cooling', 'window']

export type SettingKey = 'melt' | 'nozzle' | 'barrelFront' | 'barrelRear' | 'moldMoving' | 'moldFixed' | 'injectionLimit' | 'hold' | 'back'

/** The standard process settings recorded with each study, in entry and report order. */
export const SETTINGS: { key: SettingKey; label: string; quantity: 'temperature' | 'pressure' }[] = [
  // Measured on an air shot with a probe; the barrel set points are recorded separately.
  { key: 'melt', label: 'Melt temperature, measured', quantity: 'temperature' },
  { key: 'nozzle', label: 'Nozzle', quantity: 'temperature' },
  { key: 'barrelFront', label: 'Barrel front zone', quantity: 'temperature' },
  { key: 'barrelRear', label: 'Barrel rear zone', quantity: 'temperature' },
  { key: 'moldMoving', label: 'Mold, moving half', quantity: 'temperature' },
  { key: 'moldFixed', label: 'Mold, stationary half', quantity: 'temperature' },
  { key: 'injectionLimit', label: 'Injection pressure limit', quantity: 'pressure' },
  { key: 'hold', label: 'Hold pressure', quantity: 'pressure' },
  { key: 'back', label: 'Back pressure', quantity: 'pressure' },
]

/** Which datasheet range each setting is checked against. Barrel and nozzle set points sit off the melt range on purpose. */
const CHECKED: Partial<Record<SettingKey, TemperatureKind>> = { melt: 'melt', moldMoving: 'mold', moldFixed: 'mold' }

/** A later study whose melt or mold temperature is further than this from the viscosity curve's gets a note (°C; 20 °F). */
export const DRIFT_LIMIT = (20 * 5) / 9

type GuideEntry = NonNullable<Guide[GuideKey]>

/** Settings a study varies on purpose, so a single value would be wrong. */
export function variedSettings(study: Study, key: GuideKey): SettingKey[] {
  if (key !== 'window') return []
  const t = study.guide?.window?.temperature ?? 'melt'
  return ['hold', ...(t === 'melt' ? (['melt'] as const) : (['moldMoving', 'moldFixed'] as const))]
}

/** Number of settings filled in, out of those that can be (standard ones not varied, plus custom ones). */
export function settingsCount(study: Study, key: GuideKey): { filled: number; total: number } {
  const g = study.guide?.[key]
  const varied = variedSettings(study, key)
  const standard = SETTINGS.filter((s) => !varied.includes(s.key))
  const custom = g?.customSettings ?? []
  return {
    filled: standard.filter((s) => g?.settings?.[s.key] !== undefined).length + custom.filter((c) => c.value !== undefined).length,
    total: standard.length + custom.length,
  }
}

const hasSettings = (g: GuideEntry | undefined) => !!g && (Object.keys(g.settings ?? {}).length > 0 || (g.customSettings ?? []).some((c) => c.value !== undefined))

/** The nearest earlier study that has settings recorded, to copy from. */
export function previousWithSettings(study: Study, key: GuideKey): GuideKey | undefined {
  const before = GUIDE_ORDER.slice(0, GUIDE_ORDER.indexOf(key)).reverse()
  return before.find((k) => hasSettings(study.guide?.[k]))
}

/** `from`'s settings as they should land on `to`: varied ones left out, custom ones given new ids. */
export function copiedSettings(study: Study, from: GuideKey, to: GuideKey): { settings?: Record<string, number>; customSettings?: CustomSetting[] } {
  const src = study.guide?.[from]
  const varied = new Set<string>(variedSettings(study, to))
  const settings = Object.fromEntries(Object.entries(src?.settings ?? {}).filter(([k]) => !varied.has(k)))
  const custom = (src?.customSettings ?? []).map((c) => ({ ...c, id: newId() }))
  return { settings: Object.keys(settings).length ? settings : undefined, customSettings: custom.length ? custom : undefined }
}

export type SettingCheck =
  | { kind: 'range'; study: GuideKey; setting: SettingKey; value: number; material: TemperatureKind; range: Range }
  /** `delta`: this study's value minus the viscosity curve's, °C. */
  | { kind: 'drift'; study: GuideKey; setting: SettingKey; value: number; reference: number; delta: number }

const recorded = (study: Study, key: GuideKey) => {
  const g = study.guide?.[key]
  return g && !g.skipped ? g : undefined
}

/** Melt and mold temperatures outside the datasheet ranges, and later studies that drifted from the viscosity curve's. */
export function checkSettings(study: Study): SettingCheck[] {
  const out: SettingCheck[] = []
  const reference = recorded(study, 'viscosity')?.settings ?? {}
  for (const key of GUIDE_ORDER) {
    const values = recorded(study, key)?.settings
    if (!values) continue
    const varied = variedSettings(study, key)
    for (const [setting, material] of Object.entries(CHECKED) as [SettingKey, TemperatureKind][]) {
      const value = values[setting]
      if (value === undefined || varied.includes(setting)) continue
      const range = study.material?.[material]
      if (outsideRange(value, value, range)) out.push({ kind: 'range', study: key, setting, value, material, range: range! })
      const ref = reference[setting]
      if (key !== 'viscosity' && ref !== undefined && Math.abs(value - ref) > DRIFT_LIMIT + 1e-6)
        out.push({ kind: 'drift', study: key, setting, value, reference: ref, delta: value - ref })
    }
  }
  return out
}

/** One row per setting recorded anywhere, one column per study that isn't skipped. `'varied'` marks a setting the study varies. */
export interface SettingsTable {
  studies: GuideKey[]
  rows: { label: string; quantity: 'temperature' | 'pressure'; values: (number | 'varied' | undefined)[] }[]
}

export function settingsTable(study: Study): SettingsTable {
  const studies = GUIDE_ORDER.filter((k) => hasSettings(recorded(study, k)))
  const rows: SettingsTable['rows'] = []
  for (const s of SETTINGS) {
    const values = studies.map((k) => (variedSettings(study, k).includes(s.key) ? 'varied' : study.guide![k]!.settings?.[s.key]))
    if (values.some((v) => typeof v === 'number')) rows.push({ label: s.label, quantity: s.quantity, values })
  }
  // Custom settings line up across studies by name and type.
  const seen = new Set<string>()
  for (const k of studies) {
    for (const c of study.guide![k]!.customSettings ?? []) {
      const name = c.name.trim() || 'Unnamed setting'
      const id = `${c.quantity}:${name.toLowerCase()}`
      if (seen.has(id)) continue
      seen.add(id)
      const values = studies.map((k2) => study.guide![k2]!.customSettings?.find((x) => x.quantity === c.quantity && (x.name.trim() || 'Unnamed setting').toLowerCase() === name.toLowerCase())?.value)
      if (values.some((v) => v !== undefined)) rows.push({ label: name, quantity: c.quantity, values })
    }
  }
  return { studies, rows }
}
