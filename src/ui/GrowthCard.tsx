import { useMemo, useState } from 'react'
import { newSeed } from '../stats'
import { decode } from '../study/analysis'
import { defaultDraft, designChoices, describeDesign, type DesignDraft } from '../study/design'
import { growthChoices, previewGrowth, stagesOf, type GrowthKind } from '../study/growth'
import type { Study } from '../study/schema'
import type { Workspace } from '../study/useWorkspace'
import { formatValue } from './format'
import { NumberField } from './NumberField'

const STAGE_LABEL = { initial: 'Initial design', foldover: 'Fold-over', axial: 'Axial points', region: 'New region' } as const

/** Response-surface designs suit a new region around an optimum; screening designs don't. */
function regionChoices(k: number) {
  return designChoices(k).filter((c) => c.draft.type === 'full-factorial' || c.draft.type === 'box-behnken' || c.draft.type === 'central-composite')
}

export function GrowthCard({ study, ws }: { study: Study; ws: Workspace }) {
  const choices = growthChoices(study)
  const k = study.design?.factorIds.length ?? 0
  const [kind, setKind] = useState<GrowthKind | null>(() => choices.find((c) => c.available)?.kind ?? null)
  const [centerPoints, setCenterPoints] = useState(2)
  const [alpha, setAlpha] = useState<'rotatable' | 'face-centered'>('rotatable')
  const [regionKey, setRegionKey] = useState(() => regionChoices(k).find((c) => c.key === 'ccd-f')?.key ?? regionChoices(k)[0]?.key)
  const [shrink, setShrink] = useState(0.5)
  const [seed, setSeed] = useState(newSeed)
  const choice = choices.find((c) => c.kind === kind)
  const draft: DesignDraft | undefined = useMemo(() => {
    const c = regionChoices(k).find((x) => x.key === regionKey)
    return c ? { ...defaultDraft(k), ...c.draft, centerPoints, seed } : undefined
  }, [k, regionKey, centerPoints, seed])

  const preview = useMemo(() => {
    if (!kind || !choice?.available) return null
    try {
      return { ok: previewGrowth(study, { kind, centerPoints, randomize: true, seed, alpha, draft, shrink }) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [study, kind, choice?.available, centerPoints, seed, alpha, draft, shrink])

  const stages = stagesOf(study)
  if (!study.design || !study.runs.some((r) => r.status === 'done')) return null
  const optimum = study.analysis?.optimum ? decode(study, study.analysis.optimum) : null
  const factors = study.design.factorIds.map((id) => study.factors.find((f) => f.id === id)!)

  return (
    <section className="card">
      <h2>Grow the design</h2>
      <p className="muted small">
        Add a stage of runs and keep every result so far. Each stage runs in its own block, so a shift between days or material lots doesn’t bias the effects. Now: {describeDesign(study)}.
        {stages.length > 1 ? ` Stages so far: ${stages.map((s) => STAGE_LABEL[s.kind]).join(', ')}.` : ''}
      </p>
      <fieldset className="choices">
        <legend className="sr-only">How to grow the design</legend>
        {choices.map((c) => (
          <label key={c.kind} className={c.kind === kind ? 'choice active' : 'choice'} aria-disabled={!c.available}>
            <input type="radio" name="growth" disabled={!c.available} checked={c.kind === kind} onChange={() => setKind(c.kind)} />
            <span>
              <strong>{c.label}</strong>
              <br />
              <span className="muted small">{c.purpose}</span>
              {c.note && (
                <>
                  <br />
                  <span className="small">{c.note}</span>
                </>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {choice?.available && (
        <>
          <div className="grid">
            <NumberField label="Center points in this stage" value={centerPoints} quantity="none" units="metric" min={0} integer onChange={(v) => v !== undefined && v >= 0 && setCenterPoints(Math.round(v))} />
            {kind === 'axial' && (
              <label className="field">
                <span>Axial distance</span>
                <select value={alpha} onChange={(e) => setAlpha(e.target.value as typeof alpha)}>
                  <option value="rotatable">Rotatable (beyond low/high)</option>
                  <option value="face-centered">Face-centered (at low/high)</option>
                </select>
              </label>
            )}
            {kind === 'region' && (
              <>
                <label className="field">
                  <span>Design for the new region</span>
                  <select value={regionKey} onChange={(e) => setRegionKey(e.target.value)}>
                    {regionChoices(k).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>New ranges</span>
                  <select value={shrink} onChange={(e) => setShrink(Number(e.target.value))}>
                    <option value={0.75}>75% of the current ranges</option>
                    <option value={0.5}>Half the current ranges</option>
                    <option value={0.33}>A third of the current ranges</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="row">
            <span className="muted small">Runs in random order, seed {seed}</span>
            <button className="link" onClick={() => setSeed(newSeed())}>
              New random order
            </button>
          </div>
        </>
      )}

      {preview?.error && <p className="warn">{preview.error}</p>}
      {preview?.ok && (
        <div className="preview">
          <p>
            <strong>{preview.ok.added.length} new runs</strong>, numbered {preview.ok.added[0]?.order} to {preview.ok.added.at(-1)?.order}, in block {preview.ok.added[0]?.block}.
            {kind === 'region' && ` ${preview.ok.reused} finished run${preview.ok.reused === 1 ? ' is' : 's are'} reused.`}
          </p>
          {kind === 'region' && optimum && (
            <ul className="small">
              {factors.map((f) => {
                const nf = preview.ok.study.factors.find((x) => x.id === f.id)!
                return (
                  <li key={f.id}>
                    {f.name}: {formatValue(f.low, f.quantity, study)}–{formatValue(f.high, f.quantity, study)} → {formatValue(nf.low, f.quantity, study)}–{formatValue(nf.high, f.quantity, study)}, centered on {formatValue((nf.low + nf.high) / 2, f.quantity, study)}
                  </li>
                )
              })}
            </ul>
          )}
          {preview.ok.warnings.map((w) => (
            <p key={w} className="small">
              {w}
            </p>
          ))}
          {preview.ok.violations.length > 0 && <p className="warn small">{preview.ok.violations.length} new run{preview.ok.violations.length === 1 ? ' exceeds' : 's exceed'} the press limits.</p>}
          {kind === 'region' && <p className="muted small">The optimum and confirmation runs belong to the old ranges, so they are cleared. Response goals carry over.</p>}
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                const next = preview.ok.study
                ws.update(() => next)
              }}
            >
              Add {preview.ok.added.length} runs
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
