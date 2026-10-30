import { checkMaterial } from '../study/material'
import type { Material, Study } from '../study/schema'
import type { Workspace } from '../study/useWorkspace'
import { FIELDS, isTemperature, materialCheckText, type RangeKey } from './materialText'
import { NumberField } from './NumberField'

export function MaterialChecks({ study }: { study: Study }) {
  const checks = checkMaterial(study)
  if (!checks.length) return null
  return (
    <div className="banner info" role="status">
      <div>
        {checks.map((c, i) => (
          <p key={i}>{materialCheckText(c, study)}</p>
        ))}
      </div>
    </div>
  )
}

export function MaterialCard({ ws, study }: { ws: Workspace; study: Study }) {
  const m = study.material
  const set = (material: Material | undefined) => ws.update((s) => ({ ...s, material }))
  const setRange = (key: RangeKey, side: 'low' | 'high', v: number | undefined) => {
    if (!m) return
    const r = { ...m[key], [side]: v }
    set({ ...m, [key]: r.low === undefined && r.high === undefined ? undefined : r })
  }
  const text = (key: 'name' | 'supplier' | 'notes', v: string) => m && set({ ...m, [key]: key === 'name' || v ? v : undefined })

  return (
    <section className="card">
      <div className="row spread">
        <h2>Material</h2>
        {m ? (
          <button className="link danger" onClick={() => confirm('Remove the material data from this study?') && set(undefined)}>
            Remove material
          </button>
        ) : (
          <button className="btn" onClick={() => set({ name: '' })}>
            Add material data
          </button>
        )}
      </div>
      {m ? (
        <>
          <div className="grid">
            <label className="field">
              <span>Resin and grade</span>
              <input value={m.name} onChange={(e) => text('name', e.target.value)} placeholder="e.g. ABS, general purpose" />
            </label>
            <label className="field">
              <span>Supplier</span>
              <input value={m.supplier ?? ''} onChange={(e) => text('supplier', e.target.value)} />
            </label>
          </div>
          <div className="grid">
            {FIELDS.flatMap((f) => {
              const quantity = isTemperature(f) ? 'temperature' : 'none'
              if ('value' in f)
                return [
                  <NumberField
                    key={f.value}
                    label={f.label}
                    value={m[f.value]}
                    quantity={quantity}
                    unit={f.unit}
                    units={study.units}
                    min={isTemperature(f) ? undefined : 0}
                    onChange={(v) => set({ ...m, [f.value]: v })}
                  />,
                ]
              const [lowLabel, highLabel] = f.range === 'dryTime' ? ['min', 'max'] : ['low', 'high']
              return (['low', 'high'] as const).map((side) => (
                <NumberField
                  key={f.range + side}
                  label={`${f.label}, ${side === 'low' ? lowLabel : highLabel}`}
                  value={m[f.range]?.[side]}
                  quantity={quantity}
                  unit={f.unit}
                  units={study.units}
                  min={isTemperature(f) ? undefined : 0}
                  onChange={(v) => setRange(f.range, side, v)}
                />
              ))
            })}
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea
              rows={2}
              value={m.notes ?? ''}
              onChange={(e) => text('notes', e.target.value)}
              placeholder="e.g. dry in a desiccant dryer, dew point -40 °F; melt flow at 220 °C / 10 kg"
            />
          </label>
          <p className="muted small">
            Copy these from the resin datasheet and leave anything it doesn't give blank. The DOE factors and the process window study are
            checked against the melt and mold temperature ranges.
          </p>
          <MaterialChecks study={study} />
        </>
      ) : (
        <p className="muted">No material set. Add the datasheet's processing values to keep them with the study and the report.</p>
      )}
    </section>
  )
}
