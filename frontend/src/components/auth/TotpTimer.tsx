// Author: Kishore Kumar
import { useEffect, useState } from 'react'

const PERIOD = 30
const R = 10
const CIRC = 2 * Math.PI * R

function getState() {
  const ms = Date.now()
  const secsLeft = PERIOD - (Math.floor(ms / 1000) % PERIOD)
  const elapsedFrac = (ms / 1000 % PERIOD) / PERIOD
  return { secsLeft, elapsedFrac }
}

export function TotpTimer() {
  const [{ secsLeft, elapsedFrac }, setState] = useState(getState)

  useEffect(() => {
    // 50 ms ticks keep the arc visually smooth (≈20 fps) without a CSS
    // transition, so it moves continuously like an authenticator app ring.
    const id = setInterval(() => setState(getState()), 50)
    return () => clearInterval(id)
  }, [])

  const dashOffset = CIRC * elapsedFrac
  const color =
    secsLeft > 10 ? 'var(--color-primary-hex-400)'
    : secsLeft > 5  ? '#fbbf24'
    :                  '#f87171'

  return (
    <span className="inline-flex items-center gap-1.5" title="Time left for current TOTP code">
      <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={R} fill="none" stroke="#374151" strokeWidth="2.5" />
        <circle
          cx="12" cy="12" r={R}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span
        className="text-xs font-mono font-semibold tabular-nums w-5 text-center"
        style={{ color }}
      >
        {secsLeft}s
      </span>
    </span>
  )
}
