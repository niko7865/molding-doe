import type { Workspace } from '../study/useWorkspace'

/** Shown in place of Design, Run and Analyze while the study's DOE stage is off. */
export function DoeOffPanel({ ws }: { ws: Workspace }) {
  return (
    <section className="card">
      <h2>DOE (optional)</h2>
      <p>
        The six molding studies set a workable process on their own. Add a designed experiment when you need to know how several settings
        together affect part quality, or to tune the process to a target inside the window the studies found.
      </p>
      <p className="muted small">Switching it on adds Design, Run and Analyze steps and DOE sections to the report. You can switch it off again from the Study step; nothing is deleted.</p>
      <div className="row">
        <button className="btn primary" onClick={() => ws.update((s) => ({ ...s, doe: true }))}>
          Add a DOE to this study
        </button>
      </div>
    </section>
  )
}
