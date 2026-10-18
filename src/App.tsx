import { useState } from 'react'
import { SECTIONS, type SectionId } from './app/sections'
import { useWorkspace } from './study/useWorkspace'
import { AnalyzePanel } from './ui/AnalyzePanel'
import { DesignPanel } from './ui/DesignPanel'
import { RunPanel } from './ui/RunPanel'
import { StudyPanel } from './ui/StudyPanel'

function App() {
  const ws = useWorkspace()
  const [active, setActive] = useState<SectionId>('study')
  const section = SECTIONS.find((s) => s.id === active)!

  return (
    <div className="shell">
      <header className="topbar no-print">
        <h1>Molding DOE</h1>
        {ws.study && <span className="muted">{ws.study.name || 'Untitled study'}</span>}
      </header>
      <nav className="steps no-print" aria-label="Workflow">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            className={s.id === active ? 'step active' : 'step'}
            aria-current={s.id === active ? 'page' : undefined}
            onClick={() => setActive(s.id)}
          >
            <span className="num">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>
      <main>
        {active === 'study' ? (
          <StudyPanel ws={ws} />
        ) : active === 'design' && ws.study ? (
          <DesignPanel ws={ws} study={ws.study} />
        ) : active === 'run' && ws.study ? (
          <RunPanel ws={ws} study={ws.study} />
        ) : active === 'analyze' && ws.study ? (
          <AnalyzePanel ws={ws} study={ws.study} />
        ) : (
          <section className="card">
            <h2>{section.label}</h2>
            <p>{section.summary}</p>
            <p className="muted">{ws.study ? 'Not built yet.' : 'Start or open a study first.'}</p>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
