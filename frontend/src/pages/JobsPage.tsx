import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Job, Application } from "../types";
import { Search, Filter, MapPin, DollarSign, Clock, ChevronLeft, ChevronRight } from "lucide-react";

interface JobsResponse {
  items: Job[];
  total: number;
}

export default function JobsPage() {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPageData, setCurrentPageData] = useState<Job[]>([]);

  useEffect(() => {
    const fetchJobs = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: 10,
          search: searchTerm,
        });
        const response = await fetch(`/api/v1/jobs?${params}`);
        const data = await response.json();
        setJobs(data.items || data);
        setCurrentPageData(data.items || data);
      } catch (error) {
        console.error("Failed to fetch jobs:", error);
        setJobs([]);
        setCurrentPageData([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchJobs();
  }, [page, searchTerm]);

  const filteredJobs = jobs.filter((job) => {
    if (filter === "all") return true;
    return job.job_type === filter;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Jobs
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Browse and apply to job opportunities
        </p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </form>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="all">All Types</option>
          <option value="full-time">Full Time</option>
          <option value="part-time">Part Time</option>
          <option value="contract">Contract</option>
          <option value="internship">Internship</option>
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
              <div className="h-6 w-3/4 rounded-md bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-4 w-1/2 rounded-md bg-gray-200 dark:bg-gray-700 mb-4" />
              <div className="h-4 w-full rounded-md bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-4 w-3/4 rounded-md bg-gray-200 dark:bg-gray-700 mb-4" />
              <div className="h-10 w-full rounded-md bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {currentPageData.map((job) => (
            <div key={job.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {job.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {job.company}
                  </p>
                </div>
                {user && (
                  <span className="rounded-full bg-green-100 dark:bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
                    Applied
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {job.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </div>
                )}
                {job.salary_min_lpa || job.salary_max_lpa && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <DollarSign className="h-4 w-4" />
                    {job.salary_min_lpa && job.salary_max_lpa
                      ? `₹${job.salary_min_lpa}L - ₹${job.salary_max_lpa}L`
                      : job.salary_min_lpa
                      ? `From ₹${job.salary_min_lpa}L`
                      : `Up to ₹${job.salary_max_lpa}L`}
                  </div>
                )}
                {job.job_type && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="h-4 w-4" />
                    {job.job_type}
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                <Link
                  to={`/jobs/${job.id}`}
                  className="flex-1 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:bg-violet-500 dark:hover:bg-violet-600"
                >
                  View Details
                </Link>
                <Link
                  to={`/jobs/${job.id}/apply`}
                  className="flex-1 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 text-center"
                >
                  Apply
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && currentPageData.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No jobs found</p>
        </div>
      )}

      {currentPageData.length > 0 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p)}
            disabled={p === 1}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4 inline mr-1" />
            Previous
          </button>
          <button
            onClick={() => setPage(p + 1)}
            disabled={(page + 1) * 10 >= (jobs.length || 0)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4 inline ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}