// Author: Kishore Kumar
import { apiClient } from './client'
import { AppNotification } from '../types'

export async function getMyNotifications(): Promise<AppNotification[]> {
  const { data } = await apiClient.get<AppNotification[]>('/notifications/mine')
  return data
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post('/notifications/mark-all-read')
}

export async function sendAnnouncement(title: string, message: string): Promise<{ ok: boolean; sent_to: number }> {
  const { data } = await apiClient.post<{ ok: boolean; sent_to: number }>('/notifications/announce', { title, message })
  return data
}

export interface AnnouncementRecord {
  message: string | null
  sender_name: string | null
  sender_email: string
  sent_at: string
  recipient_count: number
  read_count: number
}

export interface RecipientStatus {
  full_name: string | null
  email: string
  is_read: boolean
  opted_out: boolean
}

export async function getAnnouncementHistory(): Promise<AnnouncementRecord[]> {
  const { data } = await apiClient.get<AnnouncementRecord[]>('/notifications/announcements')
  return data
}

export async function getAnnouncementRecipients(message: string, senderEmail: string): Promise<RecipientStatus[]> {
  const { data } = await apiClient.get<RecipientStatus[]>('/notifications/announcements/recipients', {
    params: { message, sender: senderEmail },
  })
  return data
}

export async function updateAnnouncementPreference(receiveAnnouncements: boolean): Promise<void> {
  await apiClient.patch('/notifications/preferences', { receive_announcements: receiveAnnouncements })
}

export async function deleteAnnouncement(message: string, senderEmail: string): Promise<void> {
  await apiClient.delete('/notifications/announcements', {
    params: { message, sender: senderEmail },
  })
}
