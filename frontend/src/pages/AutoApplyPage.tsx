// Author: Kishore Kumar
// Auto Apply Jobs - Job Search & Automation Page
import { useState } from 'react'
import {
  Zap,
  CheckCircle2,
  MapPin,
  Briefcase,
  DollarSign,
  FileText,
  Link2,
  Play,
  Pause,
  Plus,
  Search,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { JobPortalDashboardLayout } from '../components/layout/JobPortalDashboardLayout'
import { Button } from '../components/ui/Button'
import { useJobApplicationsStore, JobOpportunity } from '../store/jobApplicationsStore'

interface ConnectedAccount {
  id: string
  platform: 'LinkedIn' | 'Naukri' | 'Indeed' | 'Glassdoor'
  username: string
  status: 'connected' | 'error' | 'syncing'
}

export function AutoApplyPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([
    { id: '1', platform: 'LinkedIn', username: 'kishore-kumar-dev', status: 'connected' },
    { id: '2', platform: 'Naukri', username: 'kishore.kumar@gmail.com', status: 'connected' },
  ])

  const [roles, setRoles] = useState<string[]>(['Frontend Developer', 'React Developer', 'Full Stack Engineer'])
  const [newRole, setNewRole] = useState('')
  const [searchQuery, setSearchQuery] = useState('Frontend Developer')
  const [searchLocation, setSearchLocation] = useState('Bangalore')

  const [cities, setCities] = useState<string[]>(['Bangalore', 'Hyderabad', 'Remote'])
  const [newCity, setNewCity] = useState('')

  const [minSalary, setMinSalary] = useState('12000000')
  const [expYears, setExpYears] = useState('3-5 years')

  const [isAutoApplyActive, setIsAutoApplyActive] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<JobOpportunity[]>([])
  const { addOpportunity, applyToOpportunity } = useJobApplicationsStore()

  const handleAddRole = () => {
    if (newRole.trim() && !roles.includes(newRole.trim())) {
      setRoles([...roles, newRole.trim()])
      setNewRole('')
    }
  }

  const handleRemoveRole = (roleToRemove: string) => {
    setRoles(roles.filter((r) => r !== roleToRemove))
  }

  const handleAddCity = () => {
    if (newCity.trim() && !cities.includes(newCity.trim())) {
      setCities([...cities, newCity.trim()])
      setNewCity('')
    }
  }

  const handleRemoveCity = (cityToRemove: string) => {
    setCities(cities.filter((c) => c !== cityToRemove))
  }

  const handleSearchJobs = async () => {
    setIsSearching(true)
    const connectedPlatforms = accounts.filter(a => a.status === 'connected').map(a => a.platform.toLowerCase())
    const results = await new Promise<JobOpportunity[]>(resolve => {
      setTimeout(async () => {
        const searchResults: JobOpportunity[] = []
        const sampleJobs = [
          { company: 'TechCorp', job_title: 'Frontend Developer', location: searchLocation || 'Remote' },
          { company: 'DataFlow', job_title: 'React Engineer', location: searchLocation || 'Bangalore' },
          { company: 'NexTech', job_title: 'Full Stack Developer', location: searchLocation || 'Hyderabad' },
        ]

        sampleJobs.forEach((job, idx) => {
          if (!connectedPlatforms.length || connectedPlatforms.some(p => job.company.toLowerCase().includes(p))) {
            searchResults.push({
              id: `opp_${Date.now()}_${idx}`,
              company: job.company,
              job_title: job.job_title,
              location: job.location,
              status: 'new' as const,
              job_link: `https://${job.company.toLowerCase()}.com/job/${idx}`,
              source: 'LinkedIn' as any,
              matched_at: new Date().toISOString()
            })
          }
        })
        resolve(searchResults)
      }, 1000)
    })
    setSearchResults(results)
    setIsSearching(false)
  }

  const handleApplyAll = () => {
    searchResults.forEach(opp => {
      addOpportunity(opp)
      applyToOpportunity(opp.id)
    })
    setSearchResults([])
  }

  return (
    <JobPortalDashboardLayout title="Auto Apply Jobs">
      <div className="space-y-8">
        {/* Auto Apply Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-primary-500/20 bg-primary-500/10 p-6">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-100">
              <Zap className="h-5 w-5 text-primary-400" />
              Automated Job Application Engine
            </h2>
            <p className="text-sm text-gray-400">
              Connect your accounts and set preferences. The bot will automatically find and apply to relevant jobs.
            </p>
          </div>
          <Button
            variant={isAutoApplyActive ? 'secondary' : 'primary'}
            onClick={() => setIsAutoApplyActive(!isAutoApplyActive)}
            className="flex shrink-0 items-center gap-2"
          >
            {isAutoApplyActive ? (
              <>
                <Pause className="h-4 w-4" /> Pause Auto-Apply
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Start Auto-Apply
              </>
            )}
          </Button>
        </div>

        {/* Resume Section */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary-400" />
            1. Master Resume
          </h3>
          <p className="text-xs text-gray-400">
            Upload your latest resume. Our AI parser extracts skills and experience to fill out application forms accurately.
          </p>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 flex-1">
              <FileText className="h-5 w-5 text-emerald-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200">Kishore_Kumar_Resume_2026.pdf</p>
                <p className="text-xs text-emerald-400">Parsed & Ready for Applications</p>
              </div>
            </div>
          </div>
        </div>

        {/* Connected Platforms */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary-400" />
            2. Social & Job Portal Accounts
          </h3>
          <p className="text-xs text-gray-400">
            Connect your accounts so the auto-apply agent can submit applications natively through your profiles.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['LinkedIn', 'Naukri', 'Indeed', 'Glassdoor'].map((platform) => {
              const acc = accounts.find((a) => a.platform === platform)
              return (
                <div
                  key={platform}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/40 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-300 font-bold text-xs">
                      {platform[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-200">{platform}</p>
                      {acc ? (
                        <p className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {acc.username}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">Not connected</p>
                      )}
                    </div>
                  </div>

                  {acc ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-red-400 hover:text-red-300"
                      onClick={() => setAccounts(accounts.filter((a) => a.platform !== platform))}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        setAccounts([
                          ...accounts,
                          {
                            id: Date.now().toString(),
                            platform: platform as any,
                            username: 'connected_user',
                            status: 'connected',
                          },
                        ])
                      }
                    >
                      Connect
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Job Search */}
        {isAutoApplyActive && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-6">
            <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
              <Search className="h-4 w-4 text-primary-400" />
              Job Search
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium text-gray-400">Job Title / Keywords</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Frontend Developer"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-400">Location</label>
                <input
                  type="text"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  placeholder="e.g. Bangalore, Remote"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleSearchJobs}
              disabled={isSearching || !searchQuery.trim()}
              className="w-full md:w-auto"
            >
              {isSearching ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {isSearching ? 'Searching...' : 'Find Jobs'}
            </Button>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && isAutoApplyActive && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary-400" />
              Found Jobs ({searchResults.length})
            </h3>

            {searchResults.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/40 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-200">{job.job_title}</p>
                  <p className="text-xs text-gray-400">{job.company} • {job.location}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => applyToOpportunity(job.id)}
                  className="text-xs"
                >
                  Apply
                </Button>
              </div>
            ))}

            <Button
              variant="primary"
              onClick={handleApplyAll}
              className="w-full"
            >
              Apply to All Found Jobs
            </Button>
          </div>
        )}

        {/* Application Preferences */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-6">
          <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary-400" />
            3. Application Preferences
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-primary-400" /> Target Roles
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Backend Engineer"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
                />
                <Button size="sm" variant="secondary" onClick={handleAddRole}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-800 border border-gray-700 px-2.5 py-1 text-xs text-gray-200"
                  >
                    {r}
                    <button onClick={() => handleRemoveRole(r)} className="hover:text-red-400">
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary-400" /> Target Locations / Cities
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Pune"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCity()}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
                />
                <Button size="sm" variant="secondary" onClick={handleAddCity}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {cities.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-800 border border-gray-700 px-2.5 py-1 text-xs text-gray-200"
                  >
                    {c}
                    <button onClick={() => handleRemoveCity(c)} className="hover:text-red-400">
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary-400" /> Minimum Expected Salary (INR / annum)
              </label>
              <input
                type="text"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 focus:border-primary-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-primary-400" /> Experience Level
              </label>
              <select
                value={expYears}
                onChange={(e) => setExpYears(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 focus:border-primary-500 focus:outline-none"
              >
                <option value="0-1 years">Entry Level (0-1 years)</option>
                <option value="1-3 years">Junior (1-3 years)</option>
                <option value="3-5 years">Mid Level (3-5 years)</option>
                <option value="5+ years">Senior (5+ years)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-4">
          <Button variant="primary" onClick={() => alert('Auto-Apply preferences saved successfully!')} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Save All Preferences
          </Button>
        </div>
      </div>
    </JobPortalDashboardLayout>
  )
}