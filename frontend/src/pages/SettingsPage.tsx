import React, { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { Save, Shield, Bell, Palette, Globe } from "lucide-react";

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const [notifications, setNotifications] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [theme, setTheme] = useState("light");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Settings
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your account preferences
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Security
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Two-Factor Authentication
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Add an extra layer of security to your account
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={twoFactor}
                  onChange={() => setTwoFactor(!twoFactor)}
                  className="sr-only"
                />
                <div className="w-11 h-6 border-2 border-gray-300 rounded-full bg-gray-50 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-300 dark:peer-focus:ring-violet-800 peer-checked:bg-violet-600 dark:peer-checked:bg-violet-500 peer-checked:border-violet-600 dark:peer-checked:border-violet-500 transition-colors"></div>
              </label>
            </div>

            <button className="rounded-md border border-violet-600 px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-400 dark:hover:bg-violet-900">
              Change Password
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Notifications
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Email Notifications
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Receive email alerts about your applications
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={() => setNotifications(!notifications)}
                  className="sr-only"
                />
                <div className="w-11 h-6 border-2 border-gray-300 rounded-full bg-gray-50 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-violet-300 dark:peer-focus:ring-violet-800 peer-checked:bg-violet-600 dark:peer-checked:bg-violet-500 peer-checked:border-violet-600 dark:peer-checked:border-violet-500 transition-colors"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Application Updates
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Get notified when you receive interview invites
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="sr-only"
                />
                <div className="w-11 h-6 border-2 border-gray-300 rounded-full bg-gray-50 dark:bg-gray-600"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Profile
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                defaultValue={user?.name || ""}
                className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                type="email"
                id="email"
                defaultValue={user?.email || ""}
                disabled
                className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:bg-violet-500 dark:hover:bg-violet-600 flex items-center gap-2">
          <Save className="h-4 w-4" />
          Save Changes
        </button>
        <button
          onClick={logout}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}