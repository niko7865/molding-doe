import { GUIDE_STUDIES } from '../guide/info'
import type { GuideKey } from '../guide/studies'
import type { Study } from '../study/schema'
import { SETTINGS, type SettingCheck } from '../study/settings'
import { deltaToDisplay, unitLabel } from '../study/units'
import { formatValue } from './format'
import { rangeText } from './materialText'

export const studyTitle = (k: GuideKey) => GUIDE_STUDIES.find((g) => g.key === k)!.title

/** Fill-only studies run with hold off, which is worth saying next to the hold pressure field. */
export const SETTINGS_HINT: Partial<Record<GuideKey, string>> = {
  viscosity: 'Fill only: hold pressure should be off or as low as the press allows.',
  balance: 'Fill only: hold pressure should be off or as low as the press allows.',
}

export function settingCheckText(c: SettingCheck, study: Study): string {
  const label = SETTINGS.find((s) => s.key === c.setting)!.label.replace(', measured', '')
  const value = formatValue(c.value, 'temperature', study)
  if (c.kind === 'range') return `${studyTitle(c.study)}: ${label.toLowerCase()} ${value} is outside the datasheet ${c.material} temperature range (${rangeText(c.range, undefined, study)}).`
  const delta = Number(Math.abs(deltaToDisplay(c.delta, 'temperature', study.units)).toPrecision(3))
  return `${studyTitle(c.study)}: ${label.toLowerCase()} ${value} is ${delta} ${unitLabel('temperature', study.units)} ${c.delta > 0 ? 'higher' : 'lower'} than in the viscosity curve (${formatValue(c.reference, 'temperature', study)}). Later studies assume the earlier ones' conditions.`
}
