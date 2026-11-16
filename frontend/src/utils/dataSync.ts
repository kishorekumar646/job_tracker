// Author: Kishore Kumar
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('jobpilot-data-changes')

function emit() {
  listeners.forEach((listener) => listener())
}

channel?.addEventListener('message', emit)

export function notifyDataChanged() {
  emit()
  channel?.postMessage('changed')
}

export function subscribeToDataChanges(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
