import type { SectionId } from '../app/sections'
import { GUIDE_STUDIES } from '../guide/info'
import type { Workspace } from '../study/useWorkspace'

/** The landing page: what the tool is for and how a study moves through it. */
export function IntroPanel({ ws, go }: { ws: Workspace; go: (id: SectionId) => void }) {
  return (
    <>
      <section className="card intro">
        <h2>Develop a robust molding process, step by step</h2>
        <p>
          This tool walks a process engineer or press technician through scientific injection molding on one mold: the six studies that set the
          process from the plastic’s point of view, then, when you want it, a designed experiment (DOE) to tune it further. It ends with a
          printable report of what was done and what was found.
        </p>
        <div className="row">
          {ws.study ? (
            <button className="btn primary" onClick={() => go('guide')}>
              Continue “{ws.study.name || 'Untitled study'}”
            </button>
          ) : (
            <button className="btn primary" onClick={() => go('study')}>
              Start a study
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              ws.openDemo()
              go('guide')
            }}
          >
            Explore the demo study
          </button>
        </div>
        <p className="muted small">The demo is a finished two-cavity housing: all six studies, then a DOE grown into a response surface and confirmed.</p>
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol className="intro-steps">
          <li>
            <strong>Set up the study.</strong> Name it, write the goal, enter the number of cavities and the press limits, and pick metric or
            imperial units.
          </li>
          <li>
            <strong>Run the six molding studies, in order.</strong> Each has a short table to fill in at the press, one chart and a suggestion.
            Skip any that don’t apply; the report flags what was skipped.
            <ol className="intro-studies">
              {GUIDE_STUDIES.map((g) => (
                <li key={g.key}>
                  <strong>{g.title}:</strong> {g.why}
                </li>
              ))}
            </ol>
          </li>
          <li>
            <strong>Add a DOE if you need one (optional).</strong> Switch it on from the Study step to design an experiment inside the process
            window, run it at the press (one run per screen on a tablet, or from a printed sheet), analyze the effects, find an optimum and
            confirm it. Leave it off when the studies alone give you the process.
          </li>
          <li>
            <strong>Print the report.</strong> Print it or save it as a PDF. With a DOE, the run table also exports to CSV and Excel.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>Your data</h2>
        <ul className="intro-list">
          <li>Everything stays in this browser. Nothing is sent to a server, and the site works offline once it has loaded.</li>
          <li>Your work is saved in the browser as you go. To share it or keep it safe, use Save study file and open it again on any computer.</li>
          <li>Technicians can enter results on a tablet and send the file back; Merge results from file copies them into your copy.</li>
          <li>Pressures show in psi, clamp force in US tons and temperatures in °F, as on the presses. The metric/imperial switch changes part measurements, speeds and volumes.</li>
        </ul>
      </section>
    </>
  )
}
