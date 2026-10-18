import { useState, type ReactNode } from 'react'
import { fmt, ticks } from './chartUtils'

/** Small SVG charts for the analysis view. Colors come from the --viz-* tokens in index.css. */

const W = 520
const PAD = { top: 12, right: 16, bottom: 40, left: 56 }

function scale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0)
}

function extent(values: number[], pad = 0.05): [number, number] {
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const p = (hi - lo) * pad
  return [lo - p, hi + p]
}


interface Hover {
  x: number
  y: number
  text: ReactNode
}

function Frame({ height, title, children, hover, desc }: { height: number; title: string; children: ReactNode; hover: Hover | null; desc?: string }) {
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={desc ?? title}>
          {children}
        </svg>
        {hover && (
          <div className="tooltip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / height) * 100}%` }}>
            {hover.text}
          </div>
        )}
      </div>
    </figure>
  )
}

function YAxis({ y, ticks: t, x0, x1, label }: { y: (v: number) => number; ticks: number[]; x0: number; x1: number; label?: string }) {
  return (
    <g className="axis">
      {t.map((v) => (
        <g key={v}>
          <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} className="grid" />
          <text x={x0 - 6} y={y(v)} dy="0.32em" textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      {label && (
        <text transform={`translate(14 ${(y(t[0] ?? 0) + y(t[t.length - 1] ?? 0)) / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">
          {label}
        </text>
      )}
    </g>
  )
}

function XAxis({ x, ticks: t, y0, label, height }: { x: (v: number) => number; ticks: number[]; y0: number; label?: string; height: number }) {
  return (
    <g className="axis">
      <line x1={x(t[0] ?? 0)} x2={x(t[t.length - 1] ?? 0)} y1={y0} y2={y0} className="baseline" />
      {t.map((v) => (
        <text key={v} x={x(v)} y={y0 + 16} textAnchor="middle">
          {fmt(v)}
        </text>
      ))}
      {label && (
        <text x={(PAD.left + W - PAD.right) / 2} y={height - 4} textAnchor="middle" className="axis-label">
          {label}
        </text>
      )}
    </g>
  )
}

export interface BarItem {
  label: string
  value: number
  /** Shown in the tooltip, e.g. the signed effect. */
  detail?: string
  active: boolean
}

/** Horizontal bars, largest first, with a reference line (Pareto of effects). */
export function ParetoChart({ title, items, reference, referenceLabel, valueLabel }: { title: string; items: BarItem[]; reference?: number; referenceLabel?: string; valueLabel: string }) {
  const [hover, setHover] = useState<Hover | null>(null)
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const row = 22
  const top = PAD.top + 14
  // Room for the longest label (about 6px per character at 11px), within reason.
  const left = Math.min(220, 16 + Math.max(...sorted.map((i) => i.label.length)) * 6)
  const height = top + sorted.length * row + PAD.bottom
  const max = Math.max(...sorted.map((i) => i.value), reference ?? 0) * 1.05 || 1
  const x = scale(0, max, left, W - PAD.right)
  const t = ticks(0, max, 4)
  const y0 = top + sorted.length * row
  return (
    <Frame title={title} height={height} hover={hover}>
      {t.map((v) => (
        <line key={v} x1={x(v)} x2={x(v)} y1={top} y2={y0} className="grid" />
      ))}
      <XAxis x={x} ticks={t} y0={y0} label={valueLabel} height={height} />
      {sorted.map((it, i) => {
        const y = top + i * row
        return (
          <g key={it.label} onMouseEnter={() => setHover({ x: x(it.value), y: y + row / 2, text: <>{it.label}: {it.detail ?? fmt(it.value)}</> })} onMouseLeave={() => setHover(null)}>
            <rect x={left} y={y} width={W - PAD.right - left} height={row} fill="transparent" />
            <text x={left - 6} y={y + row / 2} dy="0.32em" textAnchor="end" className="tick-label">
              {it.label}
            </text>
            <rect x={left} y={y + 3} width={Math.max(1, x(it.value) - left)} height={row - 6} rx={3} className={it.active ? 'bar' : 'bar muted-bar'} />
          </g>
        )
      })}
      {reference !== undefined && (
        <g>
          <line x1={x(reference)} x2={x(reference)} y1={top - 4} y2={y0} className="ref" />
          {referenceLabel && (
            <text x={x(reference) + 4} y={top - 6} className="ref-label">
              {referenceLabel}
            </text>
          )}
        </g>
      )}
    </Frame>
  )
}

export interface ScatterPoint {
  x: number
  y: number
  label?: string
  highlight?: boolean
}

/** Points with optional labels, a fitted reference line through given points, and a zero line. */
export function ScatterChart({
  title,
  points,
  xLabel,
  yLabel,
  line,
  zeroLine,
  labelHighlighted,
}: {
  title: string
  points: ScatterPoint[]
  xLabel: string
  yLabel: string
  line?: [ScatterPoint, ScatterPoint]
  zeroLine?: boolean
  labelHighlighted?: boolean
}) {
  const [hover, setHover] = useState<Hover | null>(null)
  const height = 300
  if (!points.length) return null
  const [xl, xh] = extent(points.map((p) => p.x))
  const [yl, yh] = extent([...points.map((p) => p.y), ...(zeroLine ? [0] : [])])
  const x = scale(xl, xh, PAD.left, W - PAD.right)
  const y = scale(yl, yh, height - PAD.bottom, PAD.top)
  const xt = ticks(xl, xh)
  const yt = ticks(yl, yh)
  const clampY = (v: number) => Math.max(PAD.top, Math.min(height - PAD.bottom, v))
  return (
    <Frame title={title} height={height} hover={hover}>
      <YAxis y={y} ticks={yt} x0={PAD.left} x1={W - PAD.right} label={yLabel} />
      <XAxis x={x} ticks={xt} y0={height - PAD.bottom} label={xLabel} height={height} />
      {zeroLine && <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="ref" />}
      {line && <line x1={x(line[0].x)} x2={x(line[1].x)} y1={clampY(y(line[0].y))} y2={clampY(y(line[1].y))} className="fit-line" />}
      {points.map((p, i) => (
        <g key={i} onMouseEnter={() => setHover({ x: x(p.x), y: y(p.y), text: <>{p.label ? `${p.label}: ` : ''}{fmt(p.y)} at {fmt(p.x)}</> })} onMouseLeave={() => setHover(null)}>
          <circle cx={x(p.x)} cy={y(p.y)} r={10} fill="transparent" />
          <circle cx={x(p.x)} cy={y(p.y)} r={p.highlight ? 5 : 4} className={p.highlight ? 'dot' : 'dot muted-dot'} />
          {labelHighlighted && p.highlight && p.label && (
            <text x={x(p.x) - 7} y={y(p.y)} dy="0.32em" textAnchor="end" className="point-label">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </Frame>
  )
}

export interface LinePanel {
  title: string
  xs: number[]
  /** One or two series of y values over xs. */
  series: { name: string; ys: number[] }[]
  xLabels?: [string, string]
}

/** Small multiples sharing one y scale (main effects; interaction pairs). */
export function LinePanels({ title, panels, yLabel }: { title: string; panels: LinePanel[]; yLabel: string }) {
  const [hover, setHover] = useState<Hover | null>(null)
  const all = panels.flatMap((p) => p.series.flatMap((s) => s.ys))
  if (!all.length) return null
  const [yl, yh] = extent(all, 0.1)
  const height = 240
  const n = panels.length
  const gap = 12
  const inner = (W - PAD.left - PAD.right - gap * (n - 1)) / n
  const y = scale(yl, yh, height - PAD.bottom, PAD.top + 16)
  const yt = ticks(yl, yh, 4)
  const twoSeries = panels.some((p) => p.series.length > 1)
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      {twoSeries && (
        <div className="legend">
          {panels[0].series.map((s, i) => (
            <span key={s.name}>
              <i className={`swatch s${i + 1}`} /> {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
          <YAxis y={y} ticks={yt} x0={PAD.left} x1={W - PAD.right} label={yLabel} />
          {panels.map((p, pi) => {
            const x0 = PAD.left + pi * (inner + gap)
            const x = scale(Math.min(...p.xs), Math.max(...p.xs), x0 + 8, x0 + inner - 8)
            return (
              <g key={p.title}>
                <text x={x0 + inner / 2} y={PAD.top + 4} textAnchor="middle" className="panel-title">
                  {p.title.length > inner / 6.5 ? p.title.slice(0, Math.floor(inner / 6.5) - 1) + '…' : p.title}
                </text>
                <line x1={x0} x2={x0 + inner} y1={height - PAD.bottom} y2={height - PAD.bottom} className="baseline" />
                <text x={x(p.xs[0])} y={height - PAD.bottom + 16} textAnchor="middle" className="tick-label">
                  {p.xLabels?.[0] ?? 'Low'}
                </text>
                <text x={x(p.xs[p.xs.length - 1])} y={height - PAD.bottom + 16} textAnchor="middle" className="tick-label">
                  {p.xLabels?.[1] ?? 'High'}
                </text>
                {p.series.map((s, si) => (
                  <g key={s.name}>
                    <polyline points={p.xs.map((xv, i) => `${x(xv)},${y(s.ys[i])}`).join(' ')} className={`line s${si + 1}`} />
                    {[0, p.xs.length - 1].map((i) => (
                      <g key={i} onMouseEnter={() => setHover({ x: x(p.xs[i]), y: y(s.ys[i]), text: <>{p.title}{p.series.length > 1 ? `, ${s.name}` : ''}: {fmt(s.ys[i])}</> })} onMouseLeave={() => setHover(null)}>
                        <circle cx={x(p.xs[i])} cy={y(s.ys[i])} r={10} fill="transparent" />
                        <circle cx={x(p.xs[i])} cy={y(s.ys[i])} r={4} className={`marker s${si + 1}`} />
                      </g>
                    ))}
                  </g>
                ))}
              </g>
            )
          })}
        </svg>
        {hover && (
          <div className="tooltip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / height) * 100}%` }}>
            {hover.text}
          </div>
        )}
      </div>
    </figure>
  )
}

const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

function rampColor(t: number): string {
  const i = Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))))
  return RAMP[i]
}

