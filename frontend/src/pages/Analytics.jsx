import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts"
import {
  FileText,
  Inbox,
  TrendingUp,
  Flame,
  Calendar,
  Download,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { submissionsApi } from "@/lib/api"

const TIME_RANGES = [
  { label: "Today", value: "today", days: 1 },
  { label: "Last 7 days", value: "7days", days: 7 },
  { label: "Last 30 days", value: "30days", days: 30 },
  { label: "Last 90 days", value: "90days", days: 90 },
  { label: "All time", value: "all", days: null },
]

const PIE_COLORS = ["#10B981", "#EF4444"]

function AnimatedNumber({ value, duration = 1000 }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let startTime
    let animationFrame

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      setDisplayValue(Math.floor(progress * value))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [value, duration])

  return <span>{displayValue.toLocaleString()}</span>
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-24 bg-muted animate-pulse rounded" />
        <div className="h-4 w-4 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 bg-muted animate-pulse rounded mb-1" />
        <div className="h-3 w-20 bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  )
}

function ChartSkeleton({ height = 300 }) {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 bg-muted animate-pulse rounded" />
        <div className="h-4 w-60 bg-muted animate-pulse rounded mt-1" />
      </CardHeader>
      <CardContent>
        <div
          className="bg-muted animate-pulse rounded"
          style={{ height: `${height}px` }}
        />
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Analytics() {
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState("7days")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)

  // Stats
  const [totalForms, setTotalForms] = useState(0)
  const [totalSubmissions, setTotalSubmissions] = useState(0)
  const [thisMonthSubmissions, setThisMonthSubmissions] = useState(0)
  const [mostActiveForm, setMostActiveForm] = useState(null)

  // Chart data
  const [submissionsOverTime, setSubmissionsOverTime] = useState([])
  const [formStatusData, setFormStatusData] = useState([])

  // Per-form stats
  const [formStats, setFormStats] = useState([])

  const getDateRange = (range) => {
    const now = new Date()
    const rangeConfig = TIME_RANGES.find((r) => r.value === range)

    if (!rangeConfig || rangeConfig.days === null) {
      return null
    }

    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - rangeConfig.days)
    startDate.setHours(0, 0, 0, 0)

    return startDate.toISOString()
  }

  const fetchAnalytics = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      if (!user) {
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      // Fetch forms + submissions from backend
      const analyticsResponse = await submissionsApi.getAnalytics(timeRange)
      // Response: { analyticsData: { forms, submissions } } — not intercepted
      const analyticsData = analyticsResponse.data?.analyticsData || analyticsResponse.data || {}

      let forms = analyticsData.forms || []
      let submissions = analyticsData.submissions || []

      if (!forms || forms.length === 0) {
        setTotalForms(0)
        setTotalSubmissions(0)
        setThisMonthSubmissions(0)
        setMostActiveForm(null)
        setSubmissionsOverTime([])
        setFormStatusData([])
        setFormStats([])
        return
      }

      setTotalForms(forms.length)
      setTotalSubmissions(submissions.length)

      // This month submissions
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const thisMonth = submissions.filter(
        (s) => new Date(s.created_at) >= startOfMonth
      ).length
      setThisMonthSubmissions(thisMonth)

      // Most active form
      const formSubmissionCounts = forms.map((form) => ({
        ...form,
        count: submissions.filter((s) => s.form_id === form.id).length,
      }))

      const mostActive = formSubmissionCounts.reduce(
        (max, form) => (form.count > max.count ? form : max),
        { count: 0, name: "N/A" }
      )
      setMostActiveForm(mostActive.count > 0 ? mostActive : null)

      // Form status pie chart
      const activeForms = forms.filter((f) => f.active !== false).length
      const inactiveForms = forms.length - activeForms
      setFormStatusData([
        { name: "Active", value: activeForms },
        { name: "Inactive", value: inactiveForms },
      ])

      // Submissions over time (based on time range)
      const rangeStartDate = getDateRange(timeRange)
      const filteredSubmissions = rangeStartDate
        ? submissions.filter((s) => new Date(s.created_at) >= new Date(rangeStartDate))
        : submissions

      // Group by date
      const grouped = filteredSubmissions.reduce((acc, sub) => {
        const date = new Date(sub.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        acc[date] = (acc[date] || 0) + 1
        return acc
      }, {})

      const chartData = Object.entries(grouped).map(([date, count]) => ({
        date,
        submissions: count,
      }))
      setSubmissionsOverTime(chartData)

      // Per-form stats
      const now = new Date()
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)

      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)

      const twoWeeksAgo = new Date(now)
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

      const stats = forms.map((form) => {
        const formSubs = submissions.filter((s) => s.form_id === form.id)

        const todayCount = formSubs.filter(
          (s) => new Date(s.created_at) >= today
        ).length

        const thisWeekCount = formSubs.filter(
          (s) => new Date(s.created_at) >= weekAgo
        ).length

        const lastWeekCount = formSubs.filter(
          (s) =>
            new Date(s.created_at) >= twoWeeksAgo &&
            new Date(s.created_at) < weekAgo
        ).length

        const trend =
          lastWeekCount > 0
            ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
            : thisWeekCount > 0
            ? 100
            : 0

        return {
          id: form.id,
          name: form.name,
          active: form.active !== false,
          total: formSubs.length,
          today: todayCount,
          thisWeek: thisWeekCount,
          trend,
        }
      })

      // Sort by total submissions descending
      stats.sort((a, b) => b.total - a.total)
      setFormStats(stats)
    } catch (err) {
      console.error("Failed to fetch analytics:", err)
      setError("Failed to load analytics data. Please try again.")
      toast({
        title: "Error",
        description: "Failed to load analytics data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [timeRange, user])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const handleExportCSV = () => {
    const headers = ["Form Name", "Total Submissions", "Today", "This Week", "Trend"]
    const rows = formStats.map((form) => [
      form.name,
      form.total,
      form.today,
      form.thisWeek,
      `${form.trend > 0 ? "+" : ""}${form.trend}%`,
    ])

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `formto-analytics-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    toast({
      title: "Export complete",
      description: "Analytics data has been exported to CSV",
      variant: "success",
    })
  }

  // Error state
  if (error && !isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-0.5">
              Track your form performance
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-destructive text-center">{error}</p>
              <Button onClick={() => fetchAnalytics()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Empty state (no forms)
  if (!isLoading && totalForms === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-0.5">
              Track your form performance
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <BarChart3 className="h-16 w-16 text-muted-foreground" />
              <h3 className="text-xl font-semibold">No forms yet</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Create your first form to start seeing analytics! Once you have
                forms and submissions, you&apos;ll see charts and statistics here.
              </p>
              <Button asChild>
                <Link to="/forms/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Form
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-0.5">
            Track your form performance and submissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                {TIME_RANGES.find((r) => r.value === timeRange)?.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {TIME_RANGES.map((range) => (
                <DropdownMenuItem
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={cn(timeRange === range.value && "bg-accent")}
                >
                  {range.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchAnalytics(true)}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Forms</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                <AnimatedNumber value={totalForms} />
              </div>
              <p className="text-xs text-muted-foreground">
                Active forms in your account
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Submissions
              </CardTitle>
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                <AnimatedNumber value={totalSubmissions} />
              </div>
              <p className="text-xs text-muted-foreground">
                All time submissions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                <AnimatedNumber value={thisMonthSubmissions} />
              </div>
              <p className="text-xs text-muted-foreground">
                Submissions this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Most Active Form
              </CardTitle>
              <Flame className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold truncate">
                {mostActiveForm ? mostActiveForm.name : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">
                {mostActiveForm
                  ? `${mostActiveForm.count} submissions`
                  : "No submissions yet"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Submissions Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Submissions Over Time</CardTitle>
              <CardDescription>
                {TIME_RANGES.find((r) => r.value === timeRange)?.label} breakdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submissionsOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={submissionsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="submissions"
                      stroke="#2563EB"
                      strokeWidth={2}
                      dot={{ fill: "#2563EB", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: "#2563EB" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-muted-foreground">
                    No submissions in this time range
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Forms by Status */}
          <Card>
            <CardHeader>
              <CardTitle>Forms by Status</CardTitle>
              <CardDescription>Active vs inactive forms</CardDescription>
            </CardHeader>
            <CardContent>
              {formStatusData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={formStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) =>
                        value > 0
                          ? `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                          : null
                      }
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {formStatusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-muted-foreground">No data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-Form Stats Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : formStats.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Per-Form Performance</CardTitle>
            <CardDescription>
              Detailed statistics for each form
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Name</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">
                      Today
                    </TableHead>
                    <TableHead className="text-right hidden md:table-cell">
                      This Week
                    </TableHead>
                    <TableHead className="text-right">Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formStats.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell>
                        <Link
                          to={`/forms/${form.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {form.name}
                        </Link>
                        {!form.active && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (inactive)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {form.total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        {form.today}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        {form.thisWeek}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-sm font-medium",
                            form.trend > 0
                              ? "text-green-600"
                              : form.trend < 0
                              ? "text-red-600"
                              : "text-muted-foreground"
                          )}
                        >
                          {form.trend > 0 ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : form.trend < 0 ? (
                            <ArrowDownRight className="h-4 w-4" />
                          ) : null}
                          {form.trend > 0 ? "+" : ""}
                          {form.trend}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Empty submissions state */}
      {!isLoading && totalForms > 0 && totalSubmissions === 0 && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">No submissions yet</h3>
              <p className="text-muted-foreground max-w-md">
                You have {totalForms} form{totalForms > 1 ? "s" : ""} but no
                submissions yet. Share your form links to start collecting data!
              </p>
              <Button asChild variant="outline">
                <Link to="/forms">View Forms</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
