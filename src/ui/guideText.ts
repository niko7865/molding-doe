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
      const r = viscosityCurve(g!.viscosity!, maxPressure(study))
      const how = r.basis === 'fit' ? `, fitted curve, R² ${r.fit!.r2.toFixed(3)}` : ''
      const stepDesc = r.basis === 'fit' ? `under ${g!.viscosity!.threshold ?? DEFAULT_FLAT_THRESHOLD}% per +50% speed` : `steps under ${g!.viscosity!.threshold ?? DEFAULT_FLAT_THRESHOLD}%`
      return r.flatFrom !== null ? `Viscosity levels off from ${formatValue(r.flatFrom, 'speed', study)} (${stepDesc}${how}).` : 'Viscosity had not leveled off at the speeds tested.'
    }
    case 'balance': {
      const r = cavityBalance(g!.balance!, study.cavities)
      const allowable = g!.balance!.allowable ?? DEFAULT_ALLOWABLE_IMBALANCE
      const verdict = balanceVerdict(r.imbalance!, allowable)
      const note =
        verdict === 'good'
          ? `within the allowable ${allowable}%`
          : verdict === 'watch'
            ? `workable — over ${allowable}%, analyze cavities separately`
            : `poor — over ${2 * allowable}%, fix balance first`
      return `Cavity imbalance ${r.imbalance!.toFixed(1)}% (${note}).`
    }
    case 'pressureDrop': {
      const r = pressureDrop(g!.pressureDrop!, maxPressure(study))
      if (r.usage === null) return 'Press maximum not entered.'
      const suffix = r.verdict === 'limited' ? ': pressure-limited' : r.verdict === 'tight' ? ': tight headroom' : ''
      return `Fill uses ${(r.usage * 100).toFixed(0)}% of the press maximum${suffix}.`
    }
    case 'gateSeal': {
      const r = gateSeal(g!.gateSeal!)
      const how = r.basis === 'fit' ? ` (fitted freeze-off curve, R² ${r.fit!.r2.toFixed(3)})` : ''
      if (r.sealTime !== null) return `Gate seals at about ${fmt(r.sealTime)} s${how}; suggested hold time ${fmt(r.suggested!)} s.`
      return r.predicted !== null ? `Gate had not sealed at the hold times tested; the fitted curve predicts about ${fmt(r.predicted)} s.` : 'Gate had not sealed at the hold times tested.'
    }
    case 'cooling': {
      const r = coolingTime(g!.cooling!)
      const how = r.source === 'fit' ? ` (fitted curve, R² ${r.fit!.r2.toFixed(3)})` : ''
      if (r.shortest !== null) {
        return r.unbracketed
          ? `Every tested cooling time from ${fmt(r.shortest)} s was already in spec${how}; test shorter times or check stability.`
          : `Shortest acceptable cooling time about ${fmt(r.shortest)} s${how}.`
      }
      return r.predicted !== null ? `No acceptable cooling time in the range tested; the fitted curve predicts about ${fmt(r.predicted)} s.` : 'No acceptable cooling time found in the range tested.'
    }
    case 'window': {
      const r = processWindow(g!.window!)
      return r.temp && r.hold
        ? `Good parts from ${formatValue(r.temp[0], 'temperature', study)} to ${formatValue(r.temp[1], 'temperature', study)} ${g!.window!.temperature} temperature and ${pressureText(r.hold[0], study)} to ${pressureText(r.hold[1], study)} hold pressure.`
        : 'Not enough good settings to define a window.'
    }
  }
}
