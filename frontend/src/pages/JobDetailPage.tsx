import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Job } from "../types";
import { MapPin, DollarSign, Clock, Calendar, FileText, Send, X } from "lucide-react";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");

  useEffect(() => {
    const fetchJob = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const response = await fetch(`/api/v1/jobs/${id}`);
        const data = await response.json();
        setJob(data);
      } catch (error) {
        console.error("Failed to fetch job:", error);
        navigate("/jobs");
      } finally {
        setIsLoading(false);
      }
    };
    fetchJob();
  }, [id, navigate]);

  const handleApply = async () => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (!job) return;

    try {
      const response = await fetch(`/api/v1/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ job_id: parseInt(id!) }),
      });

      if (response.ok) {
        setShowApplyModal(false);
        navigate("/applications", { replace: true });
      }
    } catch (error) {
      console.error("Failed to apply:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-3/4 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-4 w-1/2 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="space-y-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-4 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Job not found</p>
        <Link to="/jobs" className="mt-4 inline-block text-violet-600 hover:underline">
          Back to Jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {job.title}
          </h1>
          <p className="mt-1 text-xl text-gray-600 dark:text-gray-400">
            {job.company}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
          {job.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {job.location}
            </div>
          )}
          {job.salary_min_lpa || job.salary_max_lpa && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {job.salary_min_lpa && job.salary_max_lpa
                ? `₹${job.salary_min_lpa}L - ₹${job.salary_max_lpa}L`
                : job.salary_min_lpa
                ? `From ₹${job.salary_min_lpa}L`
                : `Up to ₹${job.salary_max_lpa}L`}
            </div>
          )}
          {job.job_type && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {job.job_type}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          {user && (
            <button
              onClick={() => setShowApplyModal(true)}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:bg-violet-500 dark:hover:bg-violet-600"
            >
              Apply Now
            </button>
          )}
          <Link
            to="/jobs"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Back to Jobs
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Job Description
        </h2>
        <div className="prose dark:prose-invert max-w-none">
          {job.description ? (
            <p className="whitespace-pre-wrap text-gray-600 dark:text-gray-400">
              {job.description}
            </p>
          ) : (
            <p className="text-gray-500 dark:text-gray-500">
              No description available for this job.
            </p>
          )}
        </div>
      </div>

      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-6 w-full max-w-md">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Apply for {job.title}
              </h3>
              <button
                onClick={() => setShowApplyModal(false)}
                className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              <label htmlFor="coverLetter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Cover Letter (optional)
              </label>
              <textarea
                id="coverLetter"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={4}
                className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder="Write a message to the employer..."
              />
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowApplyModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:bg-violet-500 dark:hover:bg-violet-600"
              >
                Submit Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}