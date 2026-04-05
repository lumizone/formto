import { useEffect, useState, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  Settings,
  Mail,
  QrCode,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import StatsCard from "@/components/StatsCard"
import SubmissionTable from "@/components/SubmissionTable"
import CodeSnippet from "@/components/CodeSnippet"
import EmailTemplateEditor from "@/components/EmailTemplateEditor"
import { QRCodeSVG } from "qrcode.react"
import { formatDate } from "@/lib/utils"
import { formsApi, submissionsApi } from "@/lib/api"
import { toast } from "@/hooks/use-toast"

const PAGE_SIZE = 50

export default function FormDetails() {
  const { id } = useParams()
  const [form, setForm] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [archivedSubmissions, setArchivedSubmissions] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [submissionsPage, setSubmissionsPage] = useState(1)
  const [archivedPage, setArchivedPage] = useState(1)
  const [submissionsPagination, setSubmissionsPagination] = useState(null)
  const [archivedPagination, setArchivedPagination] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const fetchSubmissions = useCallback(async (page) => {
    if (!id) return
    setSubmissionsLoading(true)
    try {
      const res = await formsApi.getSubmissions(id, { archived: false, page, limit: PAGE_SIZE })
      setSubmissions(res.data || [])
      setSubmissionsPagination(res.pagination || null)
    } catch (error) {
      console.error("Failed to fetch submissions:", error)
    } finally {
      setSubmissionsLoading(false)
    }
  }, [id])

  const fetchArchivedSubmissions = useCallback(async (page) => {
    if (!id) return
    setArchivedLoading(true)
    try {
      const res = await formsApi.getSubmissions(id, { archived: true, page, limit: PAGE_SIZE })
      setArchivedSubmissions(res.data || [])
      setArchivedPagination(res.pagination || null)
    } catch (error) {
      console.error("Failed to fetch archived submissions:", error)
    } finally {
      setArchivedLoading(false)
    }
  }, [id])

  useEffect(() => {
    setSubmissionsPage(1)
    setArchivedPage(1)
  }, [id])

  useEffect(() => {
    async function fetchInitialData() {
      if (!id) {
        setLoading(false)
        return
      }
      try {
        const [formResponse, statsResponse] = await Promise.all([
          formsApi.getById(id),
          formsApi.getFormStats(id).catch(() => null),
        ])

        const formData = formResponse.data
        if (!formData) {
          setForm(null)
          setLoading(false)
          return
        }

        setForm(formData)

        if (statsResponse?.data) {
          const s = statsResponse.data
          setStats({ total: s.total || 0, thisWeek: s.this_week || 0, today: s.today || 0 })
        }
      } catch (error) {
        console.error("Failed to fetch form details:", error)
        toast({ title: "Error", description: "Failed to load form. Please try again.", variant: "destructive" })
        setForm(null)
      } finally {
        setLoading(false)
      }
    }
    fetchInitialData()
  }, [id])

  useEffect(() => {
    if (form) fetchSubmissions(submissionsPage)
  }, [form, submissionsPage, fetchSubmissions])

  useEffect(() => {
    if (form) fetchArchivedSubmissions(archivedPage)
  }, [form, archivedPage, fetchArchivedSubmissions])

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.location.origin

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(`${API_BASE_URL}/f/${form?.endpoint}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadQr = () => {
    const svg = document.getElementById("form-qr-svg")
    if (!svg) return
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const a = document.createElement("a")
      a.download = `${form?.name || "form"}-qr.png`
      a.href = canvas.toDataURL("image/png")
      a.click()
    }
    img.src = url
  }

  const handleExport = async (format) => {
    try {
      if (!form?.id) return

      // Use backend API for CSV export (backend only supports CSV)
      if (format === "csv") {
        const response = await submissionsApi.export(form.id)
        const url = window.URL.createObjectURL(response.data)
        const a = document.createElement("a")
        a.href = url
        a.download = `${form?.name || "form"}-submissions.csv`
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        // For JSON, fallback to client-side export
        if (!submissions.length) return
        const blob = new Blob([JSON.stringify(submissions, null, 2)], {
          type: "application/json",
        })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${form?.name || "form"}-submissions.json`
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error("Failed to export submissions:", error)
    }
  }

  const refreshStats = useCallback(async () => {
    try {
      const res = await formsApi.getFormStats(id)
      if (res?.data) {
        const s = res.data
        setStats({ total: s.total || 0, thisWeek: s.this_week || 0, today: s.today || 0 })
      }
    } catch {
      // stats refresh is non-critical
    }
  }, [id])

  const handleArchiveSubmission = async (submissionId) => {
    try {
      await submissionsApi.archive(submissionId)
      toast({ title: "Archived", description: "Submission moved to archive." })
      await Promise.all([
        fetchSubmissions(submissionsPage),
        fetchArchivedSubmissions(archivedPage),
        refreshStats(),
      ])
    } catch (error) {
      console.error("Failed to archive submission:", error)
      toast({ title: "Error", description: "Failed to archive submission.", variant: "destructive" })
    }
  }

  const handleRestoreSubmission = async (submissionId) => {
    try {
      await submissionsApi.restore(submissionId)
      toast({ title: "Restored", description: "Submission restored successfully." })
      await Promise.all([
        fetchSubmissions(submissionsPage),
        fetchArchivedSubmissions(archivedPage),
        refreshStats(),
      ])
    } catch (error) {
      console.error("Failed to restore submission:", error)
      toast({ title: "Error", description: "Failed to restore submission.", variant: "destructive" })
    }
  }

  const handleDeletePermanent = async (submissionId) => {
    try {
      await submissionsApi.deletePermanent(submissionId)
      toast({ title: "Deleted", description: "Submission permanently deleted." })
      await fetchArchivedSubmissions(archivedPage)
    } catch (error) {
      console.error("Failed to delete submission:", error)
      toast({ title: "Error", description: "Failed to delete submission.", variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Form not found</h2>
        <Button asChild variant="ghost">
          <Link to="/forms">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Forms
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/forms">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{form.name}</h1>
          <p className="text-muted-foreground mt-1">
            Created{" "}
            {form.createdAt || form.created_at
              ? formatDate(form.createdAt || form.created_at)
              : "—"}
          </p>
        </div>
        {form.can_manage !== false && (
          <Button variant="outline" asChild>
            <Link to={`/forms/${id}/settings`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Form Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-4 py-2 rounded-md text-sm">
              {API_BASE_URL}/f/{form.endpoint}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyEndpoint}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a
                href={`${API_BASE_URL}/f/${form.endpoint}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowQr((v) => !v)} title="QR code">
              <QrCode className="h-4 w-4" />
            </Button>
          </div>
          {copied && (
            <p className="text-sm text-green-600 mt-2">Copied to clipboard!</p>
          )}
          {showQr && (
            <div className="mt-4 flex items-start gap-4">
              <QRCodeSVG
                id="form-qr-svg"
                value={`${API_BASE_URL}/f/${form.endpoint}`}
                size={128}
                includeMargin
              />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Scan to open the form</p>
                <Button variant="outline" size="sm" onClick={handleDownloadQr}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download PNG
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Total Submissions"
          value={stats?.total || 0}
          loading={loading}
        />
        <StatsCard
          title="This Week"
          value={stats?.thisWeek || 0}
          loading={loading}
        />
        <StatsCard
          title="Today"
          value={stats?.today || 0}
          loading={loading}
        />
      </div>

      <Tabs defaultValue="submissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="submissions">
            Submissions
            {submissionsPagination?.total > 0 && (
              <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                {submissionsPagination.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archived
            {archivedPagination?.total > 0 && (
              <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                {archivedPagination.total}
              </span>
            )}
          </TabsTrigger>
          {form.can_manage !== false && (
            <TabsTrigger value="email-template">
              <Mail className="h-4 w-4 mr-1.5" />
              Email Template
            </TabsTrigger>
          )}
          <TabsTrigger value="integration">Integration</TabsTrigger>
        </TabsList>

        <TabsContent value="submissions" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("json")}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
          </div>
          {submissionsLoading ? (
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          ) : (
            <SubmissionTable
              submissions={submissions}
              onArchive={handleArchiveSubmission}
            />
          )}
          {submissionsPagination && submissionsPagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {submissionsPagination.page} of {submissionsPagination.pages} ({submissionsPagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubmissionsPage((p) => Math.max(1, p - 1))}
                  disabled={submissionsPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubmissionsPage((p) => Math.min(submissionsPagination.pages, p + 1))}
                  disabled={submissionsPage >= submissionsPagination.pages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="space-y-4">
          {archivedLoading ? (
            <div className="h-32 bg-muted animate-pulse rounded-lg" />
          ) : (
            <SubmissionTable
              submissions={archivedSubmissions}
              onRestore={handleRestoreSubmission}
              onDeletePermanent={handleDeletePermanent}
              isArchived
            />
          )}
          {archivedPagination && archivedPagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {archivedPagination.page} of {archivedPagination.pages} ({archivedPagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchivedPage((p) => Math.max(1, p - 1))}
                  disabled={archivedPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchivedPage((p) => Math.min(archivedPagination.pages, p + 1))}
                  disabled={archivedPage >= archivedPagination.pages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {form.can_manage !== false && (
          <TabsContent value="email-template">
            <EmailTemplateEditor formId={id} formName={form.name} />
          </TabsContent>
        )}

        <TabsContent value="integration">
          <CodeSnippet endpoint={form.endpoint} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
