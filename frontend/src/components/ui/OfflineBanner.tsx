// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react'

interface Props {
  isOnline: boolean
  countdown: number
  checking: boolean
  onRetry: () => void
}

export function OfflineBanner({ isOnline, countdown, checking, onRetry }: Props) {
  const [visible, setVisible] = useState(false)
  const [pressed, setPressed] = useState(false)
  const prevOnline = useRef(isOnline)

  useEffect(() => {
    const wasOnline = prevOnline.current
    prevOnline.current = isOnline

    if (!isOnline && !visible) {
      setVisible(true)
    } else if (isOnline && !wasOnline && visible) {
      // Server came back — reload immediately, no intermediate message needed
      window.location.reload()
    }
  }, [isOnline])

  if (!visible) return null

  return (
    <>
      {/* Page-blocking overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 69,
          background: 'rgba(0,0,0,0.55)',
          WebkitBackdropFilter: 'blur(1px)',
          backdropFilter: 'blur(1px)',
        }}
      />

      {/* Centered floating pill */}
      <div
        style={{
          position: 'fixed',
          top: 24, left: 0, right: 0,
          zIndex: 70,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            animationName: 'offlineBannerIn',
            animationDuration: '0.42s',
            animationTimingFunction: 'cubic-bezier(0.4,0,0.2,1)',
            animationFillMode: 'both',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 20px',
            borderRadius: 16,
            border: '1px solid #4338ca',
            background: '#1e1b4b',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <WifiOff style={{ width: 16, height: 16, flexShrink: 0, color: '#f87171' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: '#f87171' }}>
            No internet connection
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-primary-hex-300)' }}>
            Retrying in{' '}
            <span style={{ fontWeight: 700, color: '#fff' }}>{countdown}s</span>
          </span>
          <button
            onClick={() => {
              if (checking) return
              setPressed(true)
              setTimeout(() => setPressed(false), 180)
              onRetry()
            }}
            disabled={checking}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 14px',
              borderRadius: 8,
              border: '1px solid #4338ca',
              background: checking || pressed ? '#1e1b4b' : '#312e81',
              color: '#f87171',
              fontSize: 12,
              fontWeight: 600,
              cursor: checking ? 'default' : 'pointer',
              transform: pressed ? 'scale(0.88)' : 'scale(1)',
              transition: 'transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.15s',
              animation: checking ? 'retry-pulse 1.2s ease-in-out infinite' : 'none',
              outline: 'none',
            }}
          >
            {checking
              ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 0.8s linear infinite' }} />
              : <RefreshCw style={{ width: 13, height: 13 }} />
            }
            {checking ? 'Checking…' : 'Retry Now'}
          </button>
        </div>
      </div>
    </>
  )
}
