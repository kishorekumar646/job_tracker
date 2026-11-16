// Author: Kishore Kumar
// Animated background: job platforms send signals into the JobPilot core, which routes them to your applications.
import { useEffect, useRef } from 'react'
const PLATFORMS = ['LinkedIn', 'Naukri', 'Indeed', 'Glassdoor', 'Foundit', 'Instahyre']
const SKILLS = ['Resume', 'Skills', 'Titles', 'Locations']
const C = 400
const R = 270
const R2 = 150

const polar = (deg: number, r: number) => ({ x: C + r * Math.cos((deg * Math.PI) / 180), y: C + r * Math.sin((deg * Math.PI) / 180) })

export function JobConstellation({ className = '' }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      if (preference.matches) svg.current?.pauseAnimations()
      else svg.current?.unpauseAnimations()
    }
    sync()
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [])
  const outer = PLATFORMS.map((label, i) => ({ label, ...polar(-90 + i * 60, R), delay: i * 0.45 }))
  const inner = SKILLS.map((label, i) => ({ label, ...polar(-45 + i * 90, R2), delay: i * 0.6 }))
  return (
    <svg ref={svg} viewBox="0 0 800 800" className={`pointer-events-none overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id="jc-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(var(--brand-400))" stopOpacity="0.9" />
          <stop offset="100%" stopColor="rgb(var(--brand-700))" stopOpacity="0.15" />
        </radialGradient>
      </defs>

      <circle cx={C} cy={C} r={R} fill="none" stroke="rgb(var(--brand-400) / 0.12)" strokeDasharray="2 8" />
      <circle cx={C} cy={C} r={R2} fill="none" stroke="rgb(var(--brand-400) / 0.12)" strokeDasharray="2 8" />

      {outer.map((n, i) => {
        const next = outer[(i + 1) % outer.length]
        const far = polar(-90 + i * 60, 1400)
        return (
          <g key={`links-${n.label}`}>
            <line x1={n.x} y1={n.y} x2={far.x} y2={far.y} stroke="rgb(var(--brand-400) / 0.22)" strokeWidth="1" strokeDasharray="4 12" style={{ animation: 'signalFlow 4s linear infinite', animationDelay: `${n.delay}s` }} />
            <line x1={n.x} y1={n.y} x2={next.x} y2={next.y} stroke="rgb(var(--brand-400) / 0.45)" strokeWidth="1.2" strokeDasharray="5 9" style={{ animation: 'signalFlow 3.2s linear infinite', animationDelay: `${n.delay}s` }} />
          </g>
        )
      })}

      {outer.map((n) => (
        <g key={n.label}>
          <line x1={n.x} y1={n.y} x2={C} y2={C} stroke="rgb(var(--brand-400) / 0.7)" strokeWidth="2" strokeDasharray="6 10" style={{ animation: 'signalFlow 2.4s linear infinite', animationDelay: `${n.delay}s` }} />
          <circle r="3.5" fill="rgb(var(--brand-300))">
            <animateMotion dur="3s" begin={`${n.delay}s`} repeatCount="indefinite" path={`M${n.x},${n.y} L${C},${C}`} />
            <animate attributeName="opacity" values="0;1;1;0" dur="3s" begin={`${n.delay}s`} repeatCount="indefinite" />
          </circle>
          <g style={{ animation: 'catNodePulse 3s ease-in-out infinite', animationDelay: `${n.delay}s` }}>
            <circle cx={n.x} cy={n.y} r="32" fill="rgb(var(--brand-500) / 0.25)" stroke="rgb(var(--brand-400))" strokeWidth="1.5" />
            <circle cx={n.x} cy={n.y} r="4" fill="rgb(var(--brand-300))" />
            <text x={n.x} y={n.y + 56} textAnchor="middle" fontSize="20" fontWeight="700" fill="#f3f4f6">{n.label}</text>
          </g>
        </g>
      ))}

      {inner.map((n) => (
        <g key={n.label}>
          <line x1={C} y1={C} x2={n.x} y2={n.y} stroke="rgb(var(--brand-300) / 0.6)" strokeWidth="1.5" strokeDasharray="3 8" style={{ animation: 'signalFlow 3s linear infinite reverse', animationDelay: `${n.delay}s` }} />
          <g style={{ animation: 'catNodePulse 3.6s ease-in-out infinite', animationDelay: `${n.delay}s` }}>
            <circle cx={n.x} cy={n.y} r="26" fill="rgb(var(--brand-300) / 0.18)" stroke="rgb(var(--brand-300) / 0.7)" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#f3f4f6">{n.label}</text>
          </g>
        </g>
      ))}

      <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'orbitSpin 24s linear infinite' }}>
        <circle cx={C} cy={C} r="58" fill="none" stroke="rgb(var(--brand-300) / 0.5)" strokeWidth="1.5" strokeDasharray="10 14" />
      </g>
      <g style={{ animation: 'rcaCorePulse 3s ease-in-out infinite' }}>
        <circle cx={C} cy={C} r="44" fill="url(#jc-core)" stroke="rgb(var(--brand-400))" strokeWidth="2" />
        <text x={C} y={C + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">JobPilot</text>
      </g>
      <text x={C} y={C + 82} textAnchor="middle" fontSize="12" fill="rgb(var(--brand-300))">auto-apply engine</text>
    </svg>
  )
}
