// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { matchTargets, regressionErrorMessage, TargetMatch } from '../api/regression'

/**
 * Debounced preview of how many devices a selector set matches (the same lookup the
 * InspectorWeb editor runs). Groups with blank values are ignored; `enabled=false` clears it.
 */
export function useTargetMatch(
  type: 'stb' | 'ott',
  groups: { type: string; value: string; regex?: boolean }[][],
  enabled: boolean,
) {
  const [match, setMatch] = useState<TargetMatch | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = groups.map((g) => g.filter((s) => s.value.trim())).filter((g) => g.length > 0)
  const key = JSON.stringify(clean)

  useEffect(() => {
    if (!enabled || clean.length === 0) { setMatch(null); setError(null); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      matchTargets(type, clean)
        .then((m) => { if (!cancelled) { setMatch(m); setError(null) } })
        .catch((err) => { if (!cancelled) setError(regressionErrorMessage(err, 'Could not check matching devices.')) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 600)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, key, enabled])

  return { match, loading, error }
}
