// Author: Kishore Kumar
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Cake, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, Copy, Crown, Eye, Gift, MailCheck, Pencil, RefreshCw, Search,
  ShieldCheck, ShieldOff, Trash2, UserCheck, UserPlus, UserX, Users, Wifi, X as XIcon,
} from 'lucide-react'
import { adminApi, type AdminTotpResult, type AdminUser, type AdminUserDetail } from '../api'
import { errorMessage } from '../api/client'
import { Field, FilterBar, FilterChips, FilterField, Modal, PageLoader, Spinner, Toggle } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'
import { useDataRefresh } from '../hooks/useDataRefresh'

const PAGE_SIZE = 10
const GRID = 'grid grid-cols-2 gap-3 xl:grid-cols-[minmax(190px,1fr)_130px_90px_110px_130px_110px_176px]'
type RoleFilter = 'all' | 'user' | 'admin'
type StatusFilter = 'all' | 'pending' | 'active' | 'inactive' | 'online' | 'offline'
type SortField = 'email' | 'created_at'
type Action = 'delete' | 'status' | 'role' | 'totp' | 'pro'
type Pending = { action: Action; user: AdminUser }

function presence(lastSeen: string | null): 'online' | 'away' | 'offline' {
  if (!lastSeen) return 'offline'
  const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000
  return mins < 5 ? 'online' : mins < 30 ? 'away' : 'offline'
}

function presenceText(lastSeen: string | null): string {
  if (!lastSeen) return 'Never'
  const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000)
  if (mins < 5) return 'Online'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

