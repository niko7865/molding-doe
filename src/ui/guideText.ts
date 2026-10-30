import { balanceVerdict, coolingTime, cavityBalance, DEFAULT_ALLOWABLE_IMBALANCE, DEFAULT_FLAT_THRESHOLD, gateSeal, pressureDrop, processWindow, viscosityCurve, type GuideKey } from '../guide/studies'
import { maxPressure } from '../guide/info'
import type { Study } from '../study/schema'
import { fmt } from './chartUtils'
import { formatValue } from './format'

const pressureText = (v: number, study: Study) => formatValue(v, 'pressure', study)

/** One line per study for the report. */
export function guideSummary(study: Study, key: GuideKey): string {
  const g = study.guide
  switch (key) {
    case 'viscosity': {
      const r = viscosityCurve(g!.viscosity!)
      return r.flatFrom !== null ? `Viscosity levels off from ${formatValue(r.flatFrom, 'speed', study)} (steps under ${g!.viscosity!.threshold ?? DEFAULT_FLAT_THRESHOLD}%).` : 'Viscosity had not leveled off at the speeds tested.'
    }
    case 'balance': {
      const r = cavityBalance(g!.balance!, study.cavities)
      const allowable = g!.balance!.allowable ?? DEFAULT_ALLOWABLE_IMBALANCE
      const within = balanceVerdict(r.imbalance!, allowable) === 'good'
      return `Cavity imbalance ${r.imbalance!.toFixed(1)}% (${within ? 'within' : 'over'} the allowable ${allowable}%).`
    }
    case 'pressureDrop': {
      const r = pressureDrop(g!.pressureDrop!, maxPressure(study))
      return r.usage === null ? 'Press maximum not entered.' : `Fill uses ${(r.usage * 100).toFixed(0)}% of the press maximum${r.verdict === 'limited' ? ': pressure-limited' : ''}.`
    }
    case 'gateSeal': {
      const r = gateSeal(g!.gateSeal!)
      return r.sealTime !== null ? `Gate seals at about ${fmt(r.sealTime)} s; suggested hold time ${fmt(r.suggested!)} s.` : 'Gate had not sealed at the hold times tested.'
    }
    case 'cooling': {
      const r = coolingTime(g!.cooling!)
      return r.shortest !== null ? `Shortest acceptable cooling time about ${fmt(r.shortest)} s.` : 'No acceptable cooling time found in the range tested.'
    }
    case 'window': {
      const r = processWindow(g!.window!)
      return r.temp && r.hold
        ? `Good parts from ${formatValue(r.temp[0], 'temperature', study)} to ${formatValue(r.temp[1], 'temperature', study)} ${g!.window!.temperature} temperature and ${pressureText(r.hold[0], study)} to ${pressureText(r.hold[1], study)} hold pressure.`
        : 'Not enough good settings to define a window.'
    }
  }
}
