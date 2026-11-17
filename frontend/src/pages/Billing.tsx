// Author: Kishore Kumar
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { BadgeCheck, Check, Clock, Crown, Download, Smartphone } from 'lucide-react'
import { billingApi } from '../api'
import { errorMessage } from '../api/client'
import { Modal, PageHeader, PageLoader, Spinner, timeAgo } from '../components/ui'
import { toast } from '../store/toastStore'
import type { BillingMe, Checkout, Order } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { isMobileDevice } from '../utils/device'
import { notifyDataChanged } from '../utils/dataSync'

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-400',
  PAID: 'bg-emerald-500/15 text-emerald-400',
  EXPIRED: 'bg-gray-500/15 text-gray-400',
  FAILED: 'bg-red-500/15 text-red-400',
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return <span className={`font-mono text-lg font-semibold ${left < 60 ? 'text-red-400' : 'text-white'}`}>{mm}:{ss}</span>
}

function CheckoutPanel({ co, onDone, onExpired, onClose }: { co: Checkout; onDone: (o: Order) => void; onExpired: () => void; onClose: () => void }) {
  const [pollError, setPollError] = useState('')
  const mobile = isMobileDevice()
  const apps = /Android/.test(navigator.userAgent) ? [
    { name: 'Google Pay', href: `${co.upi_uri.replace('upi://', 'intent://')}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end` },
    { name: 'PhonePe', href: `${co.upi_uri.replace('upi://', 'intent://')}#Intent;scheme=upi;package=com.phonepe.app;end` },
    { name: 'Paytm', href: `${co.upi_uri.replace('upi://', 'intent://')}#Intent;scheme=upi;package=net.one97.paytm;end` },
  ] : [{ name: 'Google Pay', href: co.upi_uri.replace('upi://', 'gpay://upi/') }]
  const checkExpiry = (e: MouseEvent<HTMLAnchorElement>) => {
    if (new Date(co.order.expires_at).getTime() <= Date.now()) { e.preventDefault(); onExpired() }
  }
  // Poll every 5s: the server flips the order to PAID as soon as the bank credit is detected.
  useEffect(() => {
    let active = true
    let checking = false
    const check = async () => {
      if (checking) return
      checking = true
      try {
        const o = await billingApi.order(co.order.id)
        if (!active) return
        setPollError('')
        if (o.status === 'PAID') onDone(o)
        else if (o.status !== 'PENDING') onExpired()
      } catch (e) {
        if (active) setPollError(errorMessage(e, 'Payment status could not be checked. Reconnect and return here; we will retry automatically.'))
      } finally { checking = false }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    const t = setInterval(() => void check(), 5000)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; clearInterval(t); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [co.order.id, onDone, onExpired])

  const qr = <div className="shrink-0 text-center"><img src={co.qr_code} alt="UPI QR code" className="mx-auto h-52 w-52 rounded-lg bg-white p-2" /><p className="mt-2 text-xs text-gray-400">Scan with any UPI app on another device</p></div>

  return (
    <Modal open title={`Pay ₹${co.amount}`} onClose={onClose}>
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-white"><Smartphone className="h-4 w-4 text-brand-400" />Pay with UPI</h3>
        <span className="flex items-center gap-2 text-sm text-gray-400"><Clock className="h-4 w-4" />Complete within <Countdown expiresAt={co.order.expires_at} /></span>
      </div>
      <div className="flex flex-col gap-5">
        {mobile ? <div className="space-y-4">
          <p className="text-sm text-gray-400">Pay on this phone without scanning a QR code.</p>
          <a href={co.upi_uri} className="btn-primary w-full" onClick={checkExpiry}>Choose a UPI app</a>
          <div className="grid gap-2 sm:grid-cols-3">{apps.map((app) => <a key={app.name} href={app.href} className="btn-secondary text-center" onClick={checkExpiry}>{app.name}</a>)}</div>
          <p className="text-xs leading-relaxed text-gray-400">Use an installed app, keep the exact amount, then return to JobPilot. App availability and payment support depend on your phone, browser and UPI provider. Opening an app does not confirm payment.</p>
          <details className="rounded-lg border border-gray-800 p-3"><summary className="cursor-pointer text-sm text-brand-300">Use a QR code instead</summary><div className="mt-3">{qr}</div></details>
        </div> : qr}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-2 pt-1 text-xs text-amber-400"><Spinner className="h-3 w-3" />Waiting for your payment of <b>₹{co.amount}</b>.</p>
          {pollError && <p role="alert" className="text-xs text-rose-400">{pollError}</p>}
        </div>
      </div>
    </div>
    </Modal>
  )
}

export default function Billing() {
  const [me, setMe] = useState<BillingMe | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [verified, setVerified] = useState<Order | null>(null)
  const [busy, setBusy] = useState(false)
  const revision = useDataRefresh()
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    const [m, o] = await Promise.all([billingApi.me(), billingApi.orders()])
    if (id !== loadId.current) return
    setMe(m)
    setOrders(o)
  }, [])
  useEffect(() => {
    load().catch((e) => toast.error(errorMessage(e)))
    return () => { loadId.current++ }
  }, [revision, load])

  const start = async () => {
    setBusy(true)
    try {
      setVerified(null)
      setCheckout(await billingApi.createOrder())
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const done = useCallback((o: Order) => {
    setCheckout(null)
    setVerified(o)
    notifyDataChanged()
  }, [])

  const expired = useCallback(() => {
    setCheckout(null)
    toast.error('Order expired or closed. Start a new one.')
    load().catch((e) => toast.error(errorMessage(e)))
  }, [load])

  const invoice = (o: Order) => billingApi.downloadInvoice(o).catch((e) => toast.error(errorMessage(e)))

  if (!me) return <PageLoader variant="cards" />
  const pro = me.plan === 'pro'
  const common = ['Live job feed', 'Application tracking']

  return (
    <>
      <PageHeader title="Plans" subtitle={pro ? `Pro is active until ${new Date(me.plan_expires_at!).toLocaleDateString()}` : 'Upgrade to apply to more jobs every day.'} />

      {verified && (
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 border-emerald-500/40 p-5">
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-10 w-10 text-emerald-400" />
            <div>
              <p className="text-lg font-semibold text-white">Payment verified</p>
              <p className="text-sm text-gray-400">Pro is unlocked. Invoice {verified.invoice_no} was emailed to you.</p>
            </div>
          </div>
          <button onClick={() => invoice(verified)} className="btn-primary flex items-center gap-2"><Download className="h-4 w-4" />Download invoice</button>
        </div>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        {[
          { name: 'Free', price: '₹0', active: !pro, list: [`${me.free.total_auto_apply} auto-applies free`, ...common] },
          { name: 'Pro', price: `₹${me.price_inr} / ${me.pro_days} days`, active: pro, list: [`${me.pro.daily_auto_apply} auto-applies per day`, ...common, 'Priority matching'] },
        ].map((p) => (
          <div key={p.name} className={`card p-5 sm:p-7 ${p.name === 'Pro' ? 'plan-premium' : ''}`}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-white">{p.name === 'Pro' && <Crown className="h-4 w-4 text-amber-400" />}{p.name}</h3>
              {p.active && <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-medium text-brand-400">Current plan</span>}
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{p.price}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-300">
              {p.list.map((l) => <li key={l} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" />{l}</li>)}
            </ul>
            {p.name === 'Pro' && !checkout && (
              <button onClick={start} disabled={busy || !me.upi_configured} className="btn-primary mt-4 w-full">
                {busy ? <Spinner /> : pro ? 'Extend Pro' : 'Upgrade to Pro'}
              </button>
            )}
            {p.name === 'Pro' && !me.upi_configured && <p className="mt-2 text-xs text-gray-500">Payments are not set up yet. Please contact the admin.</p>}
          </div>
        ))}
      </div>

      <div className="card mb-5 p-4 text-sm text-gray-300">
        {me.lifetime_limit != null ? (
          <>Free plan: <b className="text-white">{me.lifetime_used}</b> of <b className="text-white">{me.lifetime_limit}</b> auto-applies used. Upgrade for {me.pro.daily_auto_apply} per day.</>
        ) : (
          <>Today: <b className="text-white">{me.applied_today}</b> of <b className="text-white">{me.daily_limit}</b> auto-applies used.</>
        )}
      </div>

      {checkout && <CheckoutPanel co={checkout} onDone={done} onClose={() => setCheckout(null)} onExpired={expired} />}

      {orders.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-semibold text-white">Orders</div>
          <ul className="divide-y divide-gray-800">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-mono text-gray-200">{o.order_ref}</p>
                  <p className="text-xs text-gray-500">₹{(o.unique_amount / 100).toFixed(2)} · {timeAgo(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {o.status === 'PAID' && <button onClick={() => invoice(o)} className="text-xs text-brand-400 hover:underline">Invoice</button>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status]}`}>{o.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
