// Author: Kishore Kumar
// Job Applications Tracker - My Applications Page
import { useState, useMemo } from 'react'
import {
  Briefcase,
  Calendar,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  Edit3,
  Copy,
  Check,
  Plus,
  Search,
} from 'lucide-react'
import { JobPortalDashboardLayout } from '../components/layout/JobPortalDashboardLayout'
import { useJobApplicationsStore } from '../store/jobApplicationsStore'
import { ApplicationStatus } from '@/types'

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; icon: React.ElementType }> = {
  'Applied': { label: 'Applied', color: 'blue', icon: Calendar },
  'Interview Scheduled': { label: 'Interview Scheduled', color: 'cyan', icon: Calendar },
  'Offer Received': { label: 'Offer Received', color: 'emerald', icon: CheckCircle2 },
  'Rejected': { label: 'Rejected', color: 'red', icon: XCircle },
  'Withdrawn': { label: 'Withdrawn', color: 'gray', icon: Clock },
}

const PAGE_SIZE = 10

const COLOR_MAP: Record<string, { icon: string; text: string; border: string }> = {
  indigo: { icon: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  blue: { icon: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/20' },
  cyan: { icon: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  emerald: { icon: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  red: { icon: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20' },
  gray: { icon: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/20' },
}

function StatCard({ title, value, color }: {
  title: string
  value: number
  color: keyof typeof COLOR_MAP
}) {
  const colors = COLOR_MAP[color]

  const iconMap: Record<string, React.ReactNode> = {
    briefcase: <Briefcase className="h-5 w-5" />,
    calendar: <Calendar className="h-5 w-5" />,
    check_circle: <CheckCircle2 className="h-5 w-5" />,
  }

  return (
    <div className={"rounded-xl border p-5 " + colors.border + " bg-gray-800/50 backdrop-blur relative"}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="mt-1 text-3xl font-bold text-gray-50">{value}</p>
        </div>
        <div className={"rounded-xl p-3 " + colors.icon + " " + colors.text}>
          {iconMap[title.toLowerCase().replace(/\s/g, '_')] ?? <Briefcase className="h-5 w-5" />}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <span className={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-" + config.color + "-500/20 text-" + config.color + "-400 border-" + config.color + "-500/30"}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </span>
  )
}

export function JobHistoryPage() {
  const { applications, deleteApplication } = useJobApplicationsStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'ALL'>('ALL')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filteredApplications = useMemo(() => {
    return applications
      .filter(app => {
        if (statusFilter !== 'ALL' && app.status !== statusFilter) return false
        if (searchQuery.trim() && !app.company.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !app.job_title.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false
        }
        return true
      })
      .sort((a, b) => new Date(b.applied_date).getTime() - new Date(a.applied_date).getTime())
  }, [applications, searchQuery, statusFilter])

  const pagedApplications = filteredApplications.slice(0, PAGE_SIZE)
  const totalPages = Math.ceil(filteredApplications.length / PAGE_SIZE)

  const handleDelete = (id: string) => {
    deleteApplication(id)
  }

  return (
    <JobPortalDashboardLayout title="My Applications">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Applications" value={applications.length} color="indigo" />
          <StatCard title="Applied" value={applications.filter(a => a.status === 'Applied').length} color="blue" />
          <StatCard title="Interviews" value={applications.filter(a => a.status === 'Interview Scheduled').length} color="cyan" />
          <StatCard title="Offers" value={applications.filter(a => a.status === 'Offer Received').length} color="emerald" />
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by company or job title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | 'ALL')}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="ALL">All Statuses</option>
            {(Object.keys(STATUS_CONFIG) as ApplicationStatus[]).map(status => (
              <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>
            ))}
          </select>
          <button
            onClick={() => window.location.href = '/applications/new'}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-500 px-4 py-2 text-sm font-medium text-primary-400 transition-colors hover:bg-primary-500/10"
          >
            <Plus className="h-4 w-4" />
            Add Application
          </button>
        </div>

        {pagedApplications.length === 0 ? (
          <EmptyState searchQuery={searchQuery} statusFilter={statusFilter} onAdd={() => {}} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500">Job Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500">Applied</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pagedApplications.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-200">{app.company}</div>
                      {app.job_link && (
                        <a href={app.job_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-400 flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          View Job
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{app.job_title}</td>
                    <td className="px-4 py-3 text-gray-400">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {app.location}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {new Date(app.applied_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(app.company)
                            setCopiedId(app.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }}
                          className="text-gray-400 hover:text-primary-400 transition-colors"
                          title="Copy company name"
                        >
                          {copiedId === app.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => window.location.href = '/applications/edit/' + app.id}
                          className="text-gray-400 hover:text-primary-400 transition-colors"
                          title="Edit Application"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(app.id)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete Application"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && filteredApplications.length > 0 && (
          <div className="flex justify-center items-center gap-2">
            <button
              onClick={() => {}}
              disabled
              className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="px-3 py-1 text-sm text-gray-400">
              Page 1 of {totalPages}
            </span>
            <button
              onClick={() => {}}
              disabled
              className="flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </JobPortalDashboardLayout>
  )
}

function EmptyState({ searchQuery, statusFilter, onAdd }: {
  searchQuery: string
  statusFilter: ApplicationStatus | 'ALL'
  onAdd: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
      <div className="mb-4">
        <Briefcase className="h-12 w-12 text-gray-600 mx-auto" />
      </div>
      <h3 className="text-lg font-semibold text-gray-200 mb-2">No applications found</h3>
      {searchQuery || statusFilter !== 'ALL' ? (
        <p className="text-gray-400 mb-4">
          No applications match your search. Try adjusting your filters.
        </p>
      ) : (
        <p className="text-gray-400 mb-4">
          You haven't applied to any jobs yet.
        </p>
      )}
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-lg border border-primary-500 px-4 py-2 text-sm font-medium text-primary-400 transition-colors hover:bg-primary-500/10"
      >
        <Plus className="h-4 w-4" />
        Add First Application
      </button>
    </div>
  )
}