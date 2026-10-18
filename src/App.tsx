import { useState } from 'react'
import { SECTIONS, type SectionId } from './app/sections'

function App() {
  const [active, setActive] = useState<SectionId>('study')
  const section = SECTIONS.find((s) => s.id === active)!

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Molding DOE</h1>
      </header>
      <nav className="steps" aria-label="Workflow">
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
      <main className="panel">
        <h2>{section.label}</h2>
        <p>{section.summary}</p>
        <p className="muted">Not built yet.</p>
      </main>
    </div>
  )
}

export default App
