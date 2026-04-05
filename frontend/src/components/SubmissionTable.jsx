import { useState } from "react"
import { Trash2, ChevronDown, ChevronUp, Archive, RotateCcw, Paperclip, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatDate, truncate } from "@/lib/utils"

function SubmissionRow({ submission, onArchive, onRestore, onDeletePermanent, isArchived }) {
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const fields = Object.entries(submission.data || {})
  const fileUrls = submission.file_urls || []

  const handleActionClick = () => setDialogOpen(true)

  return (
    <>
    <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isArchived ? "Delete permanently?" : "Archive submission"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArchived
              ? "This will permanently delete the submission. This action cannot be undone."
              : "The submission will be moved to the archive. You can restore it later."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => isArchived ? onDeletePermanent(submission.id) : onArchive(submission.id)}
          >
            {isArchived ? "Delete permanently" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Card className="mb-2">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {formatDate(submission.created_at || submission.createdAt)}
              </span>
              {fields.length > 0 && (
                <span className="text-sm truncate">
                  {truncate(
                    fields
                      .slice(0, 2)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", "),
                    60
                  )}
                </span>
              )}
              {fileUrls.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  {fileUrls.length} file{fileUrls.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            {isArchived && onRestore && (
              <Button
                variant="ghost"
                size="icon"
                title="Restore submission"
                onClick={() => onRestore(submission.id)}
              >
                <RotateCcw className="h-4 w-4 text-green-600" />
              </Button>
            )}
            {!isArchived && onArchive && (
              <Button
                variant="ghost"
                size="icon"
                title="Archive submission"
                onClick={handleActionClick}
              >
                <Archive className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            {isArchived && onDeletePermanent && (
              <Button
                variant="ghost"
                size="icon"
                title="Delete permanently"
                onClick={handleActionClick}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {fields.map(([key, value]) => (
              <div key={key} className="grid grid-cols-3 gap-4">
                <span className="text-sm font-medium text-muted-foreground">
                  {key}
                </span>
                <span className="col-span-2 text-sm break-words">
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </span>
              </div>
            ))}

            {fileUrls.length > 0 && (
              <div className="pt-2 border-t">
                <span className="text-sm font-medium text-muted-foreground flex items-center gap-1 mb-2">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attachments
                </span>
                <div className="space-y-1.5">
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
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 pt-2 border-t">
              <span className="text-sm font-medium text-muted-foreground">
                IP Address
              </span>
              <span className="col-span-2 text-sm">
                {submission.metadata?.ip || "N/A"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <span className="text-sm font-medium text-muted-foreground">
                User Agent
              </span>
              <span className="col-span-2 text-sm break-words">
                {truncate(submission.metadata?.userAgent, 100) || "N/A"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  )
}

export default function SubmissionTable({ submissions, onArchive, onRestore, onDeletePermanent, isArchived = false }) {
  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            {isArchived ? "No archived submissions" : "No submissions yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {isArchived
              ? "Archived submissions will appear here"
              : "Submissions will appear here once your form receives data"}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {submissions.map((submission) => (
        <SubmissionRow
          key={submission.id}
          submission={submission}
          onArchive={onArchive}
          onRestore={onRestore}
          onDeletePermanent={onDeletePermanent}
          isArchived={isArchived}
        />
      ))}
    </div>
  )
}
