import { useMemo, useState } from 'react'
import { aliasStructure, definingRelationNames } from '../stats'
import { applyDesign, choiceKey, defaultDraft, designChoices, designIsStale, hasResults, previewDesign, syncResults, type DesignDraft } from '../study/design'
import { FACTOR_PRESETS, factorFromPreset } from '../study/presets'
import { newId, type Factor, type Response, type Study } from '../study/schema'
import { unitLabel, type Quantity } from '../study/units'
import type { Workspace } from '../study/useWorkspace'
import { formatValue } from './format'
import { NumberField } from './NumberField'

const QUANTITIES: { value: Quantity; label: string }[] = [
  { value: 'temperature', label: 'Temperature' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'speed', label: 'Speed' },
  { value: 'time', label: 'Time' },
  { value: 'volume', label: 'Volume' },
  { value: 'force', label: 'Force' },
  { value: 'rotation', label: 'Screw speed' },
  { value: 'mass', label: 'Mass' },
  { value: 'length', label: 'Length' },
  { value: 'none', label: 'No unit' },
]

const LETTERS = 'ABCDEFGHJKLMNOP'

function FactorsCard({ study, ws }: { study: Study; ws: Workspace }) {
  const [preset, setPreset] = useState('')
  const used = new Set(study.factors.map((f) => f.preset))
  const setFactors = (factors: Factor[]) => ws.update((s) => ({ ...s, factors }))
  const patch = (id: string, p: Partial<Factor>) => setFactors(study.factors.map((f) => (f.id === id ? { ...f, ...p } : f)))

  return (
    <section className="card">
      <h2>Factors</h2>
      <p className="muted small">The settings you will change. Low and high are the levels coded −1 and +1.</p>
      {study.factors.length === 0 && <p className="muted">No factors yet. Add the settings you want to study.</p>}
      {study.factors.map((f, j) => (
        <div key={f.id} className="factor-row">
          <span className="letter" aria-hidden>
            {LETTERS[j]}
          </span>
          <label className="field grow">
            <span>Name</span>
            <input value={f.name} onChange={(e) => patch(f.id, { name: e.target.value })} />
          </label>
          {!f.preset && (
            <label className="field">
              <span>Unit</span>
              <select value={f.quantity} onChange={(e) => patch(f.id, { quantity: e.target.value as Quantity })}>
                {QUANTITIES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <NumberField label="Low" value={f.low} quantity={f.quantity} units={study.units} onChange={(v) => v !== undefined && patch(f.id, { low: v })} />
          <NumberField label="High" value={f.high} quantity={f.quantity} units={study.units} onChange={(v) => v !== undefined && patch(f.id, { high: v })} />
          <label className="check">
            <input type="checkbox" checked={f.hardToChange} onChange={(e) => patch(f.id, { hardToChange: e.target.checked })} />
            Hard to change
          </label>
          <button className="link danger" onClick={() => setFactors(study.factors.filter((x) => x.id !== f.id))}>
            Remove
          </button>
          {f.low >= f.high && <p className="warn small full">Low must be below high.</p>}
        </div>
      ))}
      <div className="row">
        <label className="field">
          <span>Add a factor</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Choose…</option>
            {FACTOR_PRESETS.filter((p) => !used.has(p.key)).map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
            <option value="custom">Custom factor</option>
          </select>
        </label>
        <button
          className="btn"
          disabled={!preset}
          onClick={() => {
            const f: Factor =
              preset === 'custom'
                ? { id: newId(), name: `Factor ${LETTERS[study.factors.length]}`, quantity: 'none', low: 0, high: 1, hardToChange: false }
                : factorFromPreset(preset)
            setFactors([...study.factors, f])
            setPreset('')
          }}
        >
          Add
        </button>
      </div>
      <p className="muted small">Mark a factor hard to change (mold temperature, usually) to keep its runs together. The analysis then treats it as a split-plot factor.</p>
    </section>
  )
}

function ResponsesCard({ study, ws }: { study: Study; ws: Workspace }) {
  const setResponses = (responses: Response[]) => ws.update((s) => syncResults({ ...s, responses }))
  const patch = (id: string, p: Partial<Response>) => setResponses(study.responses.map((r) => (r.id === id ? { ...r, ...p } : r)))
  return (
    <section className="card">
      <h2>Responses</h2>
      <p className="muted small">What you will measure on each run. Per-cavity responses are analyzed as the cavity mean and the spread across cavities.</p>
      {study.responses.map((r) => (
        <div key={r.id} className="factor-row">
          <label className="field grow">
            <span>Name</span>
            <input value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} />
          </label>
          <label className="field">
            <span>Kind</span>
            <select
              value={r.kind}
              onChange={(e) => {
                const kind = e.target.value as Response['kind']
                patch(r.id, { kind, quantity: kind === 'continuous' ? r.quantity : 'none', shots: kind === 'passfail' ? (r.shots ?? 10) : undefined })
              }}
            >
              <option value="continuous">Measurement</option>
              <option value="rating">Defect rating 1–5</option>
              <option value="passfail">Defective count</option>
            </select>
          </label>
          {r.kind === 'continuous' && (
            <label className="field">
              <span>Unit</span>
              <select value={r.quantity} onChange={(e) => patch(r.id, { quantity: e.target.value as Quantity })}>
                {QUANTITIES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                    {q.value !== 'none' ? ` (${unitLabel(q.value, study.units)})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {r.kind === 'passfail' && (
            <NumberField label="Shots inspected" value={r.shots} quantity="none" units="metric" min={1} integer onChange={(v) => v && v >= 1 && patch(r.id, { shots: Math.round(v) })} />
          )}
          <label className="check">
            <input type="checkbox" checked={r.perCavity} disabled={study.cavities === 1} onChange={(e) => patch(r.id, { perCavity: e.target.checked })} />
            Per cavity
          </label>
          <button className="link danger" onClick={() => setResponses(study.responses.filter((x) => x.id !== r.id))}>
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button
          className="btn"
          onClick={() =>
            setResponses([...study.responses, { id: newId(), name: study.responses.length ? 'New response' : 'Part weight', kind: 'continuous', quantity: study.responses.length ? 'length' : 'mass', perCavity: study.cavities > 1 }])
          }
        >
          Add response
        </button>
      </div>
    </section>
  )
}

function DesignCard({ study, ws }: { study: Study; ws: Workspace }) {
  const k = study.factors.length
  const choices = useMemo(() => designChoices(k), [k])
  const [draft, setDraft] = useState<DesignDraft>(() => (study.design && study.design.factorIds.length === k ? study.design : defaultDraft(k)))
  const [draftK, setDraftK] = useState(k)
  if (draftK !== k) {
    setDraftK(k)
    setDraft((d) => (choiceKey(d, k) ? d : { ...defaultDraft(k), centerPoints: d.centerPoints, replicates: d.replicates, randomize: d.randomize, seed: d.seed }))
  }
  const set = (p: Partial<DesignDraft>) => setDraft((d) => ({ ...d, ...p }))

  const invalid = study.factors.find((f) => f.low >= f.high)
  let preview: ReturnType<typeof previewDesign> | null = null
  let error: string | null = null
  if (k < 2) error = 'Add at least two factors.'
  else if (invalid) error = `Fix the range of ${invalid.name}: low must be below high.`
  else if (!choiceKey(draft, k)) error = 'Pick a design.'
  else {
    try {
      preview = previewDesign(study, draft)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  const twoLevel = draft.type === 'full-factorial' || draft.type === 'fractional-factorial'
  const blockingKinds: { value: DesignDraft['blocking']['kind']; label: string }[] = [
    { value: 'none', label: 'No blocks' },
    { value: 'replicates', label: 'One block per replicate' },
    ...(twoLevel ? [{ value: 'confound' as const, label: 'Split into blocks' }] : []),
    ...(draft.type === 'central-composite' ? [{ value: 'axial' as const, label: 'Factorial and axial runs in separate blocks' }] : []),
  ]

  const create = () => {
    if (!preview) return
    if (hasResults(study) && !confirm('This replaces the current runs, including results already entered. Save a copy of the study file first if you need them. Continue?')) return
    const p = preview
    ws.update((s) => applyDesign(s, draft, p))
  }

  return (
    <section className="card">
      <h2>Design</h2>
      {k >= 2 && (
        <fieldset className="choices">
          <legend className="sr-only">Design type</legend>
          {choices.map((c) => (
            <label key={c.key} className={choiceKey(draft, k) === c.key ? 'choice active' : 'choice'}>
              <input type="radio" name="design" checked={choiceKey(draft, k) === c.key} onChange={() => set({ ...c.draft, generators: c.draft.generators, pbRuns: c.draft.pbRuns, alpha: c.draft.alpha, blocking: { kind: 'none' } })} />
              <span>
                <strong>{c.label}</strong> · {c.runs} runs
                <br />
                <span className="muted small">{c.purpose}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="grid">
        <NumberField label="Center points per block" value={draft.centerPoints} quantity="none" units="metric" min={0} integer onChange={(v) => v !== undefined && v >= 0 && set({ centerPoints: Math.round(v) })} />
        <NumberField label="Replicates" value={draft.replicates} quantity="none" units="metric" min={1} integer onChange={(v) => v !== undefined && v >= 1 && set({ replicates: Math.round(v) })} />
        <label className="field">
          <span>Blocks</span>
          <select value={draft.blocking.kind} onChange={(e) => set({ blocking: { kind: e.target.value as DesignDraft['blocking']['kind'], blocks: e.target.value === 'confound' ? 2 : undefined } })}>
            {blockingKinds.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        {draft.blocking.kind === 'confound' && (
          <label className="field">
            <span>Number of blocks</span>
            <select value={draft.blocking.blocks ?? 2} onChange={(e) => set({ blocking: { kind: 'confound', blocks: Number(e.target.value) } })}>
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </label>
        )}
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={draft.randomize} onChange={(e) => set({ randomize: e.target.checked })} />
          Randomize run order
        </label>
        {draft.randomize && (
          <>
            <span className="muted small">Seed {draft.seed}</span>
            <button className="link" onClick={() => set({ seed: Math.floor(Math.random() * 2 ** 31) })}>
              New random order
            </button>
          </>
        )}
      </div>

      {error && <p className="warn">{error}</p>}
      {preview && (
        <div className="preview">
          <p>
            <strong>{preview.runs.length} runs</strong>
            {new Set(preview.runs.map((r) => r.block)).size > 1 && ` in ${new Set(preview.runs.map((r) => r.block)).size} blocks`}
            {preview.runs.some((r) => r.wholePlot) && `, ${new Set(preview.runs.map((r) => r.wholePlot)).size} whole plots`}
            {preview.built.blockConfounding.length > 0 && <span className="muted"> · blocks confounded with {preview.built.blockConfounding.join(', ')}</span>}
          </p>
          {preview.built.warnings.map((w) => (
            <p key={w} className="warn small">
              {w}
            </p>
          ))}
          {preview.beyondRange.length > 0 && (
            <p className="warn small">
              Axial runs go beyond the low/high levels of {preview.beyondRange.join(', ')}. Check those settings are safe, or choose the face-centered design.
            </p>
          )}
          {preview.violations.length > 0 && (
            <div className="warn small">
              <p>
                {preview.violations.length} run{preview.violations.length === 1 ? '' : 's'} exceed the press limits:
              </p>
              <ul>
                {preview.violations.slice(0, 5).map((v) => (
                  <li key={v.order}>
                    Run {v.order}:{' '}
                    {v.items.map((i) => `${i.factorName} ${formatValue(i.value, study.factors.find((f) => f.id === i.factorId)!.quantity, study)} (limit ${formatValue(i.limit, study.factors.find((f) => f.id === i.factorId)!.quantity, study)})`).join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draft.type === 'fractional-factorial' && draft.generators && (
            <details>
              <summary>Alias structure</summary>
              <p className="small">
                Generators {draft.generators.join(', ')} · defining relation I = {definingRelationNames(draft.generators).join(' = ')}
              </p>
              <ul className="small mono">
                {aliasStructure(k, draft.generators).map((r) => (
                  <li key={r.effect}>
                    {r.effect}
                    {r.aliases.length ? ` = ${r.aliases.join(' = ')}` : ''}
                  </li>
                ))}
              </ul>
              <p className="muted small">Letters follow the factor order above. Interactions of four or more factors are not shown.</p>
            </details>
          )}
          <div className="row">
            <button className="btn primary" onClick={create}>
              {study.runs.length ? 'Replace runs with this design' : 'Create runs'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export function DesignPanel({ ws, study }: { ws: Workspace; study: Study }) {
  return (
    <>
      {designIsStale(study) && (
        <div className="banner info" role="status">
          <div>Factors changed after the runs were created. Create the runs again so the design matches.</div>
        </div>
      )}
      <FactorsCard study={study} ws={ws} />
      <ResponsesCard study={study} ws={ws} />
      <DesignCard key={study.id} study={study} ws={ws} />
    </>
  )
}
