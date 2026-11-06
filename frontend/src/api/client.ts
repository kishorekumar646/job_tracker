import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request logging interceptor
apiClient.interceptors.request.use(
  (config) => {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    if (config.data) {
      console.log("[Request Body]", config.data);
    }
    return config;
  },
  (error: AxiosError) => {
    console.error("[API Request Error]", error);
    return Promise.reject(error);
  }
);

// Response logging interceptor
apiClient.interceptors.response.use(
  (response) => {
    const status = response.status;
    const url = response.config.url;
    const method = response.config.method?.toUpperCase();

    console.log(`[API Response] ${method} ${url} - Status: ${status}`);
    console.log("[Response Data]", response.data);

    return response;
  },
  async (error: AxiosError) => {
    const url = error.config?.url;
    const method = error.config?.method?.toUpperCase();
    const status = error.response?.status;

    if (status) {
      console.error(`[API Error] ${method} ${url} - Status: ${status}`);
      console.error("[Error Response]", error.response?.data || error.message);
    } else {
      console.error(`[API Network Error] ${method} ${url} - ${error.message}`);
    }

    const originalRequest = error.config as InternalAxiosRequestConfig;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers["Authorization"] = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await apiClient.post("/v1/auth/refresh");
        const token = response.data.access_token;
        originalRequest.headers["Authorization"] = `Bearer ${token}`;
        processQueue(null, token);
        return apiClient(originalRequest);
      } catch (err) {
        processQueue(err as AxiosError, null);
        window.location.href = "/login";
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    processQueue(error, null);
    return Promise.reject(error);
  }
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (error: AxiosError) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export default apiClient;