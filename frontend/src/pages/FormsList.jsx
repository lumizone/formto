import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Link } from "react-router-dom"
import { Plus, Search, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import FormCard from "@/components/FormCard"
import { formsApi } from "@/lib/api"
import { toast } from "@/hooks/use-toast"

export default function FormsList() {
  const { user } = useAuth()
  const [forms, setForms] = useState([])
  const [filteredForms, setFilteredForms] = useState([])
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchForms() {
      try {
        if (!user) {
          setLoading(false)
          return
        }

        // Load forms using API
        const response = await formsApi.getAll()
        const formsData = response.data || []

        // Forms from API should already have submission_count if backend includes it
        // If not, we can fetch it separately or use a default value
        const formsWithCounts = formsData.map((form) => ({
          ...form,
          submissionCount: form.submission_count || form.submissionCount || 0,
        }))

        setForms(formsWithCounts)
        setFilteredForms(formsWithCounts)
      } catch (error) {
        console.error("Failed to fetch forms:", error)
        setForms([])
        setFilteredForms([])
      } finally {
        setLoading(false)
      }
    }
    fetchForms()
  }, [user])

  useEffect(() => {
    let filtered = forms
    if (search) {
      filtered = filtered.filter((form) =>
        form.name.toLowerCase().includes(search.toLowerCase())
      )
    }
    if (tagFilter) {
      filtered = filtered.filter((form) => form.tags?.includes(tagFilter))
    }
    setFilteredForms(filtered)
  }, [search, tagFilter, forms])

  const handleDelete = async (id) => {
    try {
      await formsApi.delete(id)
      const nextForms = forms.filter((form) => form.id !== id)
      setForms(nextForms)
      setFilteredForms(nextForms)
      toast({ title: "Form deleted", description: "The form has been deleted." })
    } catch (error) {
      console.error("Failed to delete form:", error)
      toast({
        title: "Failed to delete",
        description: error.response?.data?.message || "Something went wrong.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <p className="text-muted-foreground mt-0.5">
            Manage your forms and view submissions
          </p>
        </div>
        <Button asChild>
          <Link to="/forms/create">
            <Plus className="h-4 w-4 mr-2" />
            New Form
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search forms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {tagFilter && (
          <button
            onClick={() => setTagFilter("")}
            className="flex items-center gap-1 px-2.5 py-1 text-sm rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            #{tagFilter} ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : filteredForms.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredForms.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              onDelete={() => handleDelete(form.id)}
              showActions
              onTagClick={setTagFilter}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium mb-1">
            {search ? "No forms found" : "No forms yet"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {search
              ? "Try a different search term"
              : "Create your first form to start collecting submissions"}
          </p>
          {!search && (
            <Button asChild>
              <Link to="/forms/create">
                <Plus className="h-4 w-4 mr-2" />
                Create Form
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