function fmtDob(dob: string | null) {
  if (!dob) return 'Not set'
  const d = new Date(dob + 'T00:00:00')
  return isNaN(d.getTime()) ? dob : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function SortHeader({ label, field, active, dir, onToggle }: { label: string; field: SortField; active: SortField | null; dir: 'asc' | 'desc'; onToggle: (f: SortField) => void }) {
  return (
    <button onClick={() => onToggle(field)} className="flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300">
      {label}
      {active === field ? (dir === 'asc' ? <ChevronUp className="h-3 w-3 text-brand-400" /> : <ChevronDown className="h-3 w-3 text-brand-400" />) : <ChevronDown className="h-3 w-3 opacity-30" />}
    </button>
  )
}

const ACTION_COLORS = {
  emerald: 'hover:bg-emerald-500/10 hover:text-emerald-400', amber: 'hover:bg-amber-500/10 hover:text-amber-400', brand: 'hover:bg-brand-500/10 hover:text-brand-400',
  gray: 'hover:bg-gray-700 hover:text-gray-200', red: 'hover:bg-red-500/10 hover:text-red-400', sky: 'hover:bg-sky-500/10 hover:text-sky-400',
}
function ActionBtn({ title, icon, color, disabled, onClick }: { title: string; icon: ReactNode; color: keyof typeof ACTION_COLORS; disabled?: boolean; onClick: () => void }) {
  return (
    <button title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800 text-gray-500 transition-colors disabled:cursor-not-allowed disabled:opacity-30 xl:h-7 xl:w-7 ${ACTION_COLORS[color]}`}>
      {icon}
    </button>
  )
}

function QrModal({ result, onClose }: { result: AdminTotpResult | null; onClose: () => void }) {
  return (
    <Modal open={!!result} title="Authenticator QR code" onClose={onClose}>
      {result && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-gray-400">{result.message}</p>
          <img src={result.qr_code} alt="Authenticator QR code" className="mx-auto h-48 w-48 rounded-xl bg-white p-2" />
          <p className="text-xs text-gray-500">{result.user.email}</p>
          <p className="break-all rounded-lg bg-gray-800 px-3 py-2 font-mono text-xs text-gray-300">{result.totp_secret}</p>
          <p className="text-xs text-amber-400">This is shown only once — share it securely.</p>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  )
}

function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: AdminTotpResult) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [busy, setBusy] = useState(false)
  const emailErr = email !== '' && !/^[^\s@]+@gmail\.com$/i.test(email) ? 'Enter a valid @gmail.com address' : ''
  const valid = email !== '' && !emailErr

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      onCreated(await adminApi.create({ email: email.trim(), name: name.trim() || undefined, role }))
      setEmail(''); setName(''); setRole('user')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Gmail address" error={emailErr}><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@gmail.com" /></Field>
        <Field label="Full name (optional)"><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Kishore Kumar" /></Field>
        <div className="flex items-center justify-between rounded-xl border border-gray-800 p-3.5">
          <div>
            <p className="text-sm font-semibold text-gray-100">Admin access</p>
            <p className="text-xs text-gray-400">{role === 'admin' ? 'Can manage users and send announcements' : 'Regular member'}</p>
          </div>
          <Toggle checked={role === 'admin'} onChange={(v) => setRole(v ? 'admin' : 'user')} label="Admin access" />
        </div>
        <button className="btn-primary w-full" disabled={!valid || busy}>{busy && <Spinner />}Create & show QR</button>
      </form>
    </Modal>
  )
}

function DetailsModal({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const [data, setData] = useState<AdminUserDetail | null>(null)
  const revision = useDataRefresh()
  useEffect(() => { setData(null) }, [userId])
  useEffect(() => {
    if (userId == null) return
    let active = true
    adminApi.details(userId).then((details) => { if (active) setData(details) }).catch((e) => { if (active) { toast.error(errorMessage(e)); onClose() } })
    return () => { active = false }
  }, [userId, onClose, revision])
  const chips = (items: string[], empty: string) => items.length
    ? <div className="flex flex-wrap gap-1.5">{items.map((s) => <span key={s} className="rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-300">{s}</span>)}</div>
    : <p className="text-xs italic text-gray-600">{empty}</p>
  return (
    <Modal open={userId != null} title="User profile" onClose={onClose}>
      {!data ? <PageLoader variant="form" /> : (
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold text-gray-100">{data.user.name || data.user.email.split('@')[0]}</p>
            <p className="text-xs text-gray-500">{data.user.email}{data.user.email_verified ? ' · email verified' : ' · email not verified'}</p>
            {data.headline && <p className="mt-1 text-xs text-gray-400">{data.headline}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-gray-500">Location</dt><dd className="text-gray-200">{data.location || '—'}</dd></div>
            <div><dt className="text-gray-500">Experience</dt><dd className="text-gray-200">{data.experience_years != null ? `${data.experience_years} yrs` : '—'}</dd></div>
            <div><dt className="text-gray-500">Resume</dt><dd className="truncate text-gray-200">{data.resume_filename || 'Not uploaded'}</dd></div>
            <div><dt className="text-gray-500">Auto-apply</dt><dd className="text-gray-200">{data.auto_apply_enabled ? 'On' : 'Off'}</dd></div>
          </dl>
          <div><p className="mb-1.5 text-xs text-gray-500">Skills</p>{chips(data.skills, 'No skills yet')}</div>
          <div><p className="mb-1.5 text-xs text-gray-500">Preferred titles</p>{chips(data.job_titles, 'None set')}</div>
          <div><p className="mb-1.5 text-xs text-gray-500">Connected platforms</p>{chips(data.platforms, 'None connected')}</div>
          <div><p className="mb-1.5 text-xs text-gray-500">Applications ({data.user.applications})</p>{chips(Object.entries(data.status_counts).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`), 'No applications')}</div>
          <p className="rounded-lg bg-gray-800/60 px-3 py-2 text-[11px] text-gray-400">This view is read-only. Secrets such as authenticator keys, resume contents and phone numbers are never shown.</p>
        </div>
      )}
    </Modal>
  )
}

