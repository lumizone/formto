import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { isValidUrl, isValidEmail } from "@/lib/utils"
import { formsApi } from "@/lib/api"

const generateEndpoint = (name) => {
  const slug =
    name
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "form"

  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let suffix = ""

  if (window.crypto?.getRandomValues) {
    const randomValues = new Uint32Array(8)
    window.crypto.getRandomValues(randomValues)
    suffix = Array.from(randomValues)
      .map((v) => chars[v % chars.length])
      .join("")
  } else {
    for (let i = 0; i < 8; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length))
    }
  }

  return `${slug}-${suffix}`
}

export default function CreateForm() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    redirectUrl: "",
    notificationEmail: "",
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    // Strip dangerous patterns without trimming — trim happens on submit
    const sanitized = typeof value === 'string'
      ? value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+=/gi, '')
      : value
    setFormData((prev) => ({ ...prev, [name]: sanitized }))
    if (error) setError("")
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validate form name
    if (!formData.name.trim()) {
      setError("Form name is required")
      return
    }
    
    // Validate URL if provided
    if (formData.redirectUrl && !isValidUrl(formData.redirectUrl)) {
      setError('Please enter a valid URL starting with http:// or https://')
      return
    }
    
    // Validate email if provided
    if (formData.notificationEmail && !isValidEmail(formData.notificationEmail)) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      // Create form using API
      const endpoint = generateEndpoint(formData.name)

      const response = await formsApi.create({
        name: formData.name,
        description: formData.description || null,
        endpoint,
        redirect_url: formData.redirectUrl || null,
        notification_email: formData.notificationEmail || null,
      })

      const newForm = response.data
      if (!newForm) {
        throw new Error("Failed to create form")
      }

      navigate(`/forms/${newForm.id}`)
    } catch (err) {
      // Only log in development
      if (import.meta.env.DEV) {
        console.error("Failed to create form:", err)
      }
      setError(err.response?.data?.message || err.message || "Failed to create form")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/forms">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create New Form</h1>
          <p className="text-muted-foreground mt-1">
            Set up a new form to collect submissions
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Form Details</CardTitle>
          <CardDescription>
            Enter the basic information for your form
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Form Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="Contact Form"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                placeholder="A brief description of your form"
                value={formData.description}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="redirectUrl">Redirect URL</Label>
              <Input
                id="redirectUrl"
                name="redirectUrl"
                type="url"
                placeholder="https://yoursite.com/thank-you"
                value={formData.redirectUrl}
                onChange={handleChange}
              />
              <p className="text-sm text-muted-foreground">
                Users will be redirected here after form submission
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notificationEmail">Notification Email</Label>
              <Input
                id="notificationEmail"
                name="notificationEmail"
                type="email"
                placeholder="you@example.com"
                value={formData.notificationEmail}
                onChange={handleChange}
              />
              <p className="text-sm text-muted-foreground">
                Send email notifications to this address. SMTP must be configured in{" "}
                <a href="/account?tab=notifications" className="underline">Account → Notifications</a>,
                and email toggled on in Form Settings.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={loading}
              >
                {loading ? "Creating..." : "Create Form"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/forms">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
