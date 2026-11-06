import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Briefcase, Rocket, Shield, Users, ArrowRight, Check, BarChart3 } from "lucide-react";

export default function LandingPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    // Redirect if user is already logged in
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    {
      icon: Briefcase,
      title: "Job Alerts",
      description: "Get notified when new jobs matching your skills are posted.",
    },
    {
      icon: BarChart3,
      title: "Application Tracking",
      description: "Track your applications with real-time status updates.",
    },
    {
      icon: Shield,
      title: "Secure Platform",
      description: "Your data is protected with industry-standard security.",
    },
    {
      icon: Users,
      title: "Community Support",
      description: "Connect with other professionals in your field.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900 dark:to-indigo-950 overflow-x-hidden">
      {/* Animated background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full filter blur-3xl opacity-20 animate-pulse"
          style={{ animationDuration: "4s" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-300 rounded-full filter blur-3xl opacity-20 animate-pulse"
          style={{ animationDuration: "6s", animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 -left-20 w-60 h-60 bg-violet-200 rounded-full filter blur-2xl opacity-30 animate-pulse"
          style={{ animationDuration: "5s", animationDelay: "0.5s" }}
        />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-4 md:px-6 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-600 p-2 text-white">
              <Briefcase className="h-6 w-6" />
            </div>
            <span className="font-bold text-xl text-violet-700 dark:text-violet-300">
              Job Tracker
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 lg:pt-48 lg:pb-24 container mx-auto px-4 md:px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-violet-100 dark:bg-violet-900">
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
              🚀 Launching Soon
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
            <span className="block bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-300 bg-clip-text text-transparent">
              Track Your Job Search
            </span>
            <span className="block text-gray-800 dark:text-gray-200">Like a Pro</span>
          </h1>

          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            Job Tracker helps you organize your job applications, track applications, and never miss an opportunity.
            With intelligent alerts and beautiful analytics, you'll land your dream job faster.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-8 py-4 text-lg font-medium text-white transition-all duration-200 hover:bg-violet-700 hover:scale-105 shadow-lg hover:shadow-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
            >
              Create Account
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-violet-600 px-8 py-4 text-lg font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900 transition-colors"
            >
              Sign In
            </Link>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { value: "50+", label: "Jobs Tracked" },
              { value: "99%", label: "Success Rate" },
              { value: "24/7", label: "Support" },
              { value: "10k+", label: "Users" },
            ].map((stat) => (
              <div key={stat.label} className="text-center p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm">
                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400 mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white/50 dark:bg-gray-900/50 relative z-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Powerful Features
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Everything you need to manage your job search effectively.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all duration-200 hover:-translate-y-2"
              >
                <div className="rounded-lg bg-violet-100 dark:bg-violet-900 w-12 h-12 flex items-center justify-center mb-4 group-hover:bg-violet-200 dark:group-hover:bg-violet-800 transition-colors">
                  <feature.icon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900 dark:to-indigo-950 relative z-10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              {
                number: "15,000+",
                label: "Applications Tracked",
                icon: Check,
              },
              {
                number: "98%",
                label: "User Satisfaction",
                icon: Shield,
              },
              {
                number: "500+",
                label: "Companies Added",
                icon: Users,
              },
            ].map((item) => (
              <div key={item.label} className="bg-white/50 dark:bg-gray-900/50 rounded-2xl p-8 backdrop-blur-sm">
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-violet-600 w-16 h-16 flex items-center justify-center">
                    <item.icon className="h-8 w-8 text-white" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {item.number}
                </div>
                <div className="text-gray-600 dark:text-gray-400">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 text-center bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-500 dark:to-indigo-500 relative z-10">
        <div className="container mx-auto px-4 md:px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Job Search?
          </h2>
          <p className="text-lg text-violet-100 dark:text-indigo-100 mb-8 max-w-2xl mx-auto">
            Join thousands of professionals who are already tracking their careers more effectively.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-8 py-4 text-lg font-medium text-violet-600 hover:bg-gray-50 transition-colors shadow-lg"
          >
            Start Tracking Now
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-gray-950 py-8 text-center text-gray-400">
        <div className="container mx-auto px-4 md:px-6">
          <p className="mb-4">&copy; {new Date().getFullYear()} Job Tracker. All rights reserved.</p>
          <div className="flex justify-center gap-6 text-sm">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}