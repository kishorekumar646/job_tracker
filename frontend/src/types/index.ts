export interface User {
  id: number;
  email: string;
  name?: string;
  role: "user" | "admin";
  is_admin: boolean;
  notification_count: number;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  location?: string;
  description?: string;
  salary_min_lpa?: number;
  salary_max_lpa?: number;
  job_type?: string;
  experience_min?: number;
  experience_max?: number;
  external_id?: string;
  job_url: string;
  source: string;
  posted_date?: string;
  scraped_at: string;
  is_active: boolean;
  owner_id?: number;
}

export interface Application {
  id: number;
  status: "applied" | "shortlisted" | "interview_scheduled" | "interview_completed" | "offer" | "rejected" | "withdrawn";
  cover_letter?: string;
  notes?: string;
  interview_date?: string;
  offer_salary_lpa?: number;
  applied_at: string;
  updated_at: string;
  job_id: number;
  user_id: number;
  job?: Job;
}

export interface Notification {
  id: number;
  user_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  expires_in: number;
}