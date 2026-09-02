

import axios, { type AxiosInstance, type AxiosResponse } from "axios";

import { BACKEND_BASE_URL } from "@/Config/Environment";

// The interceptor intentionally unwraps the response payload for API callers.
interface ApiResponse<T = any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  success: boolean;
  message: string;
  data: T;
  errors?: unknown[];
}

const api: AxiosInstance = axios.create({
  baseURL: BACKEND_BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // send cookies automatically
});

// Optional request interceptor (token or other headers)
// api.interceptors.request.use(...);

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data;
    if (!res.success) {
      // Backend returned ApiError format
      return Promise.reject(res);
    }
    return res.data; // only return the actual data
  },
  (error) => {
    if (error.response?.status === 401) {
      console.error("Unauthorized, redirect to login...");
      window.location.href = "/login";
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default api;
;