export function UsersTab() {
  const me = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [proDays, setProDays] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [statusF, setStatusF] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortField | null>(null)
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [qr, setQr] = useState<AdminTotpResult | null>(null)
  const [confirm, setConfirm] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [nameVal, setNameVal] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const revision = useDataRefresh()
  const loadId = useRef(0)
  const closeView = useCallback(() => setViewing(null), [])

  const load = useCallback(async () => {
    const id = ++loadId.current
    try {
      const d = await adminApi.list()
      if (id === loadId.current) { setUsers(d.users); setProDays(d.pro_days) }
    } catch (e) { if (id === loadId.current) toast.error(errorMessage(e)) }
  }, [])
  useEffect(() => {
    load()
    return () => { loadId.current++ }
  }, [load, revision])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (users ?? []).filter((u) => {
      const p = presence(u.last_seen)
      const okStatus =
        statusF === 'all' ||
        (statusF === 'pending' && u.is_active && !u.is_approved) ||
        (statusF === 'active' && u.is_active && u.is_approved) ||
        (statusF === 'inactive' && !u.is_active) ||
        (statusF === 'online' && p === 'online') ||
        (statusF === 'offline' && p !== 'online')
      return okStatus && (role === 'all' || u.role === role) && (!q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q))
    })
    if (!sort) return list
    const sign = dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => sign * String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')))
  }, [users, search, role, statusF, sort, dir])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])

  if (!users) return <PageLoader variant="table" />

  const pending = users.filter((u) => u.is_active && !u.is_approved).length
  const toggleSort = (f: SortField) => { if (sort === f) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSort(f); setDir('asc') }; setPage(1) }
  const copy = (u: AdminUser) => navigator.clipboard.writeText(u.email).then(() => { setCopied(u.id); setTimeout(() => setCopied(null), 1800) })

  const saveName = async (u: AdminUser) => {
    try {
      await adminApi.setName(u.id, nameVal.trim() || null)
      setEditing(null)
      toast.success('Name updated.')
      await load()
    } catch (e) { toast.error(errorMessage(e)) }
  }

  const run = async () => {
    if (!confirm) return
    const { action, user } = confirm
    setBusy(true)
    try {
      if (action === 'delete') { await adminApi.remove(user.id); toast.success('User deleted.') }
      else if (action === 'status') { await adminApi.toggleStatus(user.id); toast.success(user.is_active ? 'User deactivated.' : 'User activated.') }
      else if (action === 'role') { await adminApi.setRole(user.id, user.role === 'admin' ? 'user' : 'admin'); toast.success('Role updated.') }
      else if (action === 'pro') { await adminApi.grantPro(user.id); toast.success('Pro access updated.') }
      else setQr(await adminApi.resetTotp(user.id))
      setConfirm(null)
      await load()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }

  const label = ({ action, user: u }: Pending) => ({
    delete: `Delete ${u.email} and all their data? This cannot be undone.`,
    status: `${u.is_active ? 'Deactivate' : 'Activate'} ${u.email}?`,
    role: `Make ${u.email} ${u.role === 'admin' ? 'a member' : 'an admin'}? They will be notified.`,
    totp: `Reset the authenticator for ${u.email}? Their current app code will stop working and all device passkeys will be revoked.`,
    pro: `Grant ${proDays} days of Pro to ${u.email} without a payment?${u.plan === 'pro' ? ' This extends their current Pro expiry.' : ''} They will be notified.`,
  })[action]

  const stats = [
    { label: 'Total Users', value: users.length, cls: 'bg-brand-500/10 text-brand-400 border-brand-500/20', icon: <Users className="h-4 w-4" /> },
    { label: 'Not Activated', value: pending, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock className="h-4 w-4" /> },
    { label: 'Active', value: users.filter((u) => u.is_active).length, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <UserCheck className="h-4 w-4" /> },
    { label: 'Inactive', value: users.filter((u) => !u.is_active).length, cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: <UserX className="h-4 w-4" /> },
    { label: 'Admins', value: users.filter((u) => u.role === 'admin').length, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Crown className="h-4 w-4" /> },
    { label: 'Online', value: users.filter((u) => presence(u.last_seen) === 'online').length, cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: <Wifi className="h-4 w-4" /> },
  ]
  const filtersOn = search || role !== 'all' || statusF !== 'all'

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-3 py-3 transition-colors hover:border-gray-700 sm:gap-3 sm:px-4">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${s.cls}`}>{s.icon}</div>
            <div><p className="text-lg font-bold text-gray-100">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
          </div>
        ))}
      </div>

      <FilterBar active={!!filtersOn} onClear={() => { setSearch(''); setRole('all'); setStatusF('all'); setPage(1) }} summary={`${filtered.length} of ${users.length} user${users.length === 1 ? '' : 's'}`}>
        <FilterField label="Search users"><div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <input type="search" className="input pl-9" placeholder="Search by email or name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div></FilterField>
        <FilterChips label="Role" value={role} onChange={(value) => { setRole(value); setPage(1) }} options={[{ value: 'all', label: 'All roles' }, { value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }]} />
        <FilterChips label="Account status" value={statusF} onChange={(value) => { setStatusF(value); setPage(1) }} options={(['all', 'pending', 'active', 'inactive', 'online', 'offline'] as const).map((s) => ({ value: s, label: s === 'all' ? 'All statuses' : s === 'pending' ? `Not activated${pending ? ` (${pending})` : ''}` : s[0].toUpperCase() + s.slice(1) }))} />
        <button className="btn-primary btn-sm ml-auto" onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" />Add user</button>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <div className="xl:min-w-[1010px]">
          <div className={`hidden ${GRID} border-b border-gray-800 bg-gray-800/40 px-5 py-3 xl:grid`}>
            <SortHeader label="User" field="email" active={sort} dir={dir} onToggle={toggleSort} />
            {['Date of Birth', 'Role', 'Status', 'Last Seen'].map((h) => <span key={h} className="text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</span>)}
            <SortHeader label="Created At" field="created_at" active={sort} dir={dir} onToggle={toggleSort} />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</span>
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-600">
              <Users className="h-10 w-10" />
              <p className="text-sm">{users.length > 0 ? 'No users match the current filters.' : 'No users found.'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {shown.map((u) => {
                const self = u.id === me?.id
                const p = presence(u.last_seen)
                const created = u.created_at ? new Date(u.created_at) : null
                return (
                  <div key={u.id} className={`${GRID} items-center px-5 py-4 transition-colors hover:bg-brand-500/5`}>
                    <div className="col-span-2 min-w-0 xl:col-span-1">
                      {editing === u.id ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={nameVal} maxLength={120} onChange={(e) => setNameVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveName(u); if (e.key === 'Escape') setEditing(null) }} placeholder="Full name" className="h-7 min-w-0 flex-1 rounded border border-brand-500 bg-gray-800 px-2 text-xs text-gray-100 focus:outline-none" />
                          <button onClick={() => saveName(u)} title="Save" className="shrink-0 text-emerald-400 hover:text-emerald-300"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditing(null)} title="Cancel" className="shrink-0 text-gray-500 hover:text-gray-300"><XIcon className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <div className="group/name flex items-center gap-1.5">
                          {self && <Crown aria-label="You" className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                          <span className={`truncate text-sm font-medium ${u.name ? 'text-gray-200' : 'italic text-gray-600'}`}>{u.name || 'Not set'}</span>
                          <button onClick={() => { setEditing(u.id); setNameVal(u.name ?? '') }} title="Edit full name" className="shrink-0 p-1 text-gray-600 transition-opacity hover:text-brand-400 xl:opacity-0 xl:group-hover/name:opacity-100"><Pencil className="h-3 w-3" /></button>
                        </div>
                      )}
                      <div className="group mt-0.5 flex items-center gap-1.5">
                        <p className="truncate text-xs text-gray-400" title={u.email}>{u.email}</p>
                        {u.email_verified && <MailCheck className="h-3 w-3 shrink-0 text-emerald-400" aria-label="Email verified" />}
                        <button title="Copy email" onClick={() => copy(u)} className="shrink-0 p-1 text-gray-600 transition-opacity hover:text-gray-300 xl:opacity-0 xl:group-hover:opacity-100">{copied === u.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3 w-3" />}</button>
                      </div>
                      <p className={`mt-1 text-[11px] ${u.plan === 'pro' ? 'text-amber-400' : 'text-gray-500'}`}>
                        {u.plan === 'pro' && u.plan_expires_at ? `Pro · until ${new Date(u.plan_expires_at).toLocaleDateString()}` : 'Free plan'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] text-gray-500 xl:hidden">Date of birth</p>
                      <div className="flex min-w-0 items-center gap-1.5">
                        {u.date_of_birth && <Cake className="h-3 w-3 shrink-0 text-pink-400" />}
                        <span className={`truncate text-xs ${u.date_of_birth ? 'text-gray-300' : 'italic text-gray-600'}`}>{fmtDob(u.date_of_birth)}</span>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] text-gray-500 xl:hidden">Role</p>
                      {u.role === 'admin'
                        ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/40"><Crown className="h-3 w-3" /> Admin</span>
                        : <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-700/40 px-2.5 py-1 text-xs font-medium text-gray-400 ring-1 ring-gray-600/30"><Users className="h-3 w-3" /> User</span>}
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] text-gray-500 xl:hidden">Status</p>
                      {!u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500"><span className="h-2 w-2 shrink-0 rounded-full bg-gray-600" />Inactive</span>
                      ) : !u.is_approved ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300"><span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />Not activated</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                          <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>Active
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-[10px] text-gray-500 xl:hidden">Last seen</p>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${p === 'online' ? 'bg-emerald-400' : p === 'away' ? 'bg-amber-400' : 'bg-gray-600'}`} />
                        <span className={`text-xs font-medium ${p === 'online' ? 'text-emerald-400' : p === 'away' ? 'text-amber-400' : 'text-gray-500'}`}>{presenceText(u.last_seen)}</span>
                      </div>
                    </div>

                    <p className="text-xs leading-snug text-gray-500" title={created?.toLocaleString()}>
                      <span className="mb-1 block text-[10px] xl:hidden">Created at</span>
                      {created ? created.toLocaleDateString() : '—'}
                      <span className="block text-[11px] text-gray-600">{created ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </p>

                    <div className="col-span-2 flex flex-wrap items-center gap-1.5 xl:col-span-1">
                      <ActionBtn title="View profile" color="sky" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setViewing(u.id)} />
                      <ActionBtn title={u.plan === 'pro' ? 'Extend Pro' : 'Grant Pro'} color="amber" icon={<Gift className="h-3.5 w-3.5" />} onClick={() => setConfirm({ action: 'pro', user: u })} />
                      <ActionBtn title={u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'} color={u.role === 'admin' ? 'amber' : 'brand'} disabled={self} icon={u.role === 'admin' ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />} onClick={() => setConfirm({ action: 'role', user: u })} />
                      <ActionBtn title={u.is_active ? 'Deactivate' : 'Activate'} color="gray" disabled={self} icon={u.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />} onClick={() => setConfirm({ action: 'status', user: u })} />
                      <ActionBtn title="Reset TOTP" color="gray" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setConfirm({ action: 'totp', user: u })} />
                      <ActionBtn title="Delete user" color="red" disabled={self} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirm({ action: 'delete', user: u })} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 px-5 py-3">
              <span className="text-xs text-gray-600">Page {page} of {pages} · showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex max-w-full flex-wrap items-center gap-1">
                <button onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={page === 1} className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)} className={`h-7 w-7 rounded-lg text-xs font-medium transition-colors ${page === n ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}>{n}</button>
                ))}
                <button onClick={() => setPage((n) => Math.min(pages, n + 1))} disabled={page === pages} className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30">Next <ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setQr(r); load() }} />
      <QrModal result={qr} onClose={() => setQr(null)} />
      <DetailsModal userId={viewing} onClose={closeView} />
      <Modal open={!!confirm} title="Please confirm" onClose={() => setConfirm(null)}>
        {confirm && (
          <div className="space-y-5">
            <p className="text-sm text-gray-300">{label(confirm)}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className={confirm.action === 'delete' ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={run}>{busy && <Spinner />}Confirm</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
