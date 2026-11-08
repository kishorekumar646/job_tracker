// Author: Kishore Kumar
import { create } from 'zustand'
import { JobApplication } from '@/types'

export interface JobOpportunity {
  id: string
  company: string
  job_title: string
  location: string
  status: 'new' | 'applying' | 'applied' | 'failed'
  job_link: string
  source: 'LinkedIn' | 'Indeed' | 'Naukri' | 'Glassdoor'
  matched_at: string
}

interface JobApplicationsState {
  applications: JobApplication[]
  opportunities: JobOpportunity[]
  addApplication: (app: JobApplication) => void
  updateApplication: (id: string, updates: Partial<JobApplication>) => void
  deleteApplication: (id: string) => void
  clearAll: () => void
  addOpportunity: (opp: JobOpportunity) => void
  applyToOpportunity: (oppId: string) => void
  searchForJobs: (query: string, location: string, platforms: string[]) => Promise<JobOpportunity[]>
  clearOpportunities: () => void
}

const useJobApplicationsStore = create<JobApplicationsState>((set) => ({
  applications: [],
  opportunities: [],

  addApplication: (app) => {
    set((state) => ({
      applications: [...state.applications, app]
    }))
  },

  updateApplication: (id, updates) => {
    set((state) => ({
      applications: state.applications.map(app =>
        app.id === id ? { ...app, ...updates } : app
      )
    }))
  },

  deleteApplication: (id) => {
    set((state) => ({
      applications: state.applications.filter(app => app.id !== id)
    }))
  },

  clearAll: () => {
    set({ applications: [], opportunities: [] })
  },

  addOpportunity: (opp) => {
    set((state) => ({
      opportunities: [...state.opportunities, opp]
    }))
  },

  applyToOpportunity: (oppId) => {
    set((state) => ({
      opportunities: state.opportunities.map(opp =>
        opp.id === oppId ? { ...opp, status: 'applied' } : opp
      ),
      applications: [...state.applications, {
        id: oppId,
        company: state.opportunities.find(o => o.id === oppId)?.company || '',
        job_title: state.opportunities.find(o => o.id === oppId)?.job_title || '',
        location: state.opportunities.find(o => o.id === oppId)?.location || '',
        status: 'Applied',
        applied_date: new Date().toISOString(),
        job_link: state.opportunities.find(o => o.id === oppId)?.job_link || '',
      }]
    }))
  },

  searchForJobs: async (_query, location, platforms) => {
    // Simulate job search API call
    await new Promise(resolve => setTimeout(resolve, 1000))

    const results: JobOpportunity[] = []
    const sampleJobs = [
      { company: 'TechCorp', job_title: 'Frontend Developer', location: location || 'Remote' },
      { company: 'DataFlow', job_title: 'React Engineer', location: location || 'Bangalore' },
      { company: 'NexTech', job_title: 'Full Stack Developer', location: location || 'Hyderabad' },
    ]

    sampleJobs.forEach((job, idx) => {
      if (!platforms.length || platforms.includes(job.company.toLowerCase())) {
        results.push({
          id: `opp_${Date.now()}_${idx}`,
          company: job.company,
          job_title: job.job_title,
          location: job.location,
          status: 'new' as const,
          job_link: `https://${job.company.toLowerCase()}.com/job/${idx}`,
          source: platforms.includes('linkedin') ? 'LinkedIn' : 'Indeed' as any,
          matched_at: new Date().toISOString()
        })
      }
    })

    return results
  },

  clearOpportunities: () => {
    set({ opportunities: [] })
  },
}))

export { useJobApplicationsStore }