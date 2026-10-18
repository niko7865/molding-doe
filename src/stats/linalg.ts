/** Dense row-major matrix. Designs here are small (tens of runs, tens of terms), so clarity beats speed. */
export type Matrix = number[][]

export function transpose(a: Matrix): Matrix {
  if (a.length === 0) return []
  return a[0].map((_, j) => a.map((row) => row[j]))
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const n = b[0]?.length ?? 0
  return a.map((row) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0
      for (let k = 0; k < row.length; k++) s += row[k] * b[k][j]
      return s
    }),
  )
}

export function matVec(a: Matrix, x: number[]): number[] {
  return a.map((row) => dot(row, x))
}

export function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** X'X for a model matrix X. */
export function crossProduct(x: Matrix): Matrix {
  const p = x[0]?.length ?? 0
  const out: Matrix = Array.from({ length: p }, () => new Array(p).fill(0))
  for (const row of x) {
    for (let i = 0; i < p; i++) {
      if (row[i] === 0) continue
      for (let j = i; j < p; j++) out[i][j] += row[i] * row[j]
    }
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) out[i][j] = out[j][i]
  return out
}

/**
 * Inverse of a square matrix by Gauss–Jordan elimination with partial pivoting.
 * Returns null when the matrix is singular to working precision (e.g. aliased model terms).
 */
export function inverse(a: Matrix): Matrix | null {
  const n = a.length
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  const scale = Math.max(1e-300, ...a.map((row, i) => Math.abs(row[i])))
  const tol = 1e-10 * scale
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    if (Math.abs(m[pivot][col]) <= tol) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    const p = m[col][col]
    for (let j = 0; j < 2 * n; j++) m[col][j] /= p
    for (let r = 0; r < n; r++) {
      if (r === col || m[r][col] === 0) continue
      const f = m[r][col]
      for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[col][j]
    }
  }
  return m.map((row) => row.slice(n))
}

/**
 * Indices of a maximal set of linearly independent columns, chosen left to right.
 * Used to tell which model terms a design can estimate and which are aliased with earlier ones.
 */
export function independentColumns(x: Matrix, tol = 1e-9): number[] {
  const p = x[0]?.length ?? 0
  const basis: number[][] = [] // orthonormal vectors so far (Gram–Schmidt)
  const keep: number[] = []
  for (let j = 0; j < p; j++) {
    let v = x.map((row) => row[j])
    const norm0 = Math.sqrt(dot(v, v))
    if (norm0 === 0) continue
    for (let pass = 0; pass < 2; pass++) {
      for (const q of basis) {
        const c = dot(v, q)
        v = v.map((vi, i) => vi - c * q[i])
      }
    }
    const norm = Math.sqrt(dot(v, v))
    if (norm > tol * norm0 * Math.sqrt(x.length)) {
      basis.push(v.map((vi) => vi / norm))
      keep.push(j)
    }
  }
  return keep
}
