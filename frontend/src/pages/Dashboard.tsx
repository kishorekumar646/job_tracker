import React, { useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import {
  TrendingUp,
  FileText,
  Users,
  AlertCircle,
  Shield,
  CheckCircle,
  Clock,
  Calendar,
} from "lucide-react";
import { Application, Job } from "../types";

interface Stats {
  totalJobs: number;
  activeJobs: number;
  applications: number;
  interviews: number;
}

interface ShimmerCardProps {
  className?: string;
}

const StatCardShimmer = ({ className }: ShimmerCardProps) => (
  <div className={`rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-lg border border-gray-100 dark:border-gray-700 ${className}`}>
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-4 w-24 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-8 w-16 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
      <div className="h-12 w-12 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
    </div>
  </div>
);

const StatCard = ({ title, value, icon: Icon, change }: any) => (
  <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {title}
        </p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {value}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          {change}
        </p>
      </div>
      <div className="rounded-lg bg-violet-100 dark:bg-violet-900 p-3">
        <Icon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const { user } = useAuthStore();

  const [recentApplications, setRecentApplications] = useState<Application[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);

  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setStatsLoading(true);
      try {
        const [appsRes, jobsRes] = await Promise.all([
          fetch("/api/v1/applications").then((r) => {
            if (!r.ok) throw new Error("Failed to fetch");
            return r.json();
          }).catch(() => []),
          fetch("/api/v1/jobs?limit=5").then((r) => {
            if (!r.ok) throw new Error("Failed to fetch");
            return r.json();
          }).catch(() => []),
        ]);
        const apps = Array.isArray(appsRes) ? appsRes : [];
        const jobs = Array.isArray(jobsRes) ? jobsRes : [];
        setRecentApplications(apps.slice(0, 5));
        setRecentJobs(jobs);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchData();

    // Auto-refresh every 15 seconds
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const stats: Stats = {
    totalJobs: 150 + recentJobs.length,
    activeJobs: 120,
    applications: recentApplications.length,
    interviews: 3,
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      applied: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
      shortlisted: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
      interview_scheduled: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200",
      interview_completed: "bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200",
      offer: "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
      rejected: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
      withdrawn: "bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200",
    };
    return colors[status] || "bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-300 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="mt-3 text-gray-600 dark:text-gray-400 text-lg">
          Welcome back, {user?.name || user?.email?.split("@")[0]}!
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Jobs"
          value={stats.totalJobs}
          icon={FileText}
          change="+12 from last week"
        />
        <StatCard
          title="Active Jobs"
          value={stats.activeJobs}
          icon={Shield}
          change="+5 from last week"
        />
        <StatCard
          title="Applications"
          value={stats.applications}
          icon={Users}
          change="+3 from last week"
        />
        <StatCard
          title="Interviews"
          value={stats.interviews}
          icon={Calendar}
          change="2 scheduled"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-lg border border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            Recent Applications
          </h2>
          <div className="space-y-4">
            {statsLoading ? (
              Array(3).fill(0).map((_, i) => (
                <StatCardShimmer key={i} />
              ))
            ) : recentApplications.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
                <p className="text-gray-500 dark:text-gray-400">No applications yet</p>
              </div>
            ) : (
              recentApplications.slice(0, 3).map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      Application #{app.id}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {app.status} • {new Date(app.applied_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(app.status)}`}
                  >
                    {app.status.replace("_", " ")}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-lg border border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            Recent Jobs
          </h2>
          <div className="space-y-4">
            {statsLoading ? (
              Array(3).fill(0).map((_, i) => (
                <StatCardShimmer key={i} />
              ))
            ) : recentJobs.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
                <p className="text-gray-500 dark:text-gray-400">No jobs available</p>
              </div>
            ) : (
              recentJobs.slice(0, 3).map((job) => (
                <div key={job.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {job.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {job.company} • {job.location || "Remote"}
                  </p>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {job.scraped_at ? new Date(job.scraped_at).toLocaleDateString() : "Recently posted"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}