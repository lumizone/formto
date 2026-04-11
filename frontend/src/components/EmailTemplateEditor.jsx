import { useState, useEffect, useRef } from "react"
import ReactQuill from "react-quill-new"
import DOMPurify from "dompurify"
import "react-quill-new/dist/quill.snow.css"
import { Send, Save, RotateCcw, Mail, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import VariablePicker from "@/components/VariablePicker"
import LogoUpload from "@/components/LogoUpload"
import { toast } from "@/hooks/use-toast"
import { formsApi } from "@/lib/api"

const MAX_SUBJECT_LENGTH = 200
const MAX_BODY_SIZE = 50 * 1024 // 50KB

const DEFAULT_SUBJECT = "New submission from {{form_name}}"
const DEFAULT_BODY = `{{#if logo}}
<img src="{{logo}}" width="150" alt="Logo" style="margin-bottom: 20px;" />
{{/if}}
<h2 style="color: #2563EB;">New Form Submission</h2>
<p><strong>Form:</strong> {{form_name}}</p>
<p><strong>Date:</strong> {{date}}</p>
<hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
<h3>Submission Details:</h3>
<p><strong>Name:</strong> {{name}}</p>
<p><strong>Email:</strong> {{email}}</p>
<p><strong>Message:</strong> {{message}}</p>
<hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
<p style="color: #6b7280; font-size: 12px;">Powered by FormTo</p>`

const SAMPLE_DATA = {
  "{{name}}": "John Doe",
  "{{email}}": "john@example.com",
  "{{message}}": "Sample message text from the form submission.",
  "{{phone}}": "+1 (555) 123-4567",
  "{{form_name}}": "Contact Form",
  "{{date}}": new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }),
}

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline"],
    ["link"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["clean"],
  ],
}

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "link",
  "list",
  "image",
]

