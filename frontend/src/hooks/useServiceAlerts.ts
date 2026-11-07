// Author: Kishore Kumar
import { useEffect, useRef } from 'react'
import { useHealthStore } from '../store/healthStore'
import { useAuthStore } from '../store/authStore'

const LABELS: Record<string, string> = {
  odh: 'ODH / Elasticsearch',
  jira: 'Jira Injector',
  rabbitmq: 'RabbitMQ',
  inspectorweb: 'InspectorWeb',
}
const KEYS = ['odh', 'jira', 'rabbitmq', 'inspectorweb'] as const

export interface ServiceAlert {
  key: string
  label: string
}

export function useServiceAlerts(enabled = true, notifyBrowser = false) {
  const { health, lastChecked, error } = useHealthStore()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const prevDown = useRef<Set<string>>(
    new Set(JSON.parse(sessionStorage.getItem('rca_notified_down') ?? '[]') as string[])
  )

  // Suppress all alerts when the session has ended — a 401 from the health
  // poll after logout looks identical to a real outage, so don't show it.
  const downServices: ServiceAlert[] = isAuthenticated
    ? health
      ? KEYS.filter((k) => !health[k]).map((k) => ({ key: k, label: LABELS[k] }))
      : error
      ? KEYS.map((k) => ({ key: k, label: LABELS[k] }))
      : []
    : []

  const reachable = !isAuthenticated || !error

  // Browser push notifications when a new service goes down
  useEffect(() => {
    if (!enabled || !notifyBrowser) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    for (const d of downServices) {
      if (!prevDown.current.has(d.key)) {
        new Notification('RCA System Alert', { body: `${d.label} is offline.` })
      }
    }
    prevDown.current = new Set(downServices.map((d) => d.key))
    sessionStorage.setItem('rca_notified_down', JSON.stringify([...prevDown.current]))
  }, [downServices, enabled, notifyBrowser])

  return { downServices, lastChecked, reachable }
}
