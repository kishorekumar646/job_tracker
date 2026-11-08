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
  Lightbulb,
  Target,
  TrendingUp,
  Sparkles,
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

interface InsightCardProps {
  icon: React.ReactNode
  title: string
  value: string
  tip: string
}

function InsightCard({ icon, title, value, tip }: InsightCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2 bg-primary-500/10 text-primary-400">
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400">{title}</p>
          <p className="text-sm font-semibold text-gray-200">{value}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 ml-7">{tip}</p>
    </div>
  )
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

function StatCard({ title, value, color, insight }: {
  title: string
  value: number
  color: keyof typeof COLOR_MAP
  insight?: string
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
          {insight && (
            <p className="mt-1 text-xs text-gray-500">{insight}</p>
          )}
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

  // Calculate insights
  const firstApplied = applications.length > 0
    ? applications.reduce((minDate, app) => new Date(app.applied_date) < new Date(minDate) ? app.applied_date : minDate, applications[0].applied_date)
    : null
  const successRate = applications.filter(a => a.status === 'Offer Received').length / (applications.length || 1) * 100
  const avgApplicationsPerWeek = applications.length / ((new Date().getTime() - new Date(firstApplied || new Date().toISOString()).getTime()) / (7 * 24 * 60 * 60 * 1000) || 1)

  return (
    <JobPortalDashboardLayout title="My Applications">
      <div className="space-y-6">
        {/* Premium Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Applications"
            value={applications.length}
            color="indigo"
            insight={applications.length > 0 ? `${avgApplicationsPerWeek.toFixed(1)} per week` : 'Start applying today!'}
          />
          <StatCard
            title="Applications Sent"
            value={applications.filter(a => a.status === 'Applied').length}
            color="blue"
            insight={applications.length > 0 ? 'Awaiting response' : 'No applications yet'}
          />
          <StatCard
            title="Interviews"
            value={applications.filter(a => a.status === 'Interview Scheduled').length}
            color="cyan"
            insight={applications.filter(a => a.status === 'Interview Scheduled').length > 0 ? 'Booked!' : 'Get noticed!'}
          />
          <StatCard
            title="Offers"
            value={applications.filter(a => a.status === 'Offer Received').length}
            color="emerald"
            insight={successRate > 0 ? `Success rate: ${successRate.toFixed(0)}%` : 'Build your track record'}
          />
        </div>

        {/* Application Insights & Tips */}
        {applications.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InsightCard
              icon={<Target className="h-5 w-5" />}
              title="Your Top Locations"
              value="Bangalore"
              tip="You've applied most in Bangalore. Ready to expand your search?"
            />
            <InsightCard
              icon={<TrendingUp className="h-5 w-5" />}
              title="Application Cadence"
              value="Every 5-7 days"
              tip="Try to apply 2-3 times per week for best results"
            />
            <InsightCard
              icon={<Lightbulb className="h-5 w-5" />}
              title="Skill Match"
              value="85%"
              tip="Your resume skills match 85% of job requirements in your profile"
            />
          </div>
        )}

        {/* Search & Filter Bar */}
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

        {/* Applications Table or Empty State */}
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

        {/* Pagination */}
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
      <div className="mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 mb-4">
          <Sparkles className="h-8 w-8 text-indigo-400" />
        </div>
      </div>
      <h3 className="text-2xl font-semibold text-gray-200 mb-3">
        {searchQuery || statusFilter !== 'ALL' ? 'No matches found' : 'Your job search starts here!'}
      </h3>
      {searchQuery || statusFilter !== 'ALL' ? (
        <p className="text-gray-400 mb-6 max-w-sm mx-auto">
          No applications match your search. Try adjusting your filters or check back later when new opportunities arrive.
        </p>
      ) : (
        <p className="text-gray-400 mb-6 max-w-sm mx-auto">
          Track your job applications in one place. Get insights on your applications, interview rates, and offer conversions.
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg border border-primary-500 px-5 py-2.5 text-sm font-medium text-primary-400 transition-colors hover:bg-primary-500/10"
        >
          <Plus className="h-4 w-4" />
          Add First Application
        </button>
        <button
          onClick={() => window.location.href = '/applications/new'}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800"
        >
          <Lightbulb className="h-4 w-4" />
          View Tips
        </button>
      </div>
    </div>
  )
}