export default function EmailTemplateEditor({ formId, formName }) {
  const [templateEnabled, setTemplateEnabled] = useState(false)
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [logoUrl, setLogoUrl] = useState("")
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [customFields, setCustomFields] = useState([])

  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Validation
  const [validationErrors, setValidationErrors] = useState({})

  const quillRef = useRef(null)
  const subjectInputRef = useRef(null)

  // Extract custom fields from form submissions
  useEffect(() => {
    async function extractCustomFields() {
      if (!formId) return

      try {
        // Get form using API
        const formResponse = await formsApi.getById(formId)
        const formData = formResponse.data

        if (!formData) return

        // Get recent submissions to extract field names using API
        const submissionsResponse = await formsApi.getSubmissions(formId, { limit: 50 })
        const submissions = submissionsResponse.data || []

        if (!submissions || submissions.length === 0) return

        // Extract all unique field names from submissions
        const fieldSet = new Set()
        const defaultFields = ["name", "email", "message", "phone", "form_name", "date", "logo"]

        submissions.forEach((sub) => {
          if (sub.data && typeof sub.data === "object") {
            Object.keys(sub.data).forEach((key) => {
              // Only include fields that are not default variables
              if (!defaultFields.includes(key.toLowerCase())) {
                fieldSet.add(key)
              }
            })
          }
        })

        setCustomFields(Array.from(fieldSet).sort())
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Failed to extract custom fields:", error)
        }
      }
    }

    extractCustomFields()
  }, [formId])

  // Load template using API on mount
  useEffect(() => {
    async function loadTemplate() {
      setIsLoading(true)
      setLoadError(null)

      try {
        // Load form using API
        let formData = null
        
        const response = await formsApi.getById(formId)
        formData = response.data

        if (!formData) {
          throw new Error("Form not found")
        }

        // Set template data from form
        setTemplateEnabled(formData.email_template_enabled || false)
        setSubject(formData.email_template_subject || DEFAULT_SUBJECT)
        setBody(formData.email_template_body || DEFAULT_BODY)
        setLogoUrl(formData.logo_url || "")
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Failed to load template:", error)
        }
        setLoadError("Failed to load email template. Please refresh the page.")
        toast({
          title: "Error",
          description: error.response?.data?.message || error.message || "Failed to load email template",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (formId) {
      loadTemplate()
    }
  }, [formId])

  // Validation
  useEffect(() => {
    const errors = {}

    if (subject.length > MAX_SUBJECT_LENGTH) {
      errors.subject = `Subject too long (${subject.length}/${MAX_SUBJECT_LENGTH})`
    }

    const bodySize = new Blob([body]).size
    if (bodySize > MAX_BODY_SIZE) {
      errors.body = `Body too large (${(bodySize / 1024).toFixed(1)}KB / ${MAX_BODY_SIZE / 1024}KB)`
    }

    setValidationErrors(errors)
  }, [subject, body])

  const hasValidationErrors = Object.keys(validationErrors).length > 0

  // Handle variable insertion for subject
  const handleSubjectVariableInsert = (variable) => {
    const input = subjectInputRef.current
    if (input) {
      const start = input.selectionStart
      const end = input.selectionEnd
      const newValue =
        subject.substring(0, start) + variable + subject.substring(end)
      setSubject(newValue)
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      setSubject(subject + variable)
    }
  }

  // Handle variable insertion for body (Quill)
  const handleBodyVariableInsert = (variable) => {
    const quill = quillRef.current?.getEditor()
    if (quill) {
      const range = quill.getSelection()
      if (range) {
        quill.insertText(range.index, variable)
        quill.setSelection(range.index + variable.length)
      } else {
        const length = quill.getLength()
        quill.insertText(length - 1, variable)
      }
    }
  }

  // Handle logo change
  const handleLogoChange = async (newLogoUrl) => {
    setLogoUrl(newLogoUrl || "")

    // Auto-save logo URL to database using API
    try {
      await formsApi.update(formId, { logo_url: newLogoUrl })

      toast({
        title: newLogoUrl ? "Logo uploaded" : "Logo removed",
        description: newLogoUrl
          ? "Your logo has been saved"
          : "Logo has been removed",
        variant: "success",
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to save logo URL:", error)
      }
      toast({
        title: "Error",
        description: "Failed to save logo. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle logo upload error
  const handleLogoError = (message) => {
    toast({
      title: "Upload Error",
      description: message,
      variant: "destructive",
    })
  }

  // Save template using API
  const handleSave = async () => {
    if (hasValidationErrors) {
      toast({
        title: "Validation Error",
        description: "Please fix validation errors before saving",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      await formsApi.update(formId, {
        email_template_enabled: templateEnabled,
        email_template_subject: subject,
        email_template_body: body,
        logo_url: logoUrl || null,
      })

      toast({
        title: "Template saved",
        description: templateEnabled
          ? "Your custom email template will be used for future submissions"
          : "Default template will be used for future submissions",
        variant: "success",
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to save template:", error)
      }
      toast({
        title: "Save failed",
        description: error.message || "Failed to save template. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Reset to default template
  const handleReset = async () => {
    setSubject(DEFAULT_SUBJECT)
    setBody(DEFAULT_BODY)
    setResetDialogOpen(false)
    toast({
      title: "Template reset",
      description: "Template has been reset to default. Click Save to apply.",
    })
  }

  // Send test email
  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      })
      return
    }

    setIsSendingTest(true)
    try {
      if (import.meta.env.DEV) {
        console.log("📧 Sending test email to:", testEmail, "for form:", formId)
      }
      const response = await formsApi.sendTestEmail(formId, testEmail)
      if (import.meta.env.DEV) {
        console.log("✅ Test email sent successfully:", response.data)
      }

      toast({
        title: "Test email sent",
        description: `Test email has been sent to ${testEmail}. Please check your inbox.`,
        variant: "success",
      })

      setTestEmailDialogOpen(false)
      setTestEmail("")
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("❌ Error sending test email:", error)
        console.error("❌ Error details:", {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            // Don't log headers - may contain sensitive data
          }
        })
      }
      
      let errorMessage = "Failed to send test email. Please try again."
      
      // Handle CORS errors specifically
      if (error.message?.includes("CORS") || error.code === "ERR_NETWORK") {
        errorMessage = "CORS error: Backend may have incorrect CORS configuration. Please contact support."
      } else if (error.response?.status === 401) {
        errorMessage = "Authentication failed. Please refresh the page and try again."
      } else if (error.response?.status === 404) {
        errorMessage = "Test email endpoint not found. Please ensure backend is up to date."
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast({
        title: "Failed to send test email",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  // Generate preview content
  const getPreviewContent = () => {
    let previewBody = body

    // Replace variables with sample data
    Object.entries(SAMPLE_DATA).forEach(([variable, value]) => {
      previewBody = previewBody.split(variable).join(value)
    })

    // Replace form_name with actual form name
    previewBody = previewBody.split("{{form_name}}").join(formName || "Contact Form")

    // Handle logo placeholder
    if (logoUrl) {
      previewBody = previewBody.replace(/{{logo}}/g, logoUrl)
      // Remove the handlebars conditional wrapper for preview
      previewBody = previewBody.replace(/{{#if logo}}/g, "")
      previewBody = previewBody.replace(/{{\/if}}/g, "")
    } else {
      // Remove entire logo block if no logo
      previewBody = previewBody.replace(
        /{{#if logo}}[\s\S]*?{{\/if}}/g,
        ""
      )
      previewBody = previewBody.replace(
        /<img[^>]*{{logo}}[^>]*>/g,
        ""
      )
    }

    return previewBody
  }

  const getPreviewSubject = () => {
    let previewSubject = subject
    Object.entries(SAMPLE_DATA).forEach(([variable, value]) => {
      previewSubject = previewSubject.split(variable).join(value)
    })
    previewSubject = previewSubject.split("{{form_name}}").join(formName || "Contact Form")
    return previewSubject
  }

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading email template...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (loadError) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div>
          <Label htmlFor="template-enabled" className="text-base font-medium">
            Enable custom email template
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Customize the email sent when someone submits this form
          </p>
        </div>
        <Switch
          id="template-enabled"
          checked={templateEnabled}
          onCheckedChange={setTemplateEnabled}
        />
      </div>

      {templateEnabled ? (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Editor Section - 60% */}
          <div className="lg:col-span-3 space-y-6">
            {/* Subject Line */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Subject Line</CardTitle>
                <CardDescription>
                  The subject of the notification email
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      ref={subjectInputRef}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter email subject..."
                      maxLength={MAX_SUBJECT_LENGTH + 50}
                      className={validationErrors.subject ? "border-destructive" : ""}
                    />
                    <div className="flex justify-between mt-1">
                      {validationErrors.subject ? (
                        <p className="text-xs text-destructive">{validationErrors.subject}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Use {"{{variable}}"} to insert dynamic data
                        </p>
                      )}
                      <span className={`text-xs ${subject.length > MAX_SUBJECT_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                        {subject.length}/{MAX_SUBJECT_LENGTH}
                      </span>
                    </div>
                  </div>
                  <VariablePicker 
                    onSelect={handleSubjectVariableInsert}
                    customFields={customFields}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Logo Upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Logo</CardTitle>
                <CardDescription>
                  Add your logo to the email header (optional)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LogoUpload
                  formId={formId}
                  logoUrl={logoUrl}
                  onLogoChange={handleLogoChange}
                  onError={handleLogoError}
                />
              </CardContent>
            </Card>

            {/* Body Editor */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Email Body</CardTitle>
                    <CardDescription>
                      Customize the content of your notification email
                    </CardDescription>
                  </div>
                  <VariablePicker
                    onSelect={handleBodyVariableInsert}
                    buttonVariant="ghost"
                    customFields={customFields}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`border rounded-md overflow-hidden ${validationErrors.body ? "border-destructive" : ""}`}>
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={body}
                    onChange={setBody}
                    modules={quillModules}
                    formats={quillFormats}
                    className="[&_.ql-container]:min-h-[200px] [&_.ql-editor]:min-h-[200px]"
                  />
                </div>
                <div className="flex justify-between mt-2">
                  {validationErrors.body ? (
                    <p className="text-xs text-destructive">{validationErrors.body}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Click "Variables" to insert dynamic content
                    </p>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {(new Blob([body]).size / 1024).toFixed(1)}KB / {MAX_BODY_SIZE / 1024}KB
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => setTestEmailDialogOpen(true)}
              >
                <Send className="h-4 w-4 mr-2" />
                Send Test Email
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || hasValidationErrors}
                className="bg-primary hover:bg-primary/90"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSaving ? "Saving..." : "Save Template"}
              </Button>
              <Button variant="ghost" onClick={() => setResetDialogOpen(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            </div>
          </div>

          {/* Preview Section - 40% */}
          <div className="lg:col-span-2 lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Live Preview
                </CardTitle>
                <CardDescription>
                  See how your email will look
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden bg-card">
                  {/* Email Header Preview */}
                  <div className="bg-muted px-4 py-3 border-b">
                    <div className="space-y-1">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="font-medium text-muted-foreground shrink-0">To:</span>
                        <span className="text-foreground">you@example.com</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="font-medium text-muted-foreground shrink-0">Subject:</span>
                        <span className="text-foreground">{getPreviewSubject()}</span>
                      </div>
                    </div>
                  </div>
                  {/* Email Body Preview */}
                  <div
                    className="p-4 prose prose-sm max-w-none [&_img]:max-w-[150px] [&_h2]:text-primary [&_h2]:mt-0"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(getPreviewContent(), {
                        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'hr', 'ul', 'ol', 'li', 'a', 'img', 'span', 'div'],
                        ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'width', 'height', 'target', 'rel'],
                      })
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Preview shows sample data. Actual emails will use real submission data.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Using Default Template</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Enable custom email template above to personalize the notification
              emails sent when this form receives submissions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Test Email Dialog */}
      <Dialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Enter your email address to receive a test email with the current
              template.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="test-email">Email Address</Label>
            <Input
              id="test-email"
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              A test email with the current template will be sent to this address.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTestEmailDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendTestEmail}
              disabled={isSendingTest}
            >
              {isSendingTest ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {isSendingTest ? "Sending..." : "Send Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to Default Template?</DialogTitle>
            <DialogDescription>
              This will reset the subject and body to the default template.
              Your logo will not be affected. You&apos;ll need to click Save to apply the changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
