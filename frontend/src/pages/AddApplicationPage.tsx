// Author: Kishore Kumar
// Add/Edit Job Application Page
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { JobPortalDashboardLayout } from '../components/layout/JobPortalDashboardLayout'
import { useJobApplicationsStore } from '../store/jobApplicationsStore'
import { JobApplication, ApplicationStatus } from '@/types'
import { Plus } from 'lucide-react'

const STATUS_OPTIONS: ApplicationStatus[] = ['Applied', 'Interview Scheduled', 'Offer Received', 'Rejected', 'Withdrawn']

interface ApplicationFormData {
  company: string
  job_title: string
  location: string
  status: ApplicationStatus
  applied_date: string
  job_link?: string
  resume_version?: string
  notes?: string
}

export function AddApplicationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { applications, addApplication, updateApplication } = useJobApplicationsStore()

  const isEdit = !!id
  const existingApp = applications.find(a => a.id === id)

  const [formData, setFormData] = useState<ApplicationFormData>({
    company: '',
    job_title: '',
    location: '',
    status: 'Applied',
    applied_date: new Date().toISOString().split('T')[0],
    job_link: '',
    resume_version: '',
    notes: '',
  })

  useEffect(() => {
    if (isEdit && existingApp) {
      setFormData({
        company: existingApp.company,
        job_title: existingApp.job_title,
        location: existingApp.location,
        status: existingApp.status,
        applied_date: existingApp.applied_date.split('T')[0],
        job_link: existingApp.job_link || '',
        resume_version: existingApp.resume_version || '',
        notes: existingApp.notes || '',
      })
    }
  }, [isEdit, existingApp])

  const handleSubmit = () => {
    if (!formData.company || !formData.job_title) {
      return
    }

    if (isEdit && id) {
      updateApplication(id, formData)
    } else {
      const newApp: JobApplication = {
        ...formData,
        id: crypto.randomUUID(),
      }
      addApplication(newApp)
    }
    navigate('/jobs')
  }

  const handleCancel = () => {
    navigate('/jobs')
  }

  return (
    <JobPortalDashboardLayout title={isEdit ? 'Edit Application' : 'Add Application'}>
      <div className="max-w-2xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-400">Company</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Company name"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Job Title</label>
              <input
                type="text"
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                placeholder="Job title"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="City, State / Remote"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ApplicationStatus })}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                {STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Applied Date</label>
              <input
                type="date"
                value={formData.applied_date}
                onChange={(e) => setFormData({ ...formData, applied_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-400">Job Link</label>
              <input
                type="url"
                value={formData.job_link}
                onChange={(e) => setFormData({ ...formData, job_link: e.target.value })}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Resume Version</label>
              <input
                type="text"
                value={formData.resume_version}
                onChange={(e) => setFormData({ ...formData, resume_version: e.target.value })}
                placeholder="Resume filename or version"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any notes about this application..."
                rows={4}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary-500 focus:outline-none resize-y"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.company || !formData.job_title}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-500 px-4 py-2 text-sm font-medium text-primary-400 transition-colors hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isEdit ? 'Save Changes' : 'Add Application'}
          </button>
        </div>
      </div>
    </JobPortalDashboardLayout>
  )
}