/** Filled contour (heat map) of a prediction over two coded factors, with design points. */
export function ContourChart({
  title,
  predict,
  xRange,
  yRange,
  xLabel,
  yLabel,
  points,
  format,
  marker,
}: {
  title: string
  predict: (a: number, b: number) => number
  xRange: [number, number]
  yRange: [number, number]
  xLabel: string
  yLabel: string
  points: [number, number][]
  format: (coded: number, axis: 'x' | 'y') => string
  marker?: [number, number]
}) {
  const [hover, setHover] = useState<Hover | null>(null)
  const size = 300
  const height = size + PAD.top + PAD.bottom
  const n = 30
  const x = scale(xRange[0], xRange[1], PAD.left, PAD.left + size)
  const y = scale(yRange[0], yRange[1], PAD.top + size, PAD.top)
  const cells: { a: number; b: number; v: number }[] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = xRange[0] + ((i + 0.5) / n) * (xRange[1] - xRange[0])
      const b = yRange[0] + ((j + 0.5) / n) * (yRange[1] - yRange[0])
      cells.push({ a, b, v: predict(a, b) })
    }
  const lo = Math.min(...cells.map((c) => c.v))
  const hi = Math.max(...cells.map((c) => c.v))
  const t = (v: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo))
  const cw = size / n
  const xt = ticks(xRange[0], xRange[1], 4)
  const yt = ticks(yRange[0], yRange[1], 4)
  const legendX = PAD.left + size + 24
  return (
    <Frame title={title} height={height} hover={hover} desc={`${title}: predicted values from ${fmt(lo)} to ${fmt(hi)}`}>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={x(c.a) - cw / 2}
          y={y(c.b) - cw / 2}
          width={cw + 0.5}
          height={cw + 0.5}
          fill={rampColor(t(c.v))}
          onMouseEnter={() => setHover({ x: x(c.a), y: y(c.b), text: <>{fmt(c.v)} at {format(c.a, 'x')}, {format(c.b, 'y')}</> })}
          onMouseLeave={() => setHover(null)}
        />
      ))}
      {points.map(([a, b], i) => (
        <circle key={i} cx={x(a)} cy={y(b)} r={3.5} className="design-pt" pointerEvents="none" />
      ))}
      {marker && <path d={`M${x(marker[0]) - 7},${y(marker[1])}h14M${x(marker[0])},${y(marker[1]) - 7}v14`} className="optimum-mark" pointerEvents="none" />}
      <g className="axis">
        {xt.map((v) => (
          <text key={v} x={x(v)} y={PAD.top + size + 16} textAnchor="middle">
            {format(v, 'x')}
          </text>
        ))}
        {yt.map((v) => (
          <text key={v} x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end">
            {format(v, 'y')}
          </text>
        ))}
        <text x={PAD.left + size / 2} y={height - 4} textAnchor="middle" className="axis-label">
          {xLabel}
        </text>
        <text transform={`translate(12 ${PAD.top + size / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">
          {yLabel}
        </text>
      </g>
      <g>
        {RAMP.map((c, i) => (
          <rect key={c} x={legendX} y={PAD.top + ((RAMP.length - 1 - i) * size) / RAMP.length} width={14} height={size / RAMP.length + 0.5} fill={c} />
        ))}
        <text x={legendX + 20} y={PAD.top + 8} className="tick-label">
          {fmt(hi)}
        </text>
        <text x={legendX + 20} y={PAD.top + size} className="tick-label">
          {fmt(lo)}
        </text>
      </g>
    </Frame>
  )
}

/** Wireframe 3D surface with a rotation control. */
export function SurfaceChart({ title, predict, xRange, yRange, xLabel, yLabel }: { title: string; predict: (a: number, b: number) => number; xRange: [number, number]; yRange: [number, number]; xLabel: string; yLabel: string }) {
  const [angle, setAngle] = useState(35)
  const n = 16
  const grid: number[][] = []
  for (let i = 0; i <= n; i++) {
    grid.push([])
    for (let j = 0; j <= n; j++) grid[i].push(predict(xRange[0] + (i / n) * (xRange[1] - xRange[0]), yRange[0] + (j / n) * (yRange[1] - yRange[0])))
  }
  const flat = grid.flat()
  const lo = Math.min(...flat)
  const hi = Math.max(...flat)
  const height = 320
  const rad = (angle * Math.PI) / 180
  const elev = 0.5
  // Unit cube coordinates in [-1, 1], rotated about the vertical axis, then tilted.
  const project = (u: number, v: number, w: number): [number, number] => {
    const xr = u * Math.cos(rad) - v * Math.sin(rad)
    const yr = u * Math.sin(rad) + v * Math.cos(rad)
    return [W / 2 + xr * 150, height / 2 + 30 + yr * 150 * elev - w * 70]
  }
  const zn = (z: number) => (hi === lo ? 0 : ((z - lo) / (hi - lo)) * 2 - 1)
  const u = (i: number) => (i / n) * 2 - 1
  const lines: string[] = []
  for (let i = 0; i <= n; i++) {
    lines.push(grid[i].map((z, j) => project(u(i), u(j), zn(z)).join(',')).join(' '))
    lines.push(grid.map((col, k) => project(u(k), u(i), zn(col[i])).join(',')).join(' '))
  }
  const base = [project(-1, -1, -1.05), project(1, -1, -1.05), project(1, 1, -1.05), project(-1, 1, -1.05)]
  const xEnd = project(1.25, -1, -1.05)
  const yEnd = project(-1, 1.25, -1.05)
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${title}: values from ${fmt(lo)} to ${fmt(hi)}`}>
          <polygon points={base.map((p) => p.join(',')).join(' ')} className="surface-base" />
          {lines.map((pts, i) => (
            <polyline key={i} points={pts} className="surface-line" />
          ))}
          <text x={xEnd[0]} y={xEnd[1]} className="axis-label" textAnchor="middle">
            {xLabel}
          </text>
          <text x={yEnd[0]} y={yEnd[1]} className="axis-label" textAnchor="middle">
            {yLabel}
          </text>
          <text x={8} y={16} className="tick-label">
            Range {fmt(lo)} to {fmt(hi)}
          </text>
        </svg>
      </div>
      <label className="field">
        <span className="small">Rotate</span>
        <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
      </label>
    </figure>
  )
}
