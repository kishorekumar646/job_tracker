// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { adminBillingApi } from '../api'
import { errorMessage } from '../api/client'
import { FilterBar, FilterChips, PageLoader, timeAgo } from '../components/ui'
import { toast } from '../store/toastStore'
import type { AdminOrder, WebhookLog } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

const STYLE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400',
  PAID: 'bg-emerald-500/15 text-emerald-400',
  EXPIRED: 'bg-gray-500/15 text-gray-400',
  FAILED: 'bg-red-500/15 text-red-400',
  MATCHED: 'bg-emerald-500/15 text-emerald-400',
  UNMATCHED: 'bg-red-500/15 text-red-400',
  DUPLICATE: 'bg-orange-500/15 text-orange-400',
  IGNORED: 'bg-gray-500/15 text-gray-400',
}

const Pill = ({ v }: { v: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[v] ?? ''}`}>{v}</span>
)

export function OrdersTab() {
  const [view, setView] = useState<'orders' | 'logs'>('orders')
  const [filter, setFilter] = useState('')
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [logs, setLogs] = useState<WebhookLog[] | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const revision = useDataRefresh()
  const loadId = useRef(0)

  const load = async () => {
    const id = ++loadId.current
    try {
      if (view === 'orders') {
        const rows = await adminBillingApi.orders(filter || undefined)
        if (id === loadId.current) setOrders(rows)
      } else {
        const rows = await adminBillingApi.logs(filter || undefined)
        if (id === loadId.current) setLogs(rows)
      }
    } catch (e) { if (id === loadId.current) toast.error(errorMessage(e)) }
  }
  useEffect(() => {
    setOrders(null)
    setLogs(null)
  }, [view, filter])
  useEffect(() => {
    load()
    return () => { loadId.current++ }
  }, [view, filter, revision])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
      load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const upload = async (f?: File) => {
    if (!f) return
    try {
      const r = await adminBillingApi.uploadStatement(f)
      toast.success(`Statement read: ${r.added} new credits, ${r.settled} orders settled`)
      load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
    if (file.current) file.current.value = ''
  }

  const options = view === 'orders' ? ['PENDING', 'PAID', 'EXPIRED', 'FAILED'] : ['MATCHED', 'UNMATCHED', 'DUPLICATE', 'IGNORED']

  return (
    <>
      <FilterBar active={!!filter} onClear={() => setFilter('')}>
        <div className="filter-field">
        <p className="label">View</p>
        <div className="filter-segments flex">
        {(['orders', 'logs'] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); setFilter('') }}
            className="filter-chip"
            aria-pressed={view === v}
          >
            {v === 'orders' ? 'Orders' : 'Bank alert log'}
          </button>
        ))}
        </div>
        </div>
        <FilterChips label={view === 'orders' ? 'Order status' : 'Bank alert status'} value={filter} onChange={setFilter} options={[{ value: '', label: 'All' }, ...options.map((value) => ({ value, label: value }))]} />
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <button onClick={() => file.current?.click()} className="btn-secondary btn-sm ml-auto max-w-full text-left">
          <Upload className="h-4 w-4 shrink-0" />Upload bank statement (CSV)
        </button>
      </FilterBar>

      {view === 'orders' ? (
        !orders ? <PageLoader variant="table" /> : !orders.length ? <p className="py-10 text-center text-sm text-gray-500">No orders.</p> : (
          <div className="card overflow-x-auto">
            <table className="mobile-order-table w-full text-left text-sm">
              <thead className="border-b border-gray-800 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Order</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">UTR / source</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Order" className="px-4 py-3 font-mono text-gray-300">{o.order_ref}</td>
                    <td data-label="User" className="break-all px-4 py-3 text-gray-200">{o.user_name || o.user_email}<p className="text-xs text-gray-500">{o.user_email}</p></td>
                    <td data-label="Amount" className="px-4 py-3 text-gray-300">₹{(o.unique_amount / 100).toFixed(2)}</td>
                    <td data-label="UTR / source" className="px-4 py-3 text-xs text-gray-400"><span className="font-mono">{o.utr ?? '-'}</span>{o.source && <p>{o.source}</p>}</td>
                    <td data-label="Created" className="px-4 py-3 text-gray-400">{timeAgo(o.created_at)}</td>
                    <td data-label="Status" className="px-4 py-3"><Pill v={o.status} /></td>
                    <td data-label="Actions" className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                      {o.status !== 'PAID' && (
                        <button
                          onClick={() => window.confirm(`Mark ${o.order_ref} as paid and activate Pro for ${o.user_email}?`) && act(() => adminBillingApi.approve(o.id), 'Order approved, Pro activated')}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                        >Approve</button>
                      )}
                      {(o.status === 'PENDING' || o.status === 'EXPIRED') && (
                        <button onClick={() => act(() => adminBillingApi.fail(o.id), 'Order marked failed')} className="rounded-md bg-gray-800 px-3 py-1 text-xs text-gray-200 hover:bg-gray-700">Fail</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !logs ? <PageLoader variant="table" /> : !logs.length ? <p className="py-10 text-center text-sm text-gray-500">No alerts received yet.</p> : (
        <div className="card divide-y divide-gray-800">
          {logs.map((l) => (
            <div key={l.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill v={l.result} />
                  <span className="text-gray-300">{l.amount_paise != null ? `₹${(l.amount_paise / 100).toFixed(2)}` : 'no amount'}</span>
                  {l.utr && <span className="font-mono text-xs text-gray-500">UTR {l.utr}</span>}
                  {l.order_ref && <span className="font-mono text-xs text-gray-500">{l.order_ref}</span>}
                </div>
                <span className="text-xs text-gray-500">{timeAgo(l.created_at)}</span>
              </div>
              <p className="mt-1 break-words text-xs text-gray-500">{l.raw}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
