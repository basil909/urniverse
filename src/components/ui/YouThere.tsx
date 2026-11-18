'use client'

import { useState } from 'react'

import { PLANETS } from '../experience/orbit'

/* "You, there": type your weight and age, and see what you would weigh on
   this world and how many of its years old you would be. Any unit of
   weight works (kilograms or pounds come out in the same unit). Kept only
   in memory, while the page is open: nothing is stored or sent. */

/* surface gravity, m/s² (NASA fact sheets; the giants at the 1-bar level) */
const GRAVITY: Record<number, number> = {
  [-1]: 274,
  0: 3.7,
  1: 8.87,
  2: 9.81,
  3: 3.71,
  4: 24.79,
  5: 10.44,
  6: 8.69,
  7: 11.15,
}

// shared by every panel while the page is open
const remembered = { weight: '70', age: '30' }

const fmt = (value: number) =>
  value >= 100 ? Math.round(value).toLocaleString('en-US') : value >= 10 ? value.toFixed(1) : value.toFixed(2)

export default function YouThere({ index, name }: { index: number; name: string }) {
  const [weight, setWeight] = useState(remembered.weight)
  const [age, setAge] = useState(remembered.age)
  const g = GRAVITY[index]
  // (Earth is the yardstick)
  if (g === undefined || index === 2) return null

  const w = Number.parseFloat(weight)
  const a = Number.parseFloat(age)
  const planet = index >= 0 ? PLANETS[index] : null
  const years = planet && a > 0 ? (a * 365.25) / planet.orbitalPeriodDays : null
  const there = w > 0 ? (w * g) / 9.81 : null

  return (
    <section className="you-there" aria-labelledby="you-there-heading">
      <h3 id="you-there-heading">You, on {name}</h3>
      <div className="you-there-inputs">
        <label>
          <span>Your weight</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={1000}
            value={weight}
            onChange={(event) => {
              setWeight(event.target.value)
              remembered.weight = event.target.value
            }}
          />
        </label>
        {planet && (
          <label>
            <span>Your age</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={150}
              value={age}
              onChange={(event) => {
                setAge(event.target.value)
                remembered.age = event.target.value
              }}
            />
          </label>
        )}
      </div>
      <p className="you-there-result" aria-live="polite">
    {there !== null && (
          <>
            {index < 0 ? 'Standing on the Sun' : `On ${name}`} you would weigh <strong>{fmt(there)}</strong>
            {' '}({Math.round((g / 9.81) * 100)}% of your Earth weight)
          </>
        )}
        {there !== null && years !== null ? ', and you would be ' : null}
        {years !== null && (
          <>
            <strong>{fmt(years)}</strong> {name} years old
          </>
        )}
            {there !== null || years !== null ? '.' : 'Type a number to compare.'}
      </p>
      <p className="you-there-note">Any unit works: kilograms in, kilograms out. Nothing you type is stored or sent.</p>
    </section>
  )
}
