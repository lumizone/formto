import { useState } from "react"
import { Link } from "react-router-dom"
import { MoreVertical, Trash2, ExternalLink, Copy, FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { formatDate, formatNumber } from "@/lib/utils"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.location.origin

// Deterministic color from tag string
const TAG_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-green-50 text-green-700 border-green-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
]
function tagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

export default function FormCard({ form, onDelete, showActions = false, onTagClick }) {
  const [deleteOpen, setDeleteOpen] = useState(false)

  const handleCopyEndpoint = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!form?.endpoint) return
    navigator.clipboard.writeText(`${API_BASE_URL}/f/${form.endpoint}`)
  }

  const handleDeleteClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDeleteOpen(true)
  }

  return (
    <>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete form</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{form.name}</strong>? This will permanently remove the form and all its submissions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onDelete?.()}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Link to={`/forms/${form.id}`}>
      <Card className="hover:border-border transition-colors cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-muted rounded-lg flex-shrink-0">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-sm truncate">{form.name}</h3>
            </div>
            {showActions && form.can_manage !== false && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(e) => e.preventDefault()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCopyEndpoint}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Endpoint
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href={`${API_BASE_URL}/f/${form.endpoint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Endpoint
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDeleteClick}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {form.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {form.description}
            </p>
          )}
          {form.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${tagColor(tag)}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick?.(tag) }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatNumber(form.submissionCount || 0)} submissions</span>
            <span>
              {form.createdAt || form.created_at
                ? formatDate(form.createdAt || form.created_at)
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
    </>
  )
}
