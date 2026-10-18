import { useState } from 'react'
import type { Response, Run, Study } from '../study/schema'
import { unitLabel } from '../study/units'
import type { Workspace } from '../study/useWorkspace'
import { formatValue } from './format'
import { NumberField } from './NumberField'

const STATUS_LABEL: Record<Run['status'], string> = { pending: 'To do', done: 'Done', aborted: 'Aborted' }

function byOrder(study: Study): Run[] {
  return [...study.runs].sort((a, b) => a.order - b.order)
}

function updateRun(ws: Workspace, id: string, patch: Partial<Run>) {
  const updatedAt = new Date().toISOString()
  ws.update((s) => ({ ...s, runs: s.runs.map((r) => (r.id === id ? { ...r, ...patch, updatedAt } : r)) }))
}

function missingValues(run: Run, study: Study): number {
  return study.responses.reduce((n, resp) => n + (run.results[resp.id] ?? []).filter((v) => v === null).length, 0)
}

function RunSheet({ study, onOpen }: { study: Study; onOpen: (id: string) => void }) {
  const runs = byOrder(study)
  const blocks = new Set(runs.map((r) => r.block)).size > 1
  const plots = runs.some((r) => r.wholePlot)
  const done = runs.filter((r) => r.status === 'done').length
  const [printed] = useState(() => new Date().toLocaleDateString())
  return (
    <section className="card sheet">
      <div className="row spread">
        <h2>Run sheet</h2>
        <div className="row no-print">
          <span className="muted">
            {done} of {runs.length} done
          </span>
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      <p className="print-only">
        {study.name}
        {study.machine?.name ? ` · ${study.machine.name}` : ''} · printed {printed}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              {blocks && <th>Block</th>}
              {plots && <th>Whole plot</th>}
              {study.factors.map((f) => (
                <th key={f.id}>
                  {f.name}
                  {unitLabel(f.quantity, study.units) && <span className="unit"> ({unitLabel(f.quantity, study.units)})</span>}
                  {f.hardToChange && <span className="tag">HTC</span>}
                </th>
              ))}
              <th className="no-print">Status</th>
              <th className="print-only">Results</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className={r.status}>
                <td>
                  <button className="link no-print" onClick={() => onOpen(r.id)}>
                    {r.order}
                  </button>
                  <span className="print-only">{r.order}</span>
                </td>
                {blocks && <td>{r.block}</td>}
                {plots && <td>{r.wholePlot}</td>}
                {study.factors.map((f) => (
                  <td key={f.id} className="num">
                    {r.settings[f.id] === undefined ? '–' : formatValue(r.settings[f.id], f.quantity, study, false)}
                  </td>
                ))}
                <td className="no-print">{STATUS_LABEL[r.status]}</td>
                <td className="print-only write-in" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ResponseInputs({ study, run, resp, ws }: { study: Study; run: Run; resp: Response; ws: Workspace }) {
  const values = run.results[resp.id] ?? []
  const set = (i: number, v: number | undefined) => {
    const next = [...values]
    next[i] = v === undefined ? null : v
    updateRun(ws, run.id, { results: { ...run.results, [resp.id]: next } })
  }
  const label = (i: number) => (values.length > 1 ? `Cavity ${i + 1}` : resp.name)
  return (
    <fieldset className="response">
      <legend>
        {resp.name}
        {resp.kind === 'rating' && <span className="muted small"> · 1 (none) to 5 (severe)</span>}
        {resp.kind === 'passfail' && <span className="muted small"> · defective shots out of {resp.shots}</span>}
      </legend>
      <div className="grid">
        {values.map((v, i) =>
          resp.kind === 'rating' ? (
            <div key={i} className="field">
              <span>{label(i)}</span>
              <div className="segmented">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={v === n ? 'active' : ''} aria-pressed={v === n} onClick={() => set(i, v === n ? undefined : n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <NumberField
              key={i}
              label={label(i)}
              value={v ?? undefined}
              quantity={resp.kind === 'continuous' ? resp.quantity : 'none'}
              units={study.units}
              min={0}
              integer={resp.kind === 'passfail'}
              onChange={(x) => set(i, resp.kind === 'passfail' && x !== undefined ? Math.min(resp.shots ?? Infinity, Math.max(0, Math.round(x))) : x)}
            />
          ),
        )}
      </div>
    </fieldset>
  )
}

function RunMode({ study, ws, runId, onSelect, onClose }: { study: Study; ws: Workspace; runId: string; onSelect: (id: string) => void; onClose: () => void }) {
  const runs = byOrder(study)
  const idx = Math.max(0, runs.findIndex((r) => r.id === runId))
  const run = runs[idx]
  const prev = idx > 0 ? runs[idx - 1] : null
  const [shots, setShots] = useState<Record<string, number>>({})
  const shotCount = shots[run.id] ?? 0
  const missing = missingValues(run, study)
  const goTo = (i: number) => runs[i] && onSelect(runs[i].id)

  const finish = () => {
    if (missing > 0 && !confirm(`${missing} value${missing === 1 ? ' is' : 's are'} still blank. Mark this run done anyway?`)) return
    updateRun(ws, run.id, { status: 'done' })
    const next = runs.slice(idx + 1).find((r) => r.status === 'pending') ?? runs.find((r) => r.status === 'pending' && r.id !== run.id)
    if (next) onSelect(next.id)
  }

  return (
    <section className="card runmode">
      <div className="row spread">
        <div>
          <h2>
            Run {run.order} <span className="muted">of {runs.length}</span>
          </h2>
          <span className="muted small">
            {run.block && new Set(runs.map((r) => r.block)).size > 1 ? `Block ${run.block} · ` : ''}
            {run.wholePlot ? `Whole plot ${run.wholePlot} · ` : ''}
            {run.kind === 'center' ? 'Center point · ' : run.kind === 'axial' ? 'Axial point · ' : ''}
            {STATUS_LABEL[run.status]}
          </span>
        </div>
        <button className="btn" onClick={onClose}>
          Run sheet
        </button>
      </div>

      <div className="setpoints">
        {study.factors.map((f) => {
          const value = run.settings[f.id]
          const before = prev?.settings[f.id]
          const changed = before !== undefined && Math.abs(before - value) > 1e-9
          return (
            <div key={f.id} className={changed ? 'setpoint changed' : 'setpoint'}>
              <span className="small">
                {f.name}
                {f.hardToChange && <span className="tag">HTC</span>}
              </span>
              <strong>{formatValue(value, f.quantity, study)}</strong>
              <span className="small muted">{prev ? (changed ? `was ${formatValue(before!, f.quantity, study)}` : 'no change') : 'first run'}</span>
            </div>
          )
        })}
      </div>

      <div className="row">
        <span>
          Shots since setting change: <strong>{shotCount}</strong>
        </span>
        <button className="btn" onClick={() => setShots((s) => ({ ...s, [run.id]: shotCount + 1 }))}>
          +1 shot
        </button>
        <button className="link" onClick={() => setShots((s) => ({ ...s, [run.id]: 0 }))}>
          Reset
        </button>
        <span className="muted small">Let the process stabilize before collecting parts, especially after a hard-to-change factor moves.</span>
      </div>

      {study.responses.length === 0 && <p className="muted">No responses defined. Add them on the Design tab.</p>}
      {study.responses.map((resp) => (
        <ResponseInputs key={resp.id} study={study} run={run} resp={resp} ws={ws} />
      ))}

      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={run.notes} onChange={(e) => updateRun(ws, run.id, { notes: e.target.value })} placeholder="Anything unusual: alarms, short shots on startup, material lot change…" />
      </label>

      {run.status === 'aborted' && <p className="warn">Aborted: {run.abortReason || 'no reason given'}</p>}

      <div className="row spread">
        <div className="row">
          <button className="btn" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
            ← Previous
          </button>
          <button className="btn" disabled={idx === runs.length - 1} onClick={() => goTo(idx + 1)}>
            Next →
          </button>
        </div>
        <div className="row">
          {run.status !== 'pending' ? (
            <button className="btn" onClick={() => updateRun(ws, run.id, { status: 'pending', abortReason: undefined })}>
              Reopen run
            </button>
          ) : (
            <button
              className="btn danger"
              onClick={() => {
                const reason = prompt('Why was this run aborted?')
                if (reason !== null) updateRun(ws, run.id, { status: 'aborted', abortReason: reason })
              }}
            >
              Abort run
            </button>
          )}
          {run.status !== 'done' && (
            <button className="btn primary" onClick={finish}>
              Done, next run
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export function RunPanel({ ws, study }: { ws: Workspace; study: Study }) {
  const [openRun, setOpenRun] = useState<string | null>(null)
  if (study.runs.length === 0) {
    return (
      <section className="card">
        <h2>Run</h2>
        <p className="muted">No runs yet. Create them on the Design tab.</p>
      </section>
    )
  }
  const firstPending = byOrder(study).find((r) => r.status === 'pending')
  if (openRun && study.runs.some((r) => r.id === openRun)) {
    return <RunMode study={study} ws={ws} runId={openRun} onSelect={setOpenRun} onClose={() => setOpenRun(null)} />
  }
  return (
    <>
      <section className="card no-print">
        <div className="row spread">
          <p>{firstPending ? `Next up: run ${firstPending.order}.` : 'All runs are finished. Save the study file and analyze.'}</p>
          {firstPending && (
            <button className="btn primary" onClick={() => setOpenRun(firstPending.id)}>
              Start run mode
            </button>
          )}
        </div>
        <p className="muted small">On a tablet at the press, run mode shows one run per screen. When you are done, save the study file and merge it into the engineer's copy from the Study tab.</p>
      </section>
      <RunSheet study={study} onOpen={setOpenRun} />
    </>
  )
}
