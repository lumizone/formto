import axios from "axios"

// Empty string = relative URLs = same domain (production via Caddy)
// Set VITE_API_BASE_URL only for local dev (e.g. http://localhost:3001)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ""
const TOKEN_KEY = 'formto_token'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Request interceptor — attach JWT from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor — unwrap backend envelope shapes
api.interceptors.response.use(
  (response) => {
    if (response.data.forms) {
      return { ...response, data: response.data.forms }
    }
    if (response.data.form) {
      return { ...response, data: response.data.form }
    }
    if (response.data.submissions && response.data.pagination) {
      return { ...response, data: response.data.submissions, pagination: response.data.pagination }
    }
    if (response.data.submissions) {
      return { ...response, data: response.data.submissions }
    }
    if (response.data.submission) {
      return { ...response, data: response.data.submission }
    }
    if (response.data.stats) {
      return { ...response, data: response.data.stats }
    }
    if (response.data.logs) {
      return { ...response, data: response.data.logs }
    }
    // analyticsData and submissionsData are intentionally NOT unwrapped
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Forms API
export const formsApi = {
  getAll: () => api.get("/api/forms"),
  getById: (id) => api.get(`/api/forms/${id}`),
  create: (data) => api.post("/api/forms", data),
  update: (id, data) => api.put(`/api/forms/${id}`, data),
  delete: (id) => api.delete(`/api/forms/${id}`),
  toggle: (id) => api.patch(`/api/forms/${id}/toggle`),
  getSubmissions: (formId, params) => api.get(`/api/submissions/form/${formId}`, { params }),
  getFormStats: (formId) => api.get(`/api/submissions/form/${formId}/stats`),
  sendTestEmail: (formId, email) => api.post(`/api/forms/${formId}/test-email`, { email }),
}

// Submissions API
export const submissionsApi = {
  getById: (id) => api.get(`/api/submissions/${id}`),
  archive: (id) => api.delete(`/api/submissions/${id}`),
  restore: (id) => api.patch(`/api/submissions/${id}/restore`),
  deletePermanent: (id) => api.delete(`/api/submissions/${id}/permanent`),
  export: (formId) => api.get(`/api/submissions/form/${formId}/export`, { responseType: 'blob' }),
  getStats: () => api.get('/api/submissions/stats'),
  getAnalytics: (range) => api.get('/api/submissions/analytics', { params: range ? { range } : {} }),
  getAll: (params) => api.get('/api/submissions/all', { params }),
  updateStatus: (id, status) => api.patch(`/api/submissions/${id}/status`, { status }),
  updateNotes: (id, notes) => api.patch(`/api/submissions/${id}/notes`, { notes }),
  markRead: (id) => api.patch(`/api/submissions/${id}/read`),
  markAllRead: (formId) => api.post('/api/submissions/read-all', formId ? { formId } : {}),
  reply: (id, data) => api.post(`/api/submissions/${id}/reply`, data),
}

// Webhooks API
export const webhooksApi = {
  test: (url, payload) => api.post("/api/webhooks/test", { url, payload }),
  getLogs: (formId, params) => api.get(`/api/webhooks/logs/${formId}`, { params }),
  retry: (logId) => api.post(`/api/webhooks/retry/${logId}`),
}

export default api
