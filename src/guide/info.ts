import type { Study } from '../study/schema'
import { guideStatus, type GuideKey, type GuideStatus } from './studies'

export const GUIDE_STUDIES: { key: GuideKey; title: string; why: string; how: string }[] = [
  {
    key: 'viscosity',
    title: 'Viscosity curve',
    why: 'Finds the injection speeds where small speed changes no longer change how the melt flows, so fill is robust.',
    how: 'Fill to about 95% with hold off. Step injection speed from slow to fast; at each speed record fill time and peak injection pressure.',
  },
  {
    key: 'balance',
    title: 'Cavity balance',
    why: 'Shows whether every cavity fills alike. A large imbalance means the cavities need different processes, which no process setting fixes.',
    how: 'Make fill-only shots (no hold, short of full). Weigh each cavity’s part for several shots.',
  },
  {
    key: 'pressureDrop',
    title: 'Pressure drop',
    why: 'Checks that the press has pressure to spare. A pressure-limited process makes injection speed meaningless.',
    how: 'Record peak injection pressure when shooting to the end of each flow segment: air shot through the nozzle, then the runner, then past the gate, then the part at transfer.',
  },
  {
    key: 'gateSeal',
    title: 'Gate seal',
    why: 'Finds the hold time after which the gate is frozen and extra hold adds nothing but cycle time.',
    how: 'At your process, step hold time up from short to long. Weigh the part (or one cavity) at each hold time.',
  },
  {
    key: 'cooling',
    title: 'Cooling time',
    why: 'Finds the shortest cooling time that still gives a stable, in-spec part.',
    how: 'Step cooling time down from comfortably long. Measure a critical dimension or quality measure at each time.',
  },
  {
    key: 'window',
    title: 'Process window',
    why: 'Maps where hold pressure and melt temperature make good parts, so the process sits well inside a workable region with room to drift.',
    how: 'Run a grid of melt temperature and hold pressure settings and judge each: good, short, flash, sink or another defect.',
  },
]

export function maxPressure(study: Study): number | undefined {
  return study.machine?.maxInjectionPressure
}

export function statusOf(study: Study, key: GuideKey): GuideStatus {
  return guideStatus(study.guide, key, study.cavities, maxPressure(study))
}

