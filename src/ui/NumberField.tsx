import { useState } from 'react'
import { fromDisplay, toDisplay, unitLabel, type Quantity, type UnitSystem } from '../study/units'

interface Props {
  label: string
  /** Stored metric value, or undefined when blank. */
  value: number | undefined
  quantity: Quantity
  units: UnitSystem
  onChange: (metric: number | undefined) => void
  min?: number
  integer?: boolean
  /** Keep the label for screen readers only, e.g. inside a table with column headers. */
  hideLabel?: boolean
  /** Unit to show for a value with no quantity, e.g. "h" or "%". */
  unit?: string
}

function format(v: number | undefined, q: Quantity, units: UnitSystem): string {
  if (v === undefined) return ''
  return String(Number(toDisplay(v, q, units).toPrecision(6)))
}

function represents(text: string, value: number | undefined, q: Quantity, units: UnitSystem): boolean {
  if (text.trim() === '') return value === undefined
  const n = Number(text)
  if (value === undefined || !Number.isFinite(n)) return false
  return Math.abs(fromDisplay(n, q, units) - value) <= 1e-9 * Math.max(1, Math.abs(value))
}

/** A number input that shows and accepts the user's unit system and reports metric values. */
export function NumberField({ label, value, quantity, units, onChange, min, integer, hideLabel, unit: fixedUnit }: Props) {
  const [text, setText] = useState(() => format(value, quantity, units))

  // When the stored value or unit system changes from outside this field, re-format the text,
  // unless the text already means that value (so typing "12." isn't rewritten to "12").
  const [seen, setSeen] = useState({ value, units })
  if (seen.value !== value || seen.units !== units) {
    setSeen({ value, units })
    if (!represents(text, value, quantity, units)) setText(format(value, quantity, units))
  }

  const unit = fixedUnit ?? unitLabel(quantity, units)
  return (
    <label className="field">
      <span className={hideLabel ? 'sr-only' : undefined}>
        {label}
        {unit && <span className="unit"> ({unit})</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={integer ? 1 : 'any'}
        min={min}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const raw = e.target.value.trim()
          if (raw === '') return onChange(undefined)
          const n = Number(raw)
          if (Number.isFinite(n)) onChange(fromDisplay(n, quantity, units))
        }}
      />
    </label>
  )
}
