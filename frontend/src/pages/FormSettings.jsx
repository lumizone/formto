import { useEffect, useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Save, Loader2, Mail, Slack, Send, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { formsApi, webhooksApi } from "@/lib/api"
import { isValidUrl } from "@/lib/utils"

export default function FormSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState(null)
  const [testingWebhook, setTestingWebhook] = useState(false)
  const [blocklistInput, setBlocklistInput] = useState("")
  const [tagInput, setTagInput] = useState("")
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
    redirect_url: "",
    webhook_url: "",
    blocklist: [],
    close_after_submissions: "",
    close_at: "",
    tags: [],
    notify_email: false,
    notify_telegram: false,
    notify_slack: false,
  })

  useEffect(() => {
    async function fetchForm() {
      try {
        if (!id) {
          setLoading(false)
          return
        }

        const response = await formsApi.getById(id)
        const formData = response.data

        if (!formData) {
          setError("Form not found")
          setForm(null)
          return
        }

        if (formData.can_manage === false) {
          setError("You don't have permission to edit this form.")
          setForm(null)
          return
        }

        setForm(formData)
        setFormData({
          name: formData.name || "",
          description: formData.description || "",
          active: formData.active !== false,
          redirect_url: formData.redirect_url || "",
          webhook_url: formData.webhook_url || "",
          blocklist: formData.blocklist || [],
          close_after_submissions: formData.close_after_submissions || "",
          close_at: formData.close_at ? formData.close_at.slice(0, 16) : "",
          tags: formData.tags || [],
          notify_email: formData.notify_email || false,
          notify_telegram: formData.notify_telegram || false,
          notify_slack: formData.notify_slack || false,
        })
      } catch (err) {
        console.error("Failed to fetch form:", err)
        setError("Failed to load form settings")
      } finally {
        setLoading(false)
      }
    }

    fetchForm()
  }, [id])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    
    // For checkbox/switch, use checked value directly
    if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [name]: checked }))
      setError("")
      return
    }

    // For text inputs, allow typing without validation during input
    // Only sanitize (remove dangerous chars), but don't trim or validate format yet
    let sanitized = value
    
    // Basic XSS prevention without trimming (allow spaces during typing)
    if (typeof value === 'string') {
      sanitized = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
    }

    // Always update the field value (user can type incomplete URLs/emails)
    setFormData((prev) => ({ ...prev, [name]: sanitized }))

    // Clear error when user starts typing
    if (error) {
      setError("")
    }
  }

  const handleBlur = (e) => {
    // Validate on blur (when user leaves the field)
    const { name, value } = e.target
    const trimmedValue = value.trim()

    if ((name === "redirect_url" || name === "webhook_url") && trimmedValue && !isValidUrl(trimmedValue)) {
      setError("Please enter a valid URL starting with http:// or https://")
    } else {
      // If valid or empty, trim and update the value
      if (trimmedValue !== value) {
        setFormData((prev) => ({ ...prev, [name]: trimmedValue }))
      }
      setError("")
    }
  }

  const handleSwitchChange = (checked) => {
    setFormData((prev) => ({ ...prev, active: checked }))
  }

  const handleTestWebhook = async () => {
    const url = formData.webhook_url?.trim()
    if (!url) return
    setTestingWebhook(true)
    try {
      await webhooksApi.test(url, { test: true, form_id: id, form_name: formData.name, timestamp: new Date().toISOString() })
      toast({ title: "Webhook sent", description: "Test payload delivered successfully." })
    } catch (err) {
      toast({ title: "Webhook failed", description: "Could not deliver test payload. Check the URL.", variant: "destructive" })
    } finally {
      setTestingWebhook(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate form name
    if (!formData.name.trim()) {
      setError("Form name is required")
      return
    }

    // Validate redirect URL if provided (trim before validation)
    const redirectUrl = formData.redirect_url?.trim() || ""
    if (redirectUrl && !isValidUrl(redirectUrl)) {
      setError("Please enter a valid Redirect URL starting with http:// or https://")
      return
    }

    setSaving(true)
    setError("")

    try {
      if (!id) {
        throw new Error("Form ID not available")
      }

      const updateData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        active: formData.active,
        redirect_url: formData.redirect_url?.trim() || null,
        webhook_url: formData.webhook_url?.trim() || null,
        blocklist: formData.blocklist || [],
        close_after_submissions: formData.close_after_submissions ? parseInt(formData.close_after_submissions) : null,
        close_at: formData.close_at ? new Date(formData.close_at).toISOString() : null,
        tags: formData.tags || [],
        notify_email: formData.notify_email,
        notify_telegram: formData.notify_telegram,
        notify_slack: formData.notify_slack,
      }

      await formsApi.update(id, updateData)

      toast({
        title: "Form updated",
        description: "Your form settings have been saved successfully.",
        variant: "success",
      })

      // Navigate back to form details
      navigate(`/forms/${id}`)
    } catch (err) {
      console.error("Failed to update form:", err)
      setError(err.response?.data?.message || err.message || "Failed to update form settings")
      toast({
        title: "Error",
        description: err.message || "Failed to update form settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
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
        <p className="text-muted-foreground mb-4">{error || "The form you're looking for doesn't exist or you don't have permission to edit it."}</p>
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/forms/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Form Settings</h1>
          <p className="text-muted-foreground mt-1">
            Edit your form settings and configuration
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              General information about your form
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Form Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="Contact Form"
                value={formData.name || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                placeholder="A brief description of your form"
                value={formData.description || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="active">Active</Label>
                <p className="text-sm text-muted-foreground">
                  Enable or disable form submissions
                </p>
              </div>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={handleSwitchChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                value={form.endpoint || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                Form endpoint cannot be changed after creation
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submission Settings</CardTitle>
            <CardDescription>
              Configure what happens after a form is submitted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="redirect_url">Redirect URL</Label>
              <Input
                id="redirect_url"
                name="redirect_url"
                type="text"
                placeholder="https://yoursite.com/thank-you"
                value={formData.redirect_url || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={saving}
              />
              <p className="text-sm text-muted-foreground">
                Users will be redirected here after form submission (optional)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook_url">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="webhook_url"
                  name="webhook_url"
                  type="text"
                  placeholder="https://hooks.zapier.com/..."
                  value={formData.webhook_url || ""}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={saving}
                />
                {formData.webhook_url?.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap"
                    disabled={testingWebhook || saving}
                    onClick={handleTestWebhook}
                  >
                    {testingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Test</span>
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                POST each submission as JSON to this URL — works with Zapier, Make, n8n, Slack, etc. (optional)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Choose which channels to use for this form. Configure channels in{" "}
              <Link to="/account?tab=notifications" className="text-primary hover:underline">Account → Notifications</Link>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-xs text-muted-foreground">Send an email for each new submission</p>
                </div>
              </div>
              <Switch
                checked={!!formData.notify_email}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, notify_email: checked }))}
                disabled={saving}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Send className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Telegram</p>
                  <p className="text-xs text-muted-foreground">Send a Telegram message for each new submission</p>
                </div>
              </div>
              <Switch
                checked={!!formData.notify_telegram}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, notify_telegram: checked }))}
                disabled={saving}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Slack className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Slack</p>
                  <p className="text-xs text-muted-foreground">Send a Slack message for each new submission</p>
                </div>
              </div>
              <Switch
                checked={!!formData.notify_slack}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, notify_slack: checked }))}
                disabled={saving}
              />
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spam Blocklist</CardTitle>
            <CardDescription>
              Silently reject submissions from specific emails, domains, or IP addresses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.blocklist.map((entry, i) => (
              <div key={`${entry.type}-${entry.value}`} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase">{entry.type}</span>
                <span className="flex-1 text-sm">{entry.value}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setFormData((prev) => ({ ...prev, blocklist: prev.blocklist.filter((_, j) => j !== i) }))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="email, @domain.com, or IP address"
                value={blocklistInput}
                onChange={(e) => setBlocklistInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    const v = blocklistInput.trim()
                    if (!v) return
                    const type = v.startsWith("@") ? "domain" : /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(v) ? "ip" : "email"
                    const value = v.startsWith("@") ? v.slice(1) : v
                    if (!formData.blocklist.some(b => b.value === value)) {
                      setFormData((prev) => ({ ...prev, blocklist: [...prev.blocklist, { type, value }] }))
                      setBlocklistInput("")
                    }
                  }
                }}
                disabled={saving}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const v = blocklistInput.trim()
                  if (!v) return
                  const type = v.startsWith("@") ? "domain" : /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(v) ? "ip" : "email"
                  const value = v.startsWith("@") ? v.slice(1) : v
                  if (!formData.blocklist.some(b => b.value === value)) {
                    setFormData((prev) => ({ ...prev, blocklist: [...prev.blocklist, { type, value }] }))
                    setBlocklistInput("")
                  }
                }}
                disabled={saving}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Enter an email, @domain.com to block a whole domain, or an IP address</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-Close</CardTitle>
            <CardDescription>
              Automatically stop accepting submissions after a date or limit is reached
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="close_after_submissions">Close after X submissions</Label>
              <Input
                id="close_after_submissions"
                name="close_after_submissions"
                type="number"
                min="1"
                placeholder="e.g. 100 (leave empty for unlimited)"
                value={formData.close_after_submissions || ""}
                onChange={handleChange}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="close_at">Close on date</Label>
              <Input
                id="close_at"
                name="close_at"
                type="datetime-local"
                value={formData.close_at || ""}
                onChange={handleChange}
                disabled={saving}
              />
              <p className="text-sm text-muted-foreground">Form will stop accepting submissions after this date and time</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Labels</CardTitle>
            <CardDescription>
              Tag your forms to organize and filter them in the forms list
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {formData.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))}
                    className="hover:text-primary/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a label (e.g. production)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    const v = tagInput.trim().toLowerCase().replace(/\s+/g, "-")
                    if (v && !formData.tags.includes(v)) {
                      setFormData((prev) => ({ ...prev, tags: [...prev.tags, v] }))
                      setTagInput("")
                    }
                  }
                }}
                disabled={saving}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const v = tagInput.trim().toLowerCase().replace(/\s+/g, "-")
                  if (v && !formData.tags.includes(v)) {
                    setFormData((prev) => ({ ...prev, tags: [...prev.tags, v] }))
                    setTagInput("")
                  }
                }}
                disabled={saving}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex gap-4">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={`/forms/${id}`}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
