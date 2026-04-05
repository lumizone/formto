import { useState } from "react"
import { ChevronDown, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const defaultVariables = [
  {
    name: "name",
    variable: "{{name}}",
    description: "The submitter's name from the form",
  },
  {
    name: "email",
    variable: "{{email}}",
    description: "The submitter's email address",
  },
  {
    name: "message",
    variable: "{{message}}",
    description: "The message content from the form",
  },
  {
    name: "phone",
    variable: "{{phone}}",
    description: "The submitter's phone number",
  },
  {
    name: "form_name",
    variable: "{{form_name}}",
    description: "The name of the form",
  },
  {
    name: "date",
    variable: "{{date}}",
    description: "The submission date and time",
  },
  {
    name: "logo",
    variable: "{{logo}}",
    description: "Your uploaded logo image",
  },
]

export default function VariablePicker({
  onSelect,
  customFields = [],
  buttonVariant = "outline",
  buttonSize = "sm",
  showLabel = true,
}) {
  const [copiedVariable, setCopiedVariable] = useState(null)

  const allVariables = [
    ...defaultVariables,
    ...customFields.map((field) => ({
      name: field,
      variable: `{{${field}}}`,
      description: `Custom field: ${field}`,
    })),
  ]

  const handleSelect = (variable) => {
    if (onSelect) {
      onSelect(variable)
    } else {
      navigator.clipboard.writeText(variable)
      setCopiedVariable(variable)
      setTimeout(() => setCopiedVariable(null), 1500)
    }
  }

  return (
    <TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={buttonVariant} size={buttonSize}>
            {showLabel && <span className="mr-1">Variables</span>}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Insert Variable</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-64 overflow-y-auto">
            {allVariables.map((item) => (
              <Tooltip key={item.variable}>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    onClick={() => handleSelect(item.variable)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {item.variable}
                      </code>
                      <span className="text-sm text-muted-foreground">
                        {item.name}
                      </span>
                    </div>
                    {copiedVariable === item.variable ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p className="text-xs">{item.description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <p className="text-xs text-muted-foreground">
              Click to {onSelect ? "insert" : "copy"} variable
            </p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
}
