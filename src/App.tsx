import { useState } from 'react'
import { SECTIONS, visibleSections, type SectionId } from './app/sections'
import { doeEnabled } from './study/schema'
import { useWorkspace } from './study/useWorkspace'
import { AnalyzePanel } from './ui/AnalyzePanel'
import { DoeOffPanel } from './ui/DoeOffPanel'
import { GuidePanel } from './ui/GuidePanel'
import { DesignPanel } from './ui/DesignPanel'
import { IntroPanel } from './ui/IntroPanel'
import { ReportPanel } from './ui/ReportPanel'
import { RunPanel } from './ui/RunPanel'
import { StudyPanel } from './ui/StudyPanel'

function App() {
  const ws = useWorkspace()
  const [active, setActive] = useState<SectionId>('intro')
  const section = SECTIONS.find((s) => s.id === active)!
  // Without a study the DOE steps stay listed (as optional) so the whole path is visible.
  const doe = ws.study ? doeEnabled(ws.study) : true
  const steps = visibleSections(doe)

  return (
    <div className="shell">
      <header className="topbar no-print">
        <h1>Molding process development</h1>
        {ws.study && <span className="muted">{ws.study.name || 'Untitled study'}</span>}
      </header>
      <nav className="steps no-print" aria-label="Workflow">
        <button className={active === 'intro' ? 'step active' : 'step'} aria-current={active === 'intro' ? 'page' : undefined} onClick={() => setActive('intro')}>
          Introduction
        </button>
        {steps.map((s, i) => (
          <button
            key={s.id}
            className={['step', s.id === active && 'active', s.doe && !ws.study && 'optional'].filter(Boolean).join(' ')}
            aria-current={s.id === active ? 'page' : undefined}
            onClick={() => setActive(s.id)}
          >
            <span className="num">{i + 1}</span>
            {s.label}
          </button>
        ))}
        {!doe && (
          <button className={section.doe ? 'step optional active' : 'step optional'} aria-current={section.doe ? 'page' : undefined} onClick={() => setActive('design')}>
            + DOE (optional)
          </button>
        )}
      </nav>
      <main>
        {active === 'intro' ? (
          <IntroPanel ws={ws} go={setActive} />
        ) : active === 'study' ? (
          <StudyPanel ws={ws} />
        ) : !ws.study ? (
          <section className="card">
            <h2>{section.label}</h2>
            <p>{section.summary}</p>
            <p className="muted">Start or open a study first.</p>
          </section>
        ) : section.doe && !doe ? (
          <DoeOffPanel ws={ws} />
        ) : active === 'guide' ? (
          <GuidePanel ws={ws} study={ws.study} />
        ) : active === 'design' ? (
          <DesignPanel ws={ws} study={ws.study} />
        ) : active === 'run' ? (
          <RunPanel ws={ws} study={ws.study} />
        ) : active === 'analyze' ? (
          <AnalyzePanel ws={ws} study={ws.study} />
        ) : (
          <ReportPanel ws={ws} study={ws.study} />
        )}
      </main>
    </div>
  )
}

export default App
