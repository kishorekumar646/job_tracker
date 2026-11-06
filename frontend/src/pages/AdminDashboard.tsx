import React, { useState, useEffect } from "react";
import { Shield, Users, TrendingUp, AlertCircle, Check, X } from "lucide-react";

interface User {
  id: number;
  email: string;
  name?: string;
  is_admin: boolean;
  is_approved: boolean;
  created_at: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/v1/admin/users");
        const data = await response.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch users:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleApprove = async (userId: number) => {
    try {
      await fetch(`/api/v1/admin/users/${userId}/approve`, {
        method: "POST",
      });
      setUsers(users.map(user =>
        user.id === userId ? { ...user, is_approved: true } : user
      ));
    } catch (error) {
      console.error("Failed to approve user:", error);
    }
  };

  const handleReject = async (userId: number) => {
    try {
      await fetch(`/api/v1/admin/users/${userId}/reject`, {
        method: "POST",
      });
      setUsers(users.map(user =>
        user.id === userId ? { ...user, is_approved: false } : user
      ));
    } catch (error) {
      console.error("Failed to reject user:", error);
    }
  };

  const pendingUsers = users.filter(user => !user.is_approved);
  const activeUsers = users.filter(user => user.is_approved && !user.is_admin);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Admin Dashboard
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage users and platform settings
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-violet-100 dark:bg-violet-900 p-3">
              <Shield className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Users
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {users.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Pending Approval
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {pendingUsers.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Active Users
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {activeUsers.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            User Management
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review and approve new user registrations
          </p>
        </div>

        {isLoading ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-6 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-3/4 rounded-md bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-1/2 rounded-md bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="h-8 w-20 rounded-md bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        ) : pendingUsers.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No pending user approvals
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {pendingUsers.map((user) => (
              <div key={user.id} className="p-6 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {user.name || user.email.split("@")[0]}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {user.email}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Applied on {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(user.id)}
                    className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 flex items-center gap-1"
                  >
                    <Check className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(user.id)}
                    className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 flex items-center gap-1"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}