import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { BarChart3, FileText, Inbox, Plus, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import StatsCard from "@/components/StatsCard"
import FormCard from "@/components/FormCard"
import { formsApi, submissionsApi } from "@/lib/api"
import { timeAgo, truncate } from "@/lib/utils"

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    totalForms: 0,
    totalSubmissions: 0,
    submissionsToday: 0,
    submissionsThisMonth: 0,
  })
  const [recentForms, setRecentForms] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        // Fetch forms and stats in parallel from backend (service_role — correct data)
        const [formsResponse, statsResponse] = await Promise.all([
          formsApi.getAll(),
          submissionsApi.getStats(),
        ])

        const formsData = formsResponse.data || []
        setRecentForms(formsData.slice(0, 4))

        const stats = statsResponse.data || {}
        setStats({
          totalForms: stats.totalForms ?? formsData.length,
          totalSubmissions: stats.totalSubmissions ?? 0,
          submissionsToday: stats.submissionsToday ?? 0,
          submissionsThisMonth: stats.submissionsThisMonth ?? 0,
        })
        // Add a text preview from submission data for each activity item
        const activity = (stats.recentActivity || []).map(item => ({
          ...item,
          preview: Object.values(item.data || {}).find(v => typeof v === 'string' && v.trim().length > 2) || null
        }))
        setRecentActivity(activity)
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error)
        setStats({
          totalForms: 0,
          totalSubmissions: 0,
          submissionsToday: 0,
          submissionsThisMonth: 0,
        })
        setRecentForms([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {user?.name?.split(' ')[0] || "there"}
          </h1>
          <p className="text-muted-foreground mt-0.5">
            Here&apos;s what&apos;s happening with your forms
          </p>
        </div>
        <Button asChild>
          <Link to="/forms/create">
            <Plus className="h-4 w-4 mr-2" />
            New Form
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Forms"
          value={stats.totalForms}
          icon={FileText}
          loading={loading}
        />
        <StatsCard
          title="Total Submissions"
          value={stats.totalSubmissions}
          icon={Inbox}
          loading={loading}
        />
        <StatsCard
          title="Today"
          value={stats.submissionsToday}
          description="submissions"
          icon={BarChart3}
          loading={loading}
        />
        <StatsCard
          title="This Month"
          value={stats.submissionsThisMonth}
          description="submissions"
          icon={BarChart3}
          loading={loading}
        />
      </div>

      {/* Recent Activity */}
      {(loading || recentActivity.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link to="/submissions">
                View all
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Inbox className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      <span className="font-medium">{item.form_name}</span>
                      {item.preview && <span className="text-muted-foreground"> — {truncate(item.preview, 60)}</span>}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(item.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Forms */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Forms</h2>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link to="/forms">
              View all
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-lg bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : recentForms.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {recentForms.map((form) => (
              <FormCard key={form.id} form={form} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border border-dashed border-border rounded-lg">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium mb-1">No forms yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first form to start collecting submissions
            </p>
            <Button asChild>
              <Link to="/forms/create">
                <Plus className="h-4 w-4 mr-2" />
                Create Form
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
