import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { Application } from "../types";

export default function ApplicationsPage() {
  const { user } = useAuthStore();
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const fetchApplications = async () => {
      if (!user) return;

      setIsLoading(true);
      try {
        const response = await fetch("/applications");
        const data = await response.json();
        setApplications(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch applications:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchApplications();

    // Poll every 3 seconds for updates
    const interval = setInterval(fetchApplications, 3000);
    return () => clearInterval(interval);
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "applied":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "shortlisted":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "interview_scheduled":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "interview_completed":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
      case "offer":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const filteredApplications = applications.filter((app) => {
    if (filter === "all") return true;
    return app.status === filter;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          My Applications
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Track your job applications and interviews
        </p>
      </div>

      <div className="flex gap-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="all">All Applications</option>
          <option value="applied">Applied</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="interview_scheduled">Interview Scheduled</option>
          <option value="interview_completed">Interview Completed</option>
          <option value="offer">Offer</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
              <div className="h-6 w-3/4 rounded-md bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-4 w-1/2 rounded-md bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-4 w-full rounded-md bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No applications found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredApplications.map((app) => (
            <div key={app.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Application #{app.id}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Applied on {new Date(app.applied_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={getStatusColor(app.status)}>
                  {app.status}
                </span>
              </div>

              {app.job && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                    {app.job.title}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {app.job.company}
                  </p>
                </div>
              )}

              {app.interview_date && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Interview:</strong>{" "}
                    {new Date(app.interview_date).toLocaleString()}
                  </p>
                </div>
              )}

              {app.cover_letter && (
                <div className="mt-4">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Cover Letter
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {app.cover_letter}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}