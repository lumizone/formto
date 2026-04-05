import { useState } from "react"
import { Image, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LogoUpload({ logoUrl, onLogoChange, disabled = false }) {
  const [inputValue, setInputValue] = useState(logoUrl || "")
  const [imgError, setImgError]     = useState(false)

  const handleApply = () => {
    const url = inputValue.trim()
    onLogoChange(url || null)
    setImgError(false)
  }

  const handleRemove = () => {
    setInputValue("")
    onLogoChange(null)
    setImgError(false)
  }

  return (
    <div className="space-y-3">
      {logoUrl && !imgError ? (
        <div className="space-y-3">
          <div className="relative inline-block">
            <div className="border rounded-lg p-4 bg-muted/30">
              <img
                src={logoUrl}
                alt="Logo preview"
                className="max-w-[150px] max-h-[80px] object-contain"
                onError={() => setImgError(true)}
              />
            </div>
            <Button
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              onClick={handleRemove}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{logoUrl}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg text-center text-muted-foreground">
            <Image className="h-5 w-5 shrink-0" />
            <p className="text-sm">Enter a publicly accessible URL for your logo</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/logo.png"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              disabled={disabled}
            />
            <Button variant="outline" onClick={handleApply} disabled={disabled || !inputValue.trim()}>
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">PNG or JPG recommended</p>
        </div>
      )}
    </div>
  )
}
