import { useEffect, useState, useCallback, useRef } from "react"
import { Link } from "react-router-dom"
import {
  Archive,
  Paperclip,
  Download,
  ChevronDown,
  ExternalLink,
  Reply,
  Send,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { submissionsApi } from "@/lib/api"
import { toast } from "@/hooks/use-toast"
import { formatDate, truncate } from "@/lib/utils"
import { useUnread } from "@/contexts/UnreadContext"

const STATUS_CONFIG = {
  new: { label: "New", color: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "In Progress", color: "bg-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  resolved: { label: "Resolved", color: "bg-green-500", badge: "bg-green-50 text-green-700 border-green-200" },
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
]

function StatusDot({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${cfg.color}`} />
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

function SubmissionRow({ submission, onArchive, onStatusChange, onRead }) {
  const [expanded, setExpanded] = useState(false)
  const [isRead, setIsRead] = useState(!!submission.read_at)
  const [status, setStatus] = useState(submission.status || "new")
  const [notes, setNotes] = useState(submission.notes || "")
  const [savingNotes, setSavingNotes] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [replySubject, setReplySubject] = useState("")
  const [replyMessage, setReplyMessage] = useState("")
  const [sendingReply, setSendingReply] = useState(false)
  const notesTimer = useRef(null)

  const fields = Object.entries(submission.data || {})
  const fileUrls = submission.file_urls || []
  const hasEmail = fields.some(([k]) => k.toLowerCase().includes("email"))

  const handleExpand = () => {
    const next = !expanded
    setExpanded(next)
    if (next && !isRead) {
      setIsRead(true)
      submissionsApi.markRead(submission.id).catch(() => {})
      onRead?.(submission.id)
    }
  }

  const handleStatusChange = async (newStatus) => {
    const prev = status
    setStatus(newStatus)
    try {
      await submissionsApi.updateStatus(submission.id, newStatus)
      onStatusChange(submission.id, newStatus)
    } catch {
      setStatus(prev)
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" })
    }
  }

  const handleSendReply = async () => {
    if (!replySubject.trim() || !replyMessage.trim()) return
    setSendingReply(true)
    try {
      await submissionsApi.reply(submission.id, { subject: replySubject, message: replyMessage })
      toast({ title: "Reply sent", description: "Your message was sent to the submitter." })
      setShowReply(false)
      setReplySubject("")
      setReplyMessage("")
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to send reply."
      toast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setSendingReply(false)
    }
  }

  const handleNotesChange = (value) => {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      setSavingNotes(true)
      try {
        await submissionsApi.updateNotes(submission.id, value)
      } catch {
        toast({ title: "Notes not saved", description: "Failed to save notes. Please try again.", variant: "destructive" })
      } finally {
        setSavingNotes(false)
      }
    }, 800)
  }

  useEffect(() => {
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current)
    }
  }, [])

  return (
    <Card className={`mb-2 transition-colors ${status === "resolved" ? "opacity-60" : ""} ${!isRead ? "border-l-2 border-l-primary" : ""}`}>
      <CardContent className="p-0">
        {/* Row header */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-lg"
          onClick={handleExpand}
        >
          <StatusDot status={status} />

          {/* Form name */}
          <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded text-muted-foreground whitespace-nowrap">
            {submission.form_name || "Unknown form"}
          </span>

          {/* Data preview */}
          <span className={`flex-1 text-sm truncate min-w-0 ${!isRead ? "font-medium text-foreground" : "text-foreground"}`}>
            {fields.length > 0
              ? truncate(fields.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join("  ·  "), 80)
              : "No data"}
          </span>

          {/* Attachments */}
          {fileUrls.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
              <Paperclip className="h-3 w-3" />
              {fileUrls.length}
            </span>
          )}

          {/* Status badge */}
          <div className="hidden sm:block">
            <StatusBadge status={status} />
          </div>

          {/* Date */}
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">
            {formatDate(submission.created_at)}
          </span>

          <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t px-4 py-4 space-y-4">
            {/* Actions row */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <Select value={status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-7 text-xs w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => onArchive(submission.id)}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                Archive
              </Button>

              {hasEmail && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); setShowReply((v) => !v) }}
                >
                  <Reply className="h-3.5 w-3.5 mr-1.5" />
                  Reply
                </Button>
              )}

              <Link
                to={`/forms/${submission.form_id}`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open form
              </Link>
            </div>

            {/* Fields */}
            <div className="grid gap-2">
              {fields.map(([key, value]) => (
                <div key={key} className="grid grid-cols-4 gap-3 text-sm">
                  <span className="font-medium text-muted-foreground capitalize col-span-1">{key}</span>
                  <span className="col-span-3 break-words">
                    {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                  </span>
                </div>
              ))}
            </div>

            {/* Attachments */}
            {fileUrls.length > 0 && (
              <div className="pt-2 border-t space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Attachments</span>
                {fileUrls.map((file, i) => (
                  <a
                    key={i}
                    href={file.url || file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{file.name || `File ${i + 1}`}</span>
                    {file.size && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-4 gap-3 text-sm pt-2 border-t">
              <span className="text-muted-foreground">IP Address</span>
              <span className="col-span-3">{submission.metadata?.ip || "N/A"}</span>
              <span className="text-muted-foreground">Received</span>
              <span className="col-span-3">{formatDate(submission.created_at)}</span>
              {submission.metadata?.referer && (
                <>
                  <span className="text-muted-foreground">Source</span>
                  <span className="col-span-3 truncate">
                    <a href={submission.metadata.referer} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {submission.metadata.referer}
                    </a>
                  </span>
                </>
              )}
            </div>

            {/* Notes */}
            <div className="pt-2 border-t space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Internal notes</span>
                {savingNotes && (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                )}
              </div>
              <textarea
                className="w-full text-sm bg-muted/40 border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
                rows={3}
                placeholder="Add a note about this submission…"
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Reply form */}
            {showReply && (
              <div className="pt-2 border-t space-y-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs font-medium text-muted-foreground">Reply to submitter</span>
                <Input
                  placeholder="Subject"
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                />
                <textarea
                  className="w-full text-sm bg-muted/40 border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
                  rows={4}
                  placeholder="Your message…"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" disabled={sendingReply || !replySubject.trim() || !replyMessage.trim()} onClick={handleSendReply}>
                    {sendingReply ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Send className="h-3 w-3 mr-1.5" />}
                    Send
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowReply(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function Submissions() {
  const { unreadCount, decrement, reset } = useUnread()
  const [submissions, setSubmissions] = useState([])
  const [forms, setForms] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [formFilter, setFormFilter] = useState("all")
  const [page, setPage] = useState(1)
  const fetchGeneration = useRef(0)

  const fetchSubmissions = useCallback(async () => {
    const generation = ++fetchGeneration.current
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (statusFilter !== "all") params.status = statusFilter
      if (formFilter !== "all") params.formId = formFilter

      const response = await submissionsApi.getAll(params)
      if (generation !== fetchGeneration.current) return
      const data = response.data?.submissionsData || response.data || {}
      setSubmissions(data.submissions || [])
      setForms(data.forms || [])
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 0 })
    } catch (error) {
      if (generation !== fetchGeneration.current) return
      console.error("Failed to fetch submissions:", error)
    } finally {
      if (generation === fetchGeneration.current) setLoading(false)
    }
  }, [page, statusFilter, formFilter])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value)
    setPage(1)
  }

  const handleFormFilterChange = (value) => {
    setFormFilter(value)
    setPage(1)
  }

  const handleArchive = async (id) => {
    try {
      await submissionsApi.archive(id)
      setSubmissions((prev) => prev.filter((s) => s.id !== id))
      toast({ title: "Archived", description: "Submission moved to archive." })
    } catch {
      toast({ title: "Error", description: "Failed to archive.", variant: "destructive" })
    }
  }

  const handleStatusChange = (id, newStatus) => {
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s))
    )
  }

  const handleRead = (id) => {
    decrement(1)
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, read_at: new Date().toISOString() } : s))
    )
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await submissionsApi.markAllRead(formFilter !== "all" ? formFilter : undefined)
      setSubmissions((prev) => prev.map((s) => ({ ...s, read_at: s.read_at || new Date().toISOString() })))
      reset()
      toast({ title: "Done", description: "All submissions marked as read." })
    } catch {
      toast({ title: "Error", description: "Failed to mark all as read.", variant: "destructive" })
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <p className="text-muted-foreground mt-1">
            All submissions across your forms
            {!loading && pagination.total > 0 && (
              <span className="ml-2 text-sm">— {pagination.total} total</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="text-sm font-medium bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full">
              {unreadCount} unread
            </span>
          )}
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={markingAll}
              onClick={handleMarkAllRead}
            >
              {markingAll ? "Marking…" : "Mark all as read"}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleStatusFilterChange(f.value)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                statusFilter === f.value
                  ? "bg-white text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Form filter */}
        {forms.length > 1 && (
          <Select value={formFilter} onValueChange={handleFormFilterChange}>
            <SelectTrigger className="h-9 text-sm w-[180px]">
              <SelectValue placeholder="All forms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All forms</SelectItem>
              {forms.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground font-medium">No submissions found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter !== "all" || formFilter !== "all"
                ? "Try changing the filters above"
                : "Submissions will appear here once your forms receive data"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div>
            {submissions.map((submission) => (
              <SubmissionRow
                key={submission.id}
                submission={submission}
                onArchive={handleArchive}
                onStatusChange={handleStatusChange}
                onRead={handleRead}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
