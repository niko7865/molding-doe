/**
 * Coded design matrix for a 2^k full factorial in standard (Yates) order.
 * Row i, column j is -1 or +1; the first factor alternates fastest.
 */
export function fullFactorial(k: number): number[][] {
  if (!Number.isInteger(k) || k < 1) throw new RangeError(`k must be a positive integer, got ${k}`)
  const rows: number[][] = []
  for (let i = 0; i < 2 ** k; i++) {
    rows.push(Array.from({ length: k }, (_, j) => ((i >> j) & 1 ? 1 : -1)))
  }
  return rows
}
