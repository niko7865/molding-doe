import { useState } from 'react'
import type { GuideKey } from '../guide/studies'
import { newId, type CustomSetting, type Study } from '../study/schema'
import { checkSettings, copiedSettings, previousWithSettings, SETTINGS, settingsCount, settingsTable, variedSettings, type SettingKey } from '../study/settings'
import { unitLabel } from '../study/units'
import { formatValue } from './format'
import { NumberField } from './NumberField'
import { SETTINGS_HINT, settingCheckText, studyTitle } from './settingsText'

export interface SettingsPatch {
  settings?: Record<string, number>
  customSettings?: CustomSetting[]
}

/** Warnings for recorded settings against the datasheet and the viscosity curve; `only` limits them to one study. */
export function SettingChecks({ study, only }: { study: Study; only?: GuideKey }) {
  const checks = checkSettings(study).filter((c) => !only || c.study === only)
  if (!checks.length) return null
  return (
    <div className="banner info" role="status">
      <div>
        {checks.map((c, i) => (
          <p key={i}>{settingCheckText(c, study)}</p>
        ))}
      </div>
    </div>
  )
}

/** Temperatures and pressures the press ran at during one molding study. */
export function ProcessSettings({ study, k, onChange }: { study: Study; k: GuideKey; onChange: (p: SettingsPatch) => void }) {
  const g = study.guide?.[k]
  const values = g?.settings ?? {}
  const custom = g?.customSettings ?? []
  const varied = variedSettings(study, k)
  const { filled, total } = settingsCount(study, k)
  const previous = previousWithSettings(study, k)
  // Open while empty, folded to its summary line once something is recorded; the key on the caller resets it per study.
  const [open, setOpen] = useState(filled === 0)

  const setValue = (key: SettingKey, v: number | undefined) => {
    const next = { ...values }
    if (v === undefined) delete next[key]
    else next[key] = v
    onChange({ settings: Object.keys(next).length ? next : undefined })
  }
  const setCustom = (list: CustomSetting[]) => onChange({ customSettings: list.length ? list : undefined })
  const patchCustom = (id: string, p: Partial<CustomSetting>) => setCustom(custom.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const copy = () => {
    if (!previous) return
    if (filled > 0 && !confirm(`Replace the settings here with those from the ${studyTitle(previous).toLowerCase()}?`)) return
    onChange(copiedSettings(study, previous, k))
  }

  return (
    <details className="settings-box" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <strong>Process settings</strong>
        <span className="muted small">
          {' '}
          {filled} of {total} recorded
        </span>
      </summary>
      <p className="muted small">
        What the press ran at during this study. Temperatures are set points unless noted; pressures as the press shows them. Leave anything you didn't
        note blank.
        {SETTINGS_HINT[k] ? ` ${SETTINGS_HINT[k]}` : ''}
      </p>
      <div className="grid">
        {SETTINGS.map((s) =>
          varied.includes(s.key) ? (
            <div key={s.key} className="field">
              <span>
                {s.label}
                <span className="unit"> ({unitLabel(s.quantity, study.units)})</span>
              </span>
              <p className="muted varied">Varied in this study</p>
            </div>
          ) : (
            <NumberField key={s.key} label={s.label} value={values[s.key]} quantity={s.quantity} units={study.units} min={s.quantity === 'pressure' ? 0 : undefined} onChange={(v) => setValue(s.key, v)} />
          ),
        )}
      </div>
      {custom.map((c) => (
        <div key={c.id} className="row custom-setting">
          <label className="field">
            <span>Setting</span>
            <input value={c.name} onChange={(e) => patchCustom(c.id, { name: e.target.value })} placeholder="e.g. Hot runner drop 1" />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={c.quantity} onChange={(e) => patchCustom(c.id, { quantity: e.target.value as CustomSetting['quantity'], value: undefined })}>
              <option value="temperature">Temperature</option>
              <option value="pressure">Pressure</option>
            </select>
          </label>
          <NumberField label="Value" value={c.value} quantity={c.quantity} units={study.units} onChange={(v) => patchCustom(c.id, { value: v })} />
          <button className="link danger" onClick={() => setCustom(custom.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name || 'setting'}`}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={() => setCustom([...custom, { id: newId(), name: '', quantity: 'temperature' }])}>
          Add a setting
        </button>
        {previous && (
          <button className="btn" onClick={copy}>
            Copy from {studyTitle(previous).toLowerCase()}
          </button>
        )}
      </div>
      <SettingChecks study={study} only={k} />
    </details>
  )
}

/** All studies' settings side by side, for the report. */
export function SettingsReport({ study }: { study: Study }) {
  const t = settingsTable(study)
  if (!t.rows.length) return null
  return (
    <>
      <div className="table-wrap">
        <table>
          <caption>Process settings</caption>
          <thead>
            <tr>
              <th>Setting</th>
              {t.studies.map((k) => (
                <th key={k}>{studyTitle(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={i} className={v === 'varied' ? 'num muted' : 'num'}>
                    {v === 'varied' ? 'varied' : v === undefined ? '' : formatValue(v, r.quantity, study)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SettingChecks study={study} />
    </>
  )
}
