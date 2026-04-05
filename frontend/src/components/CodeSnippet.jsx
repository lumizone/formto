import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const BASE_URL = import.meta.env.VITE_API_BASE_URL || window.location.origin

const getHtmlSnippet = (endpoint) => `<form action="${BASE_URL}/f/${endpoint}" method="POST">
  <input type="text" name="name" placeholder="Your name" required />
  <input type="email" name="email" placeholder="Your email" required />
  <textarea name="message" placeholder="Your message" required></textarea>
  <button type="submit">Send</button>
</form>`

const getJsSnippet = (endpoint) => `const formData = {
  name: "John Doe",
  email: "john@example.com",
  message: "Hello from JavaScript!"
};

fetch("${BASE_URL}/f/${endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(formData)
})
.then(response => response.json())
.then(data => console.log("Success:", data))
.catch(error => console.error("Error:", error));`

const getReactSnippet = (endpoint) => `import { useState } from "react";

function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: ""
  });
  const [status, setStatus] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("sending");

    try {
      const response = await fetch(
        "${BASE_URL}/f/${endpoint}",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData)
        }
      );

      if (response.ok) {
        setStatus("success");
        setFormData({ name: "", email: "", message: "" });
      } else {
        setStatus("error");
      }
    } catch (error) {
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        name="name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Your name"
        required
      />
      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Your email"
        required
      />
      <textarea
        name="message"
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        placeholder="Your message"
        required
      />
      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending..." : "Send"}
      </button>
      {status === "success" && <p>Message sent successfully!</p>}
      {status === "error" && <p>Something went wrong. Please try again.</p>}
    </form>
  );
}`

const getCurlSnippet = (endpoint) => `curl -X POST ${BASE_URL}/f/${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Hello from cURL!"
  }'`

const getFileUploadSnippet = (endpoint) => `<form action="${BASE_URL}/f/${endpoint}"
      method="POST"
      enctype="multipart/form-data">
  <input type="text" name="name" placeholder="Your name" required />
  <input type="email" name="email" placeholder="Your email" required />
  <textarea name="message" placeholder="Your message"></textarea>

  <!-- Single file upload -->
  <input type="file" name="attachment" accept=".pdf,.doc,.docx,.jpg,.png" />

  <!-- Multiple files -->
  <!-- <input type="file" name="files" multiple /> -->

  <button type="submit">Send with attachment</button>
</form>

<!--
  Supported file types: PDF, Word, Excel, images (JPG, PNG, GIF, WebP), ZIP, TXT, CSV
  Max file size configured via MAX_FILE_SIZE_MB environment variable (default: 10MB)
-->`

export default function CodeSnippet({ endpoint }) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("html")

  const snippets = {
    html: getHtmlSnippet(endpoint),
    javascript: getJsSnippet(endpoint),
    react: getReactSnippet(endpoint),
    curl: getCurlSnippet(endpoint),
    fileupload: getFileUploadSnippet(endpoint),
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integration Code</CardTitle>
        <CardDescription>
          Copy and paste this code into your website to start collecting submissions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="html">HTML</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              <TabsTrigger value="react">React</TabsTrigger>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="fileupload">File Upload</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {Object.entries(snippets).map(([key, code]) => (
            <TabsContent key={key} value={key} className="mt-0">
              <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-sm">
                <code>{code}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
