import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date))
}

export function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num)
}

export function truncate(str, length = 50) {
  if (!str) return ""
  return str.length > length ? str.slice(0, length) + "..." : str
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input
  
  // Trim whitespace
  let sanitized = input.trim()
  
  // Remove potential XSS
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
  
  return sanitized
}

/**
 * Validate input with options
 */
export function validateInput(input, options = {}) {
  const {
    maxLength = Infinity,
    minLength = 0,
    required = false,
    pattern = null,
  } = options
  
  if (required && (!input || input.trim() === '')) {
    return { valid: false, error: 'This field is required' }
  }
  
  if (input && input.length > maxLength) {
    return { valid: false, error: `Maximum length is ${maxLength} characters` }
  }
  
  if (input && input.length < minLength) {
    return { valid: false, error: `Minimum length is ${minLength} characters` }
  }
  
  if (pattern && input && !pattern.test(input)) {
    return { valid: false, error: 'Invalid format' }
  }
  
  return { valid: true }
}

/**
 * Validate URL - only allows http:// and https://
 */
export function isValidUrl(url) {
  if (!url || url.trim() === '') return true // Optional field
  
  try {
    const parsedUrl = new URL(url)
    // Only allow http and https protocols
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Returns a human-readable relative time string ("2 minutes ago")
 */
export function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(date)
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  if (!email || email.trim() === '') return true // Optional field
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}
