// Author: Kishore Kumar
import { apiClient } from './client'

export interface Job {
  id: number
  title: string
  company: string
  location?: string | null
  description?: string | null
  external_link?: string | null
  application_date?: string | null
  created_at: string
  updated_at: string
}

export interface JobCreate {
  title: string
  company: string
  location?: string | null
  description?: string | null
  external_link?: string | null
  application_date?: string | null
}

export interface JobResponse {
  id: number
  title: string
  company: string
  location?: string | null
  description?: string | null
  external_link?: string | null
  application_date?: string | null
  created_at: string
  updated_at: string
}

export async function getJobs(page = 0, pageSize = 50): Promise<JobResponse[]> {
  const { data } = await apiClient.get<JobResponse[]>('/jobs', {
    params: { skip: page * pageSize, limit: pageSize }
  })
  return data
}

export async function getJob(jobId: number): Promise<JobResponse> {
  const { data } = await apiClient.get<JobResponse>(`/jobs/${jobId}`)
  return data
}

export async function createJob(jobData: JobCreate): Promise<JobResponse> {
  const { data } = await apiClient.post<JobResponse>('/jobs', jobData)
  return data
}

export async function updateJob(jobId: number, jobData: Partial<JobCreate>): Promise<JobResponse> {
  const { data } = await apiClient.patch<JobResponse>(`/jobs/${jobId}`, jobData)
  return data
}

export async function deleteJob(jobId: number): Promise<void> {
  await apiClient.delete(`/jobs/${jobId}`)
}