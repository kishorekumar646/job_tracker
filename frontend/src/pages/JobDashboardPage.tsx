// Author: Kishore Kumar
import { useEffect, useState } from 'react'
import { Briefcase, FilePlus, FolderOpen, Users } from 'lucide-react'
import { JobPortalDashboardLayout } from '../components/layout/JobPortalDashboardLayout'
import { useAuthStore } from '../store/authStore'
import { getJobs, Job } from '../api/jobs'
import { Button } from '../components/ui/Button'

export function JobDashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { user } = useAuthStore()

  useEffect(() => {
    getJobs(0, 50)
      .then(setJobs)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const totalJobs = jobs.length
  const companies = new Set(jobs.map(j => j.company)).size
  const withLocation = jobs.filter(j => j.location).length

  return (
    <JobPortalDashboardLayout title="Job Dashboard">
      {/* Greeting */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100">
          {user?.name?.split(' ')[0] ?? user?.email?.split('@')[0]}, welcome to Job Tracker!
        </h2>
        <p className="mt-1 text-gray-400">
          Track your job applications and manage your career progress.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Briefcase}
          title="Total Jobs"
          value={totalJobs}
          color="indigo"
        />
        <StatCard
          icon={Users}
          title="Companies"
          value={companies}
          color="teal"
        />
        <StatCard
          icon={FolderOpen}
          title="With Location"
          value={withLocation}
          color="amber"
        />
      </div>

      {/* Quick Actions */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-200">Recent Jobs</h3>
        <Button size="sm" variant="primary">
          <FilePlus className="h-4 w-4 mr-1.5" />
          Add Job
        </Button>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="space-y-2">
                <div className="h-6 w-3/4 rounded bg-gray-800 animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-gray-800 animate-pulse" />
                <div className="h-3 w-full rounded bg-gray-800 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          Failed to load jobs. Please try again.
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 p-8 text-center">
          <Briefcase className="h-8 w-8 mx-auto text-gray-600 mb-2" />
          <p className="text-gray-400">No jobs found. Start adding job applications!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.slice(0, 6).map(job => (
            <div key={job.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-100">{job.title}</h4>
                  <p className="text-sm text-gray-400">{job.company}</p>
                  {job.location && (
                    <p className="text-xs text-gray-500">{job.location}</p>
                  )}
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                  OPEN
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </JobPortalDashboardLayout>
  )
}

interface StatCardProps {
  icon: React.ElementType
  title: string
  value: number | string
  color: 'indigo' | 'teal' | 'amber' | 'emerald' | 'rose' | 'sky' | 'cyan' | 'violet'
}

function StatCard({ icon: Icon, title, value, color }: StatCardProps) {
  const colorClasses = {
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    teal: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    sky: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-primary-700)' }}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClasses[color].split(' ')[0]}`} style={{ border: '1px solid var(--color-primary-500)' }}>
          <Icon className={`h-5 w-5 ${colorClasses[color].split(' ')[2]}`} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-100">{value}</p>
        </div>
      </div>
    </div>
  )
}