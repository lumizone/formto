import { useEffect, useState } from "react"
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom"
import axios from "axios"
import { useAuth } from "@/contexts/AuthContext"
import Sidebar from "@/components/Sidebar"
import Header from "@/components/Header"
import Login from "@/pages/Login"
import Setup from "@/pages/Setup"
import Dashboard from "@/pages/Dashboard"
import FormsList from "@/pages/FormsList"
import FormDetails from "@/pages/FormDetails"
import CreateForm from "@/pages/CreateForm"
import Settings from "@/pages/Settings"
import FormSettings from "@/pages/FormSettings"
import Analytics from "@/pages/Analytics"
import Account from "@/pages/Account"
import Submissions from "@/pages/Submissions"
import { Toaster } from "@/components/ui/toaster"
import { UnreadProvider } from "@/contexts/UnreadContext"
import { ThemeProvider } from "@/contexts/ThemeContext"

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ""

function DashboardLayout() {
  return (
    <UnreadProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Header />
        <main className="md:pl-60">
          <div className="p-4 md:p-8 max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </UnreadProvider>
  )
}

// Checks setup-status and redirects to /setup if no users exist yet
const SETUP_RETRY_DELAYS = [1000, 2000, 4000]

function SetupGuard({ children }) {
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let cancelled = false

    async function check(attempt = 0) {
      try {
        const { data } = await axios.get(`${API_BASE}/api/auth/setup-status`)
        if (cancelled) return
        if (data.needsSetup && location.pathname !== "/setup") {
          navigate("/setup", { replace: true })
        } else if (!data.needsSetup && location.pathname === "/setup") {
          navigate("/login", { replace: true })
        }
        setChecking(false)
      } catch {
        if (cancelled) return
        if (attempt < SETUP_RETRY_DELAYS.length) {
          setTimeout(() => check(attempt + 1), SETUP_RETRY_DELAYS[attempt])
        } else {
          setError(true)
          setChecking(false)
        }
      }
    }

    check()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-foreground">Cannot connect to backend</p>
          <p className="text-xs text-muted-foreground">Make sure the server is running, then refresh the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return children
}

function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return user ? <DashboardLayout /> : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return user ? <Navigate to="/dashboard" replace /> : children
}

function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Toaster />
      <SetupGuard>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/forms" element={<FormsList />} />
            <Route path="/forms/create" element={<CreateForm />} />
            <Route path="/forms/:id" element={<FormDetails />} />
            <Route path="/forms/:id/settings" element={<FormSettings />} />
            <Route path="/submissions" element={<Submissions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/account" element={<Account />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </SetupGuard>
    </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
