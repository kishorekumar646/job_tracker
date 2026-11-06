import { create } from "zustand";
import { persist } from "zustand/middleware";
import { User } from "../types";
import apiClient from "../api/client";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await apiClient.post("/auth/login", { email, password });
          set({
            user: response.data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || "Login failed",
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await apiClient.post("/auth/logout");
        } catch (error) {
          // Ignore errors during logout
        }
        set({ user: null, isAuthenticated: false });
      },

      signup: async (email: string, password: string, name?: string) => {
        try {
          set({ isLoading: true, error: null });
          const response = await apiClient.post("/auth/signup", {
            email,
            password,
            name,
          });
          set({
            user: response.data,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || "Signup failed",
            isLoading: false,
          });
          throw error;
        }
      },

      fetchCurrentUser: async () => {
        set({ isLoading: true });
        try {
          const response = await apiClient.get("/auth/me");
          set({ user: response.data, isAuthenticated: true });
        } catch (error) {
          set({ user: null, isAuthenticated: false });
        }
        set({ isLoading: false });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "auth-storage",
    }
  )
);

// Restore auth state from cookies on app load (client-side only)
if (typeof window !== "undefined") {
  // Use useEffect equivalent pattern for immediate execution
  const restoreAuth = async () => {
    const store = useAuthStore.getState();
    await store.fetchCurrentUser();
  };
  restoreAuth();
}