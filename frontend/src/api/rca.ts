// Author: Kishore Kumar
import { apiClient } from './client'
import {
  AnalyzeRequest,
  AnalyzeResponse,
  DashboardStats,
  HealthResponse,
  JobStatusResponse,
  RcaVerdict,
  StoredAnalysis,
} from '../types'

export async function analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const { data } = await apiClient.post<AnalyzeResponse>('/rca/analyze', req)
  return data
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const { data } = await apiClient.get<JobStatusResponse>(`/rca/verdicts/${jobId}`)
  return data
}

export async function getVerdictsByRun(runUuid: string): Promise<RcaVerdict[]> {
  const { data } = await apiClient.get<RcaVerdict[]>(`/rca/verdicts/by-run/${runUuid}`)
  return data
}

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/health')
  return data
}

export async function getHistory(
  page = 1,
  pageSize = 100,
  fromDate?: string,
  toDate?: string,
): Promise<StoredAnalysis[]> {
  const { data } = await apiClient.get<StoredAnalysis[]>('/rca/history', {
    params: {
      page,
      page_size: pageSize,
      ...(fromDate && { from_date: fromDate }),
      ...(toDate && { to_date: toDate }),
    },
  })
  return data
}

export async function getDashboardStats(fromDate: string, toDate: string): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>('/rca/stats', {
    params: { from_date: fromDate, to_date: toDate },
  })
  return data
}

export async function deleteHistoryJob(uid: string): Promise<void> {
  await apiClient.delete(`/rca/history/${uid}`)
}

export async function cancelJob(jobId: string): Promise<void> {
  await apiClient.post(`/rca/jobs/${jobId}/cancel`)
}

export async function getAdminHistory(
  email: string,
  startDate?: string,
  endDate?: string,
  page = 1,
  pageSize = 500,
): Promise<StoredAnalysis[]> {
  const { data } = await apiClient.get<StoredAnalysis[]>('/rca/admin/history', {
    params: { email, start_date: startDate, end_date: endDate, page, page_size: pageSize },
  })
  return data
}

export async function submitVerdictFeedback(matchedRule: string, isCorrect: boolean): Promise<void> {
  await apiClient.post('/rca/verdicts/feedback', { matchedRule, isCorrect })
}

export async function getRuleStats(): Promise<import('../types').RuleStats[]> {
  const { data } = await apiClient.get<import('../types').RuleStats[]>('/admin/rules/stats')
  return data
}

export async function overrideRuleConfidence(ruleName: string, override: number | null): Promise<void> {
  await apiClient.patch(`/admin/rules/${encodeURIComponent(ruleName)}/confidence`, { override })
}

export async function getHistoryVerdicts(uid: string): Promise<RcaVerdict[]> {
  const { data } = await apiClient.get<RcaVerdict[]>(`/rca/history/${uid}/verdicts`)
  return data
}

export async function getAdminHistoryVerdicts(uid: string): Promise<RcaVerdict[]> {
  const { data } = await apiClient.get<RcaVerdict[]>(`/rca/admin/history/${uid}/verdicts`)
  return data
}

export async function shareReport(uid: string): Promise<{ reportId: string; url: string }> {
  const { data } = await apiClient.post<{ reportId: string; url: string }>(`/rca/reports/share/${uid}`)
  return data
}
