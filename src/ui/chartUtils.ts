/** Round tick values covering [lo, hi]. */
export function ticks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (lo === hi) return [lo]
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

/** Compact number for axes, tables and tooltips. */
export const fmt = (v: number) => (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 0.001) ? v.toPrecision(3) : Number(v.toPrecision(4)).toString())
