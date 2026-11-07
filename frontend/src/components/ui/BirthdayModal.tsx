// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const COLORS = ['#f87171','#fb923c','#fbbf24','#4ade80','#60a5fa','#a78bfa','#f472b6','#34d399','#818cf8']
const CONFETTI_COUNT = 70

interface ConfettiPiece {
  id: number
  left: number
  delay: number
  duration: number
  color: string
  width: number
  height: number
  borderRadius: string
}

function generateConfetti(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const isCircle = Math.random() > 0.5
    const size = 5 + Math.random() * 9
    return {
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 3.5 + Math.random() * 3.5,
      color: COLORS[i % COLORS.length],
      width: isCircle ? size : size * (0.4 + Math.random() * 0.6),
      height: isCircle ? size : size * 0.35,
      borderRadius: isCircle ? '50%' : '2px',
    }
  })
}

interface Props {
  name: string
  onClose: () => void
}

const BALLOONS  = ['🎈','🎈','🎈','🎈','🎈']
const BOTTOM    = ['🎁','🎊','🥂','🎊','🎁']
const SPARKLES  = ['⭐','✨','🌟','✨','⭐']

export function BirthdayModal({ name, onClose }: Props) {
  const [confetti] = useState(generateConfetti)
  const firstName = (name || 'Friend').split(' ')[0]

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Confetti */}
      {confetti.map((p) => (
        <div
          key={p.id}
          className="pointer-events-none absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in infinite`,
          }}
        />
      ))}

      {/* Floating balloons */}
      {BALLOONS.map((b, i) => (
        <div
          key={i}
          className="pointer-events-none absolute bottom-4 select-none text-4xl"
          style={{
            left: `${8 + i * 20}%`,
            animation: `balloon-float ${2.2 + i * 0.25}s ease-in-out ${i * 0.35}s infinite`,
          }}
        >
          {b}
        </div>
      ))}

      {/* Modal card */}
      <div
        className="relative z-10 mx-4 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-gray-900/95 shadow-[0_0_60px_rgba(168,85,247,0.3)]"
        style={{ animation: 'birthday-enter 0.65s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        {/* Rainbow top bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-pink-500 via-yellow-400 via-green-400 to-purple-500" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-700/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-8 pb-6 pt-7 text-center">
          {/* Cake emoji */}
          <div
            className="mb-3 inline-block text-7xl leading-none"
            style={{ animation: 'balloon-float 2s ease-in-out infinite' }}
          >
            🎂
          </div>

          {/* Sparkles row */}
          <div className="mb-3 flex justify-center gap-3">
            {SPARKLES.map((s, i) => (
              <span
                key={i}
                className="select-none text-lg"
                style={{
                  animation: `sparkle-pop ${1.2 + i * 0.25}s ease-in-out ${i * 0.18}s infinite`,
                }}
              >
                {s}
              </span>
            ))}
          </div>

          {/* "Happy Birthday!" — rainbow shine text */}
          <h1
            className="mb-1 text-2xl font-black tracking-tight"
            style={{
              background: 'linear-gradient(90deg,#f472b6,#fbbf24,#4ade80,#60a5fa,#a78bfa,#f472b6)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'text-shine 2.5s linear infinite',
            }}
          >
            Happy Birthday!
          </h1>

          <p className="mb-1 text-lg font-bold text-white">{firstName} 🎉</p>

          <p className="mb-6 text-sm leading-relaxed text-gray-400">
            Wishing you a day as amazing as you are — full of joy,
            laughter, and everything you love. Celebrate big! 🥳
          </p>

          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition-all
              bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500
              hover:from-pink-400 hover:via-purple-400 hover:to-indigo-400
              active:scale-95"
          >
            Thank you! 🎊
          </button>
        </div>

        {/* Bottom emoji row */}
        <div className="flex justify-around px-6 pb-5 select-none">
          {BOTTOM.map((e, i) => (
            <span
              key={i}
              className="pointer-events-none text-2xl"
              style={{
                animation: `balloon-float ${1.6 + i * 0.2}s ease-in-out ${i * 0.28}s infinite`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
