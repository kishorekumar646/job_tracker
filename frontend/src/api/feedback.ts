// Author: Kishore Kumar
import { apiClient } from './client'

export interface FeedbackEntry {
  id: number
  user_email: string
  full_name: string | null
  rating: number
  comment: string | null
  created_at: string
}

export interface FeedbackStats {
  total: number
  average_rating: number
  by_rating: Record<number, number>
}

export async function submitFeedback(rating: number, comment: string): Promise<FeedbackEntry> {
  const { data } = await apiClient.post<FeedbackEntry>('/feedback', { rating, comment: comment || null })
  return data
}

export async function listFeedback(): Promise<FeedbackEntry[]> {
  const { data } = await apiClient.get<FeedbackEntry[]>('/feedback')
  return data
}

export async function getFeedbackStats(): Promise<FeedbackStats> {
  const { data } = await apiClient.get<FeedbackStats>('/feedback/stats')
  return data
}
