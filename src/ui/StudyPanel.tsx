import { useRef, useState, type ReactNode } from 'react'
import { syncResults } from '../study/design'
import { FILE_EXTENSION } from '../study/file'
import type { Conflict } from '../study/merge'
import type { MachineProfile, Study } from '../study/schema'
import { toDisplay, unitLabel, type Quantity } from '../study/units'
import type { Workspace } from '../study/useWorkspace'
import { NumberField } from './NumberField'

const ACCEPT = `${FILE_EXTENSION},.json,application/json`

function FilePicker({ label, onFile, primary }: { label: string; onFile: (f: File) => void; primary?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className={primary ? 'btn primary' : 'btn'} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </>
  )
}

function Banner({ kind, children, onClose }: { kind: 'error' | 'info'; children: ReactNode; onClose: () => void }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      <button className="link" onClick={onClose} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}

function StartScreen({ ws }: { ws: Workspace }) {
  const [name, setName] = useState('')
  return (
    <>
      <section className="card">
        <h2>Start a study</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) ws.create(name.trim())
          }}
        >
          <label className="field grow">
            <span>Study name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Housing 4471 hold pressure window" />
          </label>
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            New study
          </button>
        </form>
        <div className="row">
          <FilePicker label="Open study file…" onFile={ws.openFile} />
        </div>
      </section>

      <section className="card">
        <h2>In this browser</h2>
        {!ws.persistent && <p className="muted">This browser isn't keeping working copies, so save your study to a file before closing the tab.</p>}
        {ws.recent.length === 0 ? (
          <p className="muted">No studies yet. Studies you create or open are kept here automatically.</p>
        ) : (
          <ul className="list">
            {ws.recent.map((s) => (
              <li key={s.id}>
                <button className="link" onClick={() => ws.openRecent(s.id)}>
                  {s.name}
                </button>
                <span className="muted">
                  {s.runs} runs · edited {new Date(s.updatedAt).toLocaleString()}
                </span>
                <button
                  className="link danger"
                  onClick={() => {
                    if (confirm(`Remove "${s.name}" from this browser? Saved study files are not affected.`)) ws.removeRecent(s.id)
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

const MACHINE_FIELDS: { key: keyof Omit<MachineProfile, 'name'>; label: string; quantity: Quantity }[] = [
  { key: 'maxInjectionPressure', label: 'Max plastic pressure', quantity: 'pressure' },
  { key: 'maxInjectionSpeed', label: 'Max injection speed', quantity: 'speed' },
  { key: 'maxShotVolume', label: 'Max shot volume', quantity: 'volume' },
  { key: 'clampForce', label: 'Clamp force', quantity: 'force' },
  { key: 'maxScrewRpm', label: 'Max screw speed', quantity: 'rotation' },
]

function conflictLabel(c: Conflict, study: Study): string {
  const run = `Run ${c.runOrder}`
  if (c.field === 'result') {
    const response = study.responses.find((r) => r.id === c.responseId)?.name ?? c.responseId
    const cavity = study.cavities > 1 ? `, cavity ${c.cavity + 1}` : ''
    return `${run}, ${response}${cavity}`
  }
  return `${run}, ${c.field}`
}

function conflictValue(c: Conflict, side: 'mine' | 'theirs', study: Study): string {
  const v = c[side]
  if (c.field !== 'result' || typeof v !== 'number') return String(v) || '(empty)'
  const q = study.responses.find((r) => r.id === c.responseId)?.quantity ?? 'none'
  const unit = unitLabel(q, study.units)
  return `${Number(toDisplay(v, q, study.units).toPrecision(6))}${unit ? ' ' + unit : ''}`
}

function StudyEditor({ ws, study }: { ws: Workspace; study: Study }) {
  const set = (patch: Partial<Study>) => ws.update((s) => ({ ...s, ...patch }))
  const machine = study.machine

  return (
    <>
      <section className="card">
        <div className="row spread">
          <h2>Study</h2>
          <div className="row">
            <button className="btn primary" onClick={ws.saveFile}>
              Save study file
            </button>
            <FilePicker label="Merge results from file…" onFile={ws.mergeFile} />
            <button className="btn" onClick={ws.close}>
              Close
            </button>
          </div>
        </div>
        <label className="field">
          <span>Name</span>
          <input value={study.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Goal</span>
          <textarea
            rows={2}
            value={study.goal}
            onChange={(e) => set({ goal: e.target.value })}
            placeholder="What decision will this study support? e.g. find a hold pressure and time that hold the 12.40 mm bore without flash."
          />
        </label>
        <div className="grid">
          <NumberField
            label="Cavities in the mold"
            value={study.cavities}
            quantity="none"
            units="metric"
            min={1}
            integer
            onChange={(v) => v !== undefined && v >= 1 && Number.isInteger(v) && ws.update((s) => syncResults({ ...s, cavities: v }))}
          />
          <fieldset className="field">
            <legend>Units</legend>
            <div className="segmented">
              {(['metric', 'imperial'] as const).map((u) => (
                <button key={u} className={study.units === u ? 'active' : ''} aria-pressed={study.units === u} onClick={() => set({ units: u })}>
                  {u === 'metric' ? 'Metric' : 'Imperial'}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <p className="muted small">Values are stored in metric, so switching units only changes how they are shown.</p>
      </section>

      <section className="card">
        <div className="row spread">
          <h2>Press</h2>
          {machine ? (
            <button className="link danger" onClick={() => set({ machine: null })}>
              Remove press
            </button>
          ) : (
            <button className="btn" onClick={() => set({ machine: { name: '' } })}>
              Add press limits
            </button>
          )}
        </div>
        {machine ? (
          <>
            <label className="field">
              <span>Press name</span>
              <input value={machine.name} onChange={(e) => set({ machine: { ...machine, name: e.target.value } })} placeholder="e.g. Press 7 (Engel 200 t)" />
            </label>
            <div className="grid">
              {MACHINE_FIELDS.map((f) => (
                <NumberField
                  key={f.key}
                  label={f.label}
                  value={machine[f.key]}
                  quantity={f.quantity}
                  units={study.units}
                  min={0}
                  onChange={(v) => set({ machine: { ...machine, [f.key]: v !== undefined && v > 0 ? v : undefined } })}
                />
              ))}
            </div>
            <p className="muted small">Leave a limit blank to skip it. The design builder warns when a run asks for more than the press can do.</p>
          </>
        ) : (
          <p className="muted">No press set. Add one so designs are checked against its limits.</p>
        )}
      </section>

      {ws.mergeReport && (
        <section className="card">
          <div className="row spread">
            <h2>Merged {ws.mergeReport.fileName}</h2>
            {ws.mergeReport.conflicts.length === 0 && (
              <button className="link" onClick={ws.dismissMergeReport}>
                Done
              </button>
            )}
          </div>
          <p>
            {ws.mergeReport.filled} value{ws.mergeReport.filled === 1 ? '' : 's'} copied in.{' '}
            {ws.mergeReport.conflicts.length > 0
              ? `${ws.mergeReport.conflicts.length} differ between the two copies. Pick which to keep:`
              : 'Nothing conflicted.'}
          </p>
          {ws.mergeReport.conflicts.length > 0 && (
            <ul className="list">
              {ws.mergeReport.conflicts.map((c, i) => (
                <li key={i}>
                  <span className="grow">{conflictLabel(c, study)}</span>
                  <button className="btn" onClick={() => ws.resolve(c, 'mine')}>
                    Keep mine: {conflictValue(c, 'mine', study)}
                  </button>
                  <button className="btn" onClick={() => ws.resolve(c, 'theirs')}>
                    Use file: {conflictValue(c, 'theirs', study)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

export function StudyPanel({ ws }: { ws: Workspace }) {
  return (
    <>
      {ws.error && (
        <Banner kind="error" onClose={ws.dismissError}>
          {ws.error}
        </Banner>
      )}
      {ws.study ? <StudyEditor ws={ws} study={ws.study} /> : <StartScreen ws={ws} />}
    </>
  )
}
