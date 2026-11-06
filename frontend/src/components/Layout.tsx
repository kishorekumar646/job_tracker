import React, { useState, useEffect } from "react";
import { Link, useLocation, NavLink } from "react-router-dom";
import {
  Menu,
  Bell,
  LogOut,
  LayoutDashboard,
  FileText,
  Settings,
  Shield,
  Sun,
  Moon,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { Outlet } from "react-router-dom";

const navigationItems = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Jobs",
    href: "/jobs",
    icon: FileText,
  },
  {
    name: "Applications",
    href: "/applications",
    icon: Bell,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    name: "Admin",
    href: "/admin",
    icon: Shield,
  },
];

const Navigation = ({ onMobileClose }: { onMobileClose?: () => void }) => (
  <>
    {navigationItems.map((item) => (
      <li key={item.href}>
        <NavLink
          to={item.href}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg p-3 text-sm font-medium transition-colors hover:bg-violet-100 dark:hover:bg-violet-900 ${
              isActive
                ? "bg-violet-200 dark:bg-violet-800 font-semibold text-violet-700 dark:text-violet-300"
                : "text-gray-600 dark:text-gray-400"
            }`
          }
          onClick={onMobileClose}
        >
          <item.icon className="h-5 w-5" />
          {item.name}
        </NavLink>
      </li>
    ))}
  </>
);

const NotificationBell = () => {
  const [notifications, setNotifications] = React.useState([]);

  return (
    <div className="relative">
      <button
        className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800 relative"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-violet-500" />
        )}
      </button>
    </div>
  );
};

const DarkModeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(theme === "dark" || (!theme && media.matches));
  }, []);

  const toggleDarkMode = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
    setIsDark(!isDark);
  };

  return (
    <button
      onClick={toggleDarkMode}
      className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Toggle dark mode"
    >
      {isDark ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-gray-600" />}
    </button>
  );
};

const Header = () => {
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm supports-[backdrop-filter]:bg-white/50 dark:supports-[backdrop-filter]:bg-gray-900/50">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="rounded-lg bg-violet-600 p-2 text-white">
            <Briefcase className="h-6 w-6" />
          </div>
          <span className="font-bold text-xl text-violet-700 dark:text-violet-300">
            Job Tracker
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <NotificationBell />
          <DarkModeToggle />

          <div className="hidden md:block">
            <nav>
              <ul className="flex items-center gap-1">
                {navigationItems.slice(0, 3).map((item) => (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-violet-100 dark:hover:bg-violet-900 ${
                          isActive
                            ? "bg-violet-200 dark:bg-violet-800 font-semibold text-violet-700 dark:text-violet-300"
                            : "text-gray-600 dark:text-gray-400"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <button
            className="rounded-full p-1 md:hidden hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => setMobileOpen(true)}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </button>

          <div className="hidden md:block">
            <button
              onClick={logout}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-violet-100 dark:text-gray-400 dark:hover:bg-violet-900"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 block md:hidden">
          <div
            className="fixed inset-0 bg-gray-900/80"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[240px] overflow-y-auto border-r bg-white dark:border-gray-800 dark:bg-gray-950 p-4">
            <nav>
              <ul className="flex flex-col gap-1">
                {navigationItems.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg p-3 text-sm font-medium transition-colors hover:bg-violet-100 dark:hover:bg-violet-900 ${
                          isActive
                            ? "bg-violet-200 dark:bg-violet-800 font-semibold"
                            : "text-gray-600 dark:text-gray-400"
                        }`
                      }
                      onClick={() => setMobileOpen(false)}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </NavLink>
                  </li>
                ))}
                <li>
                  <button
                    onClick={logout}
                    className="flex items-center gap-3 rounded-lg w-full p-3 text-sm font-medium text-gray-600 hover:bg-violet-100 dark:text-gray-400 dark:hover:bg-violet-900"
                  >
                    <LogOut className="h-5 w-5" />
                    Sign out
                  </button>
                </li>
              </ul>
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
};

// Briefcase icon component
const Briefcase = (props: any) => (
  <svg
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 13.5v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2h14a2 2 0 012 2v9zM7 10l3-3 3 3 3-3 3 3-3 3 3v7H7v-7z"
    />
  </svg>
);

export default function Layout() {
  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-6 md:px-